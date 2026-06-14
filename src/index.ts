import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";

// ─── Session state ───────────────────────────────────────────────────

const sessionReviewIds = new Set<string>();
const sessionApproveAll = new Set<string>(); // review IDs auto-approved
let projectCwd: string | null = null;


// ─── Helper: check if VS Code is watching this project ─────────────

function isVscodeReady(cwd: string): boolean {
    try {
        const readyFile = join(cwd, '.pi', '.vscode-ready');
        if (!existsSync(readyFile)) return false;
        const ts = parseInt(readFileSync(readyFile, 'utf-8').trim(), 10);
        if (isNaN(ts)) return false;
        // Timestamp must be within last 30 seconds (heartbeat = 15s interval)
        return Date.now() - ts < 30_000;
    } catch {
        return false;
    }
}

type ReviewOutcome =
    | { status: "approved"; final: string }
    | { status: "rejected" }
    | { status: "rethink"; prompt: string }
    | { status: "timeout" };

async function createReviewAndWait(
    ctx: ExtensionContext,
    filePath: string,
    original: string,
    proposed: string,
    description: string,
): Promise<ReviewOutcome> {
    // Normalize path: LLM may pass absolute-looking path without leading /
    const normalizedPath = resolveSafe(ctx.cwd, filePath);
    const uuid = randomUUID();
    const resultsDir = join(ctx.cwd, ".pi", "review-results");
    mkdirSync(resultsDir, { recursive: true });

    sessionReviewIds.add(uuid);

    // Check if approve-all was already chosen
    if (sessionApproveAll.size > 0) {
        writeSyncResult(resultsDir, uuid, "approved", proposed);
        return { status: "approved", final: proposed };
    }

    // Detect whether VS Code is open with this project.
    // If not: skip writing review-requests (orphan files) and polling (wasted cycles).
    // Fall back to TUI-only review.
    const vscodeReady = isVscodeReady(ctx.cwd);

    let pollPromise: Promise<{ action: string; prompt?: string }>;
    let tuiController: AbortController;

    if (vscodeReady) {
        const requestsDir = join(ctx.cwd, ".pi", "review-requests");
        mkdirSync(requestsDir, { recursive: true });

        const reviewRequest = {
            id: uuid,
            title: description,
            files: [{ path: normalizedPath, original, proposed, description }],
        };
        writeFileSync(join(requestsDir, `${uuid}.json`), JSON.stringify(reviewRequest, null, 2), "utf-8");
        ctx.ui.notify(`📝 Review: ${filePath} — check VS Code diff`, "info");

        const resultPath = join(resultsDir, `${uuid}.json`);
        const deadline = Date.now() + 10 * 60 * 1000;
        tuiController = new AbortController();
        pollPromise = pollResultFile(resultPath, deadline, 500);
    } else {
        ctx.ui.notify(`📝 Review: ${filePath} — VS Code not open, terminal only`, "info");
        tuiController = new AbortController();
        // Never resolves — VS Code can't respond
        pollPromise = new Promise(() => {});
    }

    // Show TUI selector (always, regardless of VS Code status)
    const tuiPromise = showTuiSelector(ctx, filePath, { signal: tuiController.signal });

    const outcome = await Promise.race([tuiPromise, pollPromise]);

    // If poll resolved first (VS Code responded), dismiss the TUI selector.
    // Without this, the TUI stays on screen even after the review is done.
    if (outcome.action === "file-approved" || outcome.action === "file-rejected") {
        tuiController.abort();
        // Wait for TUI to close gracefully (aborted select resolves quickly)
        await tuiPromise.catch(() => { });
    }

    // ── Process outcome (return result, never throw) ──

    if (outcome.action === "abort") {
        writeSyncResult(resultsDir, uuid, "rejected");
        ctx.abort();
        return { status: "rejected" };
    }

    if (outcome.action === "rethink") {
        writeSyncResult(resultsDir, uuid, "rejected");
        return { status: "rethink", prompt: outcome.prompt! };
    }

    if (outcome.action === "file-rejected") {
        return { status: "rejected" };
    }
    if (outcome.action === "rejected") {
        writeSyncResult(resultsDir, uuid, "rejected");
        return { status: "rejected" };
    }
    if (outcome.action === "file-approved") {
        return { status: "approved", final: proposed };
    }
    if (outcome.action === "approved") {
        writeSyncResult(resultsDir, uuid, "approved", proposed);
        return { status: "approved", final: proposed };
    }
    if (outcome.action === "approve-all") {
        for (const rid of sessionReviewIds) {
            sessionApproveAll.add(rid);
        }
        writeSyncResult(resultsDir, uuid, "approved", proposed);
        return { status: "approved", final: proposed };
    }

    return { status: "timeout" };
}

function writeSyncResult(resultsDir: string, uuid: string, status: "approved" | "rejected", content?: string) {
    writeFileSync(
        join(resultsDir, `${uuid}.json`),
        JSON.stringify(
            {
                id: uuid,
                files: [{ path: "", status, final: content ?? "" }],
            },
            null,
            2,
        ),
        "utf-8",
    );
}

async function pollResultFile(resultPath: string, deadline: number, interval = 500): Promise<{ action: string; prompt?: string }> {
    while (Date.now() < deadline) {
        try {
            if (existsSync(resultPath)) {
                const raw = readFileSync(resultPath, "utf-8");
                if (!raw.trim()) {
                    // File exists but is empty — still being written, retry next cycle
                    await sleep(interval);
                    continue;
                }
                const result = JSON.parse(raw);
                const fileResult = result.files?.[0];
                if (result.status === "rejected" || fileResult?.status === "rejected") {
                    return { action: "file-rejected" };
                }
                return { action: "file-approved" };
            }
        } catch {
            // File may be partially written or malformed — retry
        }
        await sleep(interval);
    }
    return { action: "timeout" };
}

async function showTuiSelector(
    ctx: ExtensionContext,
    filePath: string,
    opts?: { signal?: AbortSignal },
): Promise<{ action: string; prompt?: string }> {
    const choice = await ctx.ui.select(
        `📝 Review: ${filePath}`,
        [
            "✅ Approve",
            "❌ Reject",
            "💭 Rethink",
            "⭐ Approve All for this session",
            "🚪 Abort",
        ],
        opts,
    );

    if (!choice) return { action: "timeout" };
    if (choice.startsWith("🚪")) return { action: "abort" };
    if (choice.startsWith("⭐")) return { action: "approve-all" };
    if (choice.startsWith("💭")) {
        const prompt = await ctx.ui.input(
            "🔄 Rethink — what should the agent reconsider?",
            "Describe what needs to change...",
            opts,
        );
        if (!prompt || !prompt.trim()) return { action: "rejected" };
        return { action: "rethink", prompt: prompt.trim() };
    }
    if (choice.startsWith("✅")) return { action: "approved" };
    if (choice.startsWith("❌")) return { action: "rejected" };
    return { action: "timeout" };
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

// ─── Apply edits in-memory (mirrors built-in edit logic) ─────────────

function applyEdits(content: string, edits: Array<{ oldText: string; newText: string }>): string {
    let result = content;
    for (const edit of edits) {
        const idx = result.indexOf(edit.oldText);
        if (idx === -1) {
            throw new Error(`oldText not found in file`);
        }
        const nextIdx = result.indexOf(edit.oldText, idx + 1);
        if (nextIdx !== -1) {
            throw new Error(`oldText is not unique in file`);
        }
        result = result.replace(edit.oldText, edit.newText);
    }
    return result;
}

// ─── Path normalization ──────────────────────────────────────────────

/**
 * Safe path resolution. If the LLM passes an absolute-looking path
 * without a leading slash (e.g. "home/user/project/file.ts"), resolve()
 * treats it as relative and doubles the cwd. Detect and fix this.
 */
function resolveSafe(cwd: string, filePath: string): string {
    // Strip leading/trailing slashes from cwd for comparison
    const cwdClean = cwd.replace(/\/+$/, "").replace(/^\//, "");
    // If filePath starts with cwdClean/ (LLM forgot the leading /),
    // strip it so resolve doesn't double.
    if (filePath.startsWith(cwdClean + "/")) {
        filePath = filePath.substring(cwdClean.length + 1);
    }
    return resolve(cwd, filePath);
}

// ─── Override `write` ────────────────────────────────────────────────

function registerWriteOverride(pi: ExtensionAPI) {
    pi.registerTool({
        name: "write",
        label: "write (with review)",
        description:
            "Write content to a file. Instead of writing directly, creates a review request so the user " +
            "can approve or reject the change in VS Code or directly in the terminal. Returns only after " +
            "the user makes a decision.",
        promptSnippet: "Create or overwrite files with user review",
        promptGuidelines: [
            "Use write for any file creation or complete rewrite — user review is required.",
            "The tool blocks until the user approves or rejects.",
            "If content is identical to existing file, no review is created.",
        ],
        parameters: Type.Object({
            path: Type.String({ description: "Path to the file to write (relative or absolute)" }),
            content: Type.String({ description: "Content to write to the file" }),
        }),
        executionMode: "sequential" as const,

        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            projectCwd = ctx.cwd;
            const absolutePath = resolveSafe(ctx.cwd, params.path);
            let original = "";
            let fileExists = false;
            try {
                original = readFileSync(absolutePath, "utf-8");
                fileExists = true;
            } catch {
                // new file
            }

            if (fileExists && original === params.content) {
                return {
                    content: [{ type: "text", text: `No changes — ${params.path} content is identical.` }],
                    details: { path: params.path, status: "no-change" },
                };
            }

            const description = fileExists ? `Update: ${params.path}` : `Create: ${params.path}`;
            const result = await createReviewAndWait(ctx, params.path, original, params.content, description);

            switch (result.status) {
                case "timeout":
                    return {
                        content: [{ type: "text", text: `⏰ Review timed out for ${params.path} (10m)` }],
                        details: { path: params.path, status: "timeout" },
                    };
                case "approved":
                    return withFileMutationQueue(absolutePath, async () => {
                        mkdirSync(dirname(absolutePath), { recursive: true });
                        writeFileSync(absolutePath, result.final, "utf-8");
                        return {
                            content: [{ type: "text", text: `✅ ${params.path} — approved (${result.final.length} bytes)` }],
                            details: { path: params.path, status: "approved", bytes: result.final.length },
                        };
                    });
                case "rethink":
                    return {
                        isError: true,
                        content: [{ type: "text", text: `🔄 ${params.path} — rethinking requested: "${result.prompt}"\nPlease reconsider your changes based on this feedback.` }],
                        details: { path: params.path, status: "rethink", prompt: result.prompt },
                    };
                case "rejected":
                    return {
                        isError: true,
                        content: [{ type: "text", text: `❌ ${params.path} — change REJECTED by user. File was NOT modified.` }],
                        details: { path: params.path, status: "rejected" },
                    };
                default:
                    throw new Error(`Unexpected review status: ${(result as any).status}`);
            }
        },
    });
}

// ─── Override `edit` ─────────────────────────────────────────────────

function registerEditOverride(pi: ExtensionAPI) {
    pi.registerTool({
        name: "edit",
        label: "edit (with review)",
        description:
            "Edit a file by replacing exact text passages. Instead of editing directly, creates a review " +
            "request so the user can approve or reject in VS Code or directly in the terminal.",
        promptSnippet: "Make targeted edits to existing files with user review",
        promptGuidelines: [
            "Use edit for targeted changes to existing files — user review is required.",
            "The tool blocks until the user approves or rejects.",
        ],
        parameters: Type.Object({
            path: Type.String({ description: "Path to the file to edit (relative or absolute)" }),
            edits: Type.Array(
                Type.Object({
                    oldText: Type.String({ description: "Exact unique text to replace" }),
                    newText: Type.String({ description: "Replacement text" }),
                }),
                {
                    description:
                        "Targeted replacements. Each oldText must be unique and non-overlapping.",
                },
            ),
        }),
        executionMode: "sequential" as const,

        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            projectCwd = ctx.cwd;
            const absolutePath = resolveSafe(ctx.cwd, params.path);

            let original: string;
            try {
                original = readFileSync(absolutePath, "utf-8");
            } catch {
                return {
                    content: [{ type: "text", text: `❌ File not found: ${params.path}` }],
                    details: { path: params.path, status: "error", error: "not found" },
                };
            }

            // Apply edits in-memory to get proposed content
            let proposed: string;
            try {
                proposed = applyEdits(original, params.edits);
            } catch (e: any) {
                return {
                    content: [{ type: "text", text: `❌ Edit failed: ${e.message} in ${params.path}` }],
                    details: { path: params.path, status: "error", error: e.message },
                };
            }

            if (original === proposed) {
                return {
                    content: [{ type: "text", text: `No changes — ${params.path} content is identical after edits.` }],
                    details: { path: params.path, status: "no-change" },
                };
            }

            const result = await createReviewAndWait(ctx, params.path, original, proposed, `Edit: ${params.path}`);

            switch (result.status) {
                case "timeout":
                    return {
                        content: [{ type: "text", text: `⏰ Review timed out for ${params.path} (10m)` }],
                        details: { path: params.path, status: "timeout" },
                    };
                case "approved":
                    return withFileMutationQueue(absolutePath, async () => {
                        mkdirSync(dirname(absolutePath), { recursive: true });
                        writeFileSync(absolutePath, result.final, "utf-8");
                        return {
                            content: [{ type: "text", text: `✅ ${params.path} — edit approved (${result.final.length} bytes)` }],
                            details: { path: params.path, status: "approved", bytes: result.final.length },
                        };
                    });
                case "rethink":
                    return {
                        isError: true,
                        content: [{ type: "text", text: `🔄 ${params.path} — rethinking requested: "${result.prompt}"\nPlease reconsider your changes based on this feedback.` }],
                        details: { path: params.path, status: "rethink", prompt: result.prompt },
                    };
                case "rejected":
                    return {
                        isError: true,
                        content: [{ type: "text", text: `❌ ${params.path} — edit REJECTED by user. File was NOT modified.` }],
                        details: { path: params.path, status: "rejected" },
                    };
                default:
                    throw new Error(`Unexpected review status: ${(result as any).status}`);
            }
        },
    });
}

// ─── Extension entry point ───────────────────────────────────────────

export default function (pi: ExtensionAPI) {
    // Reset review ID tracking on new session
    pi.on("session_start", () => {
        sessionReviewIds.clear();
    });

    // Reset Approve All on message boundaries
    const clearApproveAll = () => {
        sessionApproveAll.clear();
    };
    pi.on("message_start", clearApproveAll);
    pi.on("message_end", () => {
        clearApproveAll();
        cleanupPiDir();
    });

    registerWriteOverride(pi);
    registerEditOverride(pi);
}

function cleanupPiDir() {
    if (!projectCwd) return;
    // Clean up all .pi subdirectories: tmp files, pending requests, and results.
    // After message_end, every review is resolved — no files are needed anymore.
    for (const sub of ["tmp", "review-requests", "review-results"]) {
        const dir = join(projectCwd, ".pi", sub);
        try {
            const files = readdirSync(dir);
            for (const f of files) {
                rmSync(join(dir, f), { recursive: true, force: true });
            }
        } catch {
            // Directory doesn't exist or is empty — ok
        }
    }
}
