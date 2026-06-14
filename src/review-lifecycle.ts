import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { resolveSafe } from "../shared/path-utils.js";

// ─── Session state ───────────────────────────────────────────────────

export const sessionReviewIds = new Set<string>();
export const sessionApproveAll = new Set<string>(); // review IDs auto-approved
export let projectCwd: string | null = null;
export let vscodeNotOpenWarned = false;

export function setProjectCwd(cwd: string | null): void {
    projectCwd = cwd;
}

export function setVscodeNotOpenWarned(value: boolean): void {
    vscodeNotOpenWarned = value;
}


// ─── Helper: check if VS Code is watching this project ─────────────

export function isVscodeReady(cwd: string): boolean {
    try {
        const readyFile = join(cwd, ".pi", ".vscode-ready");
        if (!existsSync(readyFile)) return false;
        const ts = parseInt(readFileSync(readyFile, "utf-8").trim(), 10);
        if (isNaN(ts)) return false;
        // Timestamp must be within last 30 seconds (heartbeat = 15s interval)
        return Date.now() - ts < 30_000;
    } catch {
        return false;
    }
}

export type ReviewOutcome =
    | { status: "approved"; final: string }
    | { status: "rejected" }
    | { status: "rethink"; prompt: string }
    | { status: "timeout" };


// ─── Create review request, poll for result, race TUI vs VS Code ──

export async function createReviewAndWait(
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
    // If not: bypass review entirely — direct write, no TUI, no polling.
    // Warning is shown once at session_start, not here on every tool call.
    if (!isVscodeReady(ctx.cwd)) {
        return { status: "approved", final: proposed };
    }

    // VS Code is open — create review request, poll for results, show TUI
    const requestsDir = join(ctx.cwd, ".pi", "review-requests");
    mkdirSync(requestsDir, { recursive: true });

    const reviewRequest = {
        id: uuid,
        title: description,
        files: [{ path: normalizedPath, original, proposed, description }],
    };
    writeFileSync(join(requestsDir, `${uuid}.json`), JSON.stringify(reviewRequest, null, 2), "utf-8");
    ctx.ui.notify(`\u{1F4DD} Review: ${filePath} — check VS Code diff`, "info");

    // TUI selector races with VS Code result polling
    const resultPath = join(resultsDir, `${uuid}.json`);
    const deadline = Date.now() + 10 * 60 * 1000;
    const tuiController = new AbortController();
    const tuiPromise = showTuiSelector(ctx, filePath, { signal: tuiController.signal });
    const pollPromise = pollResultFile(resultPath, deadline, 500);

    const outcome = await Promise.race([tuiPromise, pollPromise]);

    // If poll resolved first (VS Code responded), dismiss the TUI selector
    if (outcome.action === "file-approved" || outcome.action === "file-rejected") {
        tuiController.abort();
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


// ─── Write result file ───────────────────────────────────────────────

export function writeSyncResult(resultsDir: string, uuid: string, status: "approved" | "rejected", content?: string) {
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


// ─── Poll result file (VS Code writes results here) ─────────────────

export async function pollResultFile(resultPath: string, deadline: number, interval = 500): Promise<{ action: string; prompt?: string }> {
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


// ─── TUI selector (approve/reject/rethink/abort) ────────────────────

export async function showTuiSelector(
    ctx: ExtensionContext,
    filePath: string,
    opts?: { signal?: AbortSignal },
): Promise<{ action: string; prompt?: string }> {
    const choice = await ctx.ui.select(
        `\u{1F4DD} Review: ${filePath}`,
        [
            "✅ Approve",
            "❌ Reject",
            "\u{1F4AD} Rethink",
            "⭐ Approve All for this session",
            "\u{1F6AA} Abort",
        ],
        opts,
    );

    if (!choice) return { action: "timeout" };
    if (choice.startsWith("\u{1F6AA}")) return { action: "abort" };
    if (choice.startsWith("⭐")) return { action: "approve-all" };
    if (choice.startsWith("\u{1F4AD}")) {
        const prompt = await ctx.ui.input(
            "\u{1F504} Rethink — what should the agent reconsider?",
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


// ─── Sleep helper ─────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}


// ─── Apply edits in-memory (mirrors built-in edit logic) ─────────────

export function applyEdits(content: string, edits: Array<{ oldText: string; newText: string }>): string {
    let result = content;
    for (const edit of edits) {
        const idx = result.indexOf(edit.oldText);
        if (idx === -1) {
            throw new Error("oldText not found in file");
        }
        const nextIdx = result.indexOf(edit.oldText, idx + 1);
        if (nextIdx !== -1) {
            throw new Error("oldText is not unique in file");
        }
        result = result.replace(edit.oldText, edit.newText);
    }
    return result;
}


// ─── Cleanup Pi directories after message end ───────────────────────

export function cleanupPiDir() {
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
