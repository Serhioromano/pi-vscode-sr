import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { resolveSafe } from "../shared/path-utils.js";
import {
    applyEdits,
    createReviewAndWait,
    setProjectCwd,
    sessionReviewIds,
    sessionApproveAll,
    setVscodeNotOpenWarned,
    isVscodeReady,
    cleanupPiDir,
} from "./review-lifecycle.js";

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
            setProjectCwd(ctx.cwd);
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
            setProjectCwd(ctx.cwd);
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
    // Reset review ID tracking on new session.
    // Re-check VS Code availability — user may have opened/closed VS Code since last session.
    pi.on("session_start", () => {
        sessionReviewIds.clear();
        sessionApproveAll.clear();
        setVscodeNotOpenWarned(false);

        const cwd = process.cwd();
        if (!isVscodeReady(cwd)) {
            console.warn(
                "⚠️  VS Code not detected — working without diff review. " +
                "All file changes will be applied directly. " +
                "Open this project in VS Code with Serhioromano.vscode-pi-sr extension " +
                "installed to enable visual review."
            );
            setVscodeNotOpenWarned(true);
        }
    });

    // Approve All persists across turns within one prompt.
    // before_agent_start fires once per user prompt — clears here.
    pi.on("before_agent_start", () => {
        sessionApproveAll.clear();
    });

    pi.on("message_end", () => {
        cleanupPiDir();
    });

    registerWriteOverride(pi);
    registerEditOverride(pi);
}
