import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";

// ─── Session state ───────────────────────────────────────────────────

const sessionReviewIds = new Set<string>();
const sessionApproveAll = new Set<string>(); // review IDs auto-approved


// ─── Helper: create review request and wait for result ───────────────

type ReviewOutcome =
  | { status: "approved"; final: string }
  | { status: "rejected" }
  | { status: "timeout" };

async function createReviewAndWait(
  ctx: ExtensionContext,
  filePath: string,
  original: string,
  proposed: string,
  description: string,
): Promise<ReviewOutcome> {
  const uuid = randomUUID();
  const requestsDir = join(ctx.cwd, ".pi", "review-requests");
  const resultsDir = join(ctx.cwd, ".pi", "review-results");
  mkdirSync(requestsDir, { recursive: true });
  mkdirSync(resultsDir, { recursive: true });

  const reviewRequest = {
    id: uuid,
    title: description,
    files: [{ path: filePath, original, proposed, description }],
  };

  writeFileSync(join(requestsDir, `${uuid}.json`), JSON.stringify(reviewRequest, null, 2), "utf-8");
  ctx.ui.notify(`📝 Review: ${filePath} — check VS Code diff`, "info");

  sessionReviewIds.add(uuid);

  // Check if approve-all was already chosen
  if (sessionApproveAll.size > 0) {
    writeSyncResult(resultsDir, uuid, "approved", proposed);
    return { status: "approved", final: proposed };
  }

  // Phase 1: give VS Code a head start (2s, poll every 100ms) so TUI doesn't
  // pop up when the user is already reviewing in editor.
  // 2 seconds with 100ms intervals = 20 checks — catches VS Code response quickly.
  const resultPath = join(resultsDir, `${uuid}.json`);
  const deadline = Date.now() + 10 * 60 * 1000;

  const early = await pollResultFile(resultPath, Date.now() + 2000, 100);
  if (early !== "timeout") {
    if (early === "file-rejected") return { status: "rejected" };
    return { status: "approved", final: proposed };
  }

  // Sync check: VS Code may have written the result file between poll intervals.
  if (existsSync(resultPath)) {
    const result = JSON.parse(readFileSync(resultPath, "utf-8"));
    if (result.status === "rejected" || result.files?.[0]?.status === "rejected") {
      return { status: "rejected" };
    }
    return { status: "approved", final: proposed };
  }

  // Phase 2: show TUI and keep polling VS Code in parallel (every 500ms)
  const tuiPromise = showTuiSelector(ctx, filePath);
  const pollPromise = pollResultFile(resultPath, deadline, 500);

  const outcome = await Promise.race([tuiPromise, pollPromise]);

  // ── Process outcome (return result, never throw) ──

  if (outcome === "abort") {
    writeSyncResult(resultsDir, uuid, "rejected");
    ctx.abort();
    return { status: "rejected" };
  }

  if (outcome === "file-rejected" || outcome === "rejected") {
    return { status: "rejected" };
  }
  if (outcome === "file-approved" || outcome === "approved") {
    return { status: "approved", final: proposed };
  }
  if (outcome === "approve-all") {
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

async function pollResultFile(resultPath: string, deadline: number, interval = 500): Promise<string> {
  while (Date.now() < deadline) {
    try {
      if (existsSync(resultPath)) {
        const raw = readFileSync(resultPath, "utf-8");
        if (!raw.trim()) {
          // File exists but is empty — still being written
          await sleep(200);
          continue;
        }
        const result = JSON.parse(raw);
        const fileResult = result.files?.[0];
        if (result.status === "rejected" || fileResult?.status === "rejected") {
          return "file-rejected";
        }
        return "file-approved";
      }
    } catch {
      // File may be partially written or malformed — retry
    }
    await sleep(interval);
  }
  return "timeout";
}

async function showTuiSelector(ctx: ExtensionContext, filePath: string): Promise<string> {
  const choice = await ctx.ui.select(
    `📝 Review: ${filePath}`,
    [
      "✅ Approve",
      "❌ Reject",
      "⭐ Approve All for this session",
      "🚪 Abort",
    ],
  );

  if (!choice) return "timeout";
  if (choice.startsWith("🚪")) return "abort";
  if (choice.startsWith("⭐")) return "approve-all";
  if (choice.startsWith("✅")) return "approved";
  if (choice.startsWith("❌")) return "rejected";
  return "timeout";
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
      const absolutePath = resolve(ctx.cwd, params.path);
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
      const absolutePath = resolve(ctx.cwd, params.path);

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
  pi.on("message_end", clearApproveAll);

  registerWriteOverride(pi);
  registerEditOverride(pi);
}
