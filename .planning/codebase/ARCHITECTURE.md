<!-- refreshed: 2026-06-14 -->
# Architecture

**Analysis Date:** 2026-06-14

## System Overview

This is a **dual-package project** — a pi AI agent extension (npm package) plus a companion VS Code extension that provides a visual diff-review UI. The pi agent extension overrides the `write` and `edit` tools to intercept file mutations and route them through a human-in-the-loop review process.

```text
┌──────────────────────────────────────────────────────────────────┐
│                      TERMINAL (pi AI Agent)                      │
│                                                                  │
│  ┌──────────────────────────────────────────┐                    │
│  │  @earendil-works/pi-coding-agent         │                    │
│  │  (pi framework — CLI, LLM, tools, TUI)   │                    │
│  └────────────┬─────────────────────────────┘                    │
│               │                                                  │
│  ┌────────────▼─────────────────────────────┐                    │
│  │  pi-vscode-sr (this package)             │                    │
│  │  `src/index.ts`                          │                    │
│  │                                          │                    │
│  │  • Overrides write/edit tools            │                    │
│  │  • Manages review lifecycle              │                    │
│  │  • TUI selector (Approve/Reject/Rethink) │                    │
│  │  • Detects VS Code readiness             │                    │
│  └────────────┬─────────────────────────────┘                    │
│               │                                                  │
│         File-based IPC (.pi/ directory)                          │
│               │                                                  │
└──────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                    VS CODE EXTENSION                              │
│                    `vscode-ext/src/extension.ts`                  │
│                                                                   │
│  • Heartbeat signal (proves VS Code is open)                     │
│  • Watches .pi/review-requests/ for new reviews                  │
│  • Opens diff editors for each proposed change                   │
│  • Title bar buttons: Approve / Reject                           │
│  • Writes results to .pi/review-results/                         │
│  • Cleans up temp files                                          │
└──────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Pi Extension Entry | Registers tools and event handlers with the pi framework | `src/index.ts:421-453` |
| Write Override | Captures `write` tool calls, creates review requests | `src/index.ts:246-320` |
| Edit Override | Captures `edit` tool calls, creates review requests | `src/index.ts:324-417` |
| Review Lifecycle | Creates review JSON, polls for results, races TUI vs VS Code | `src/index.ts:37-128` |
| TUI Selector | Inline terminal UI for approve/reject/rethink/abort | `src/index.ts:170-202` |
| VS Code Activation | Sets up heartbeat, file watchers, commands, recovers pending reviews | `vscode-ext/src/extension.ts:19-66` |
| VS Code Diff Handler | Creates temp files, opens diff editor for each review file | `vscode-ext/src/extension.ts:93-148` |
| VS Code Approve/Reject | Applies or discards changes from diff editor | `vscode-ext/src/extension.ts:175-223` |
| VS Code Result Handler | Processes results written by pi TUI, closes diff tabs | `vscode-ext/src/extension.ts:227-288` |
| VS Code Review Completer | Aggregates per-file results, writes final result JSON | `vscode-ext/src/extension.ts:292-368` |

## Pattern Overview

**Overall:** Event-driven extension architecture (pi framework) paired with a file-based IPC bridge to a VS Code companion extension.

**Key Characteristics:**
- **Tool override pattern** — The pi framework provides default `write` and `edit` tools; this extension replaces them with review-enabled versions that intercept the LLM's file mutations.
- **File-based inter-process communication** — The pi agent (CLI process) and VS Code extension (separate process) communicate exclusively through the `.pi/` directory in the project workspace: review requests are written as JSON files, results are read back as JSON files.
- **Race-based review resolution** — Two paths can resolve a review: the VS Code diff editor (approve/reject buttons) or the terminal TUI selector (Approve/Reject/Rethink/Approve All/Abort). Both run concurrently via `Promise.race()`.
- **Module-level mutable state** — Both extensions manage session state via module-scoped variables (`Map`, `Set`, simple variables), not dependency injection.

## Layers

**Pi Extension Layer (`src/index.ts`):**
- Purpose: Hooks into the pi agent framework to override file mutation tools with human review.
- Location: `src/index.ts`
- Contains: Default export factory function, two tool registrations (`write`, `edit`), event handlers, review lifecycle logic, TUI selector.
- Depends on: `@earendil-works/pi-coding-agent` (framework types, `ExtensionAPI`, `withFileMutationQueue`), `@earendil-works/pi-tui` (indirectly via `ctx.ui`), TypeBox (`Type` object for parameter schemas).
- Used by: The pi framework, which invokes the default export at startup with an `ExtensionAPI` instance.

**VS Code Extension Layer (`vscode-ext/src/extension.ts`):**
- Purpose: Provides visual diff review UI in VS Code, enabling users to see proposed changes and approve/reject them.
- Location: `vscode-ext/src/extension.ts`
- Contains: Activation/deactivation hooks, file watchers, diff view management, approve/reject commands, review completion logic.
- Depends on: `vscode` API, Node.js `fs` and `path` modules.
- Used by: VS Code runtime (standard extension lifecycle).

**Type Definitions (`vscode-ext/src/types.ts`):**
- Purpose: Shared interfaces for the review IPC protocol between pi and VS Code.
- Location: `vscode-ext/src/types.ts`
- Contains: `ReviewRequest`, `ReviewFile`, `ReviewResult`, `ReviewResultFile`, `DiffSession`, `FileStatus`.
- Used by: Both `extension.ts` files (pi side inlines equivalent shapes but they must match exactly).

## Data Flow

### Primary Review Flow (VS Code available)

1. LLM calls `write(path, content)` or `edit(path, edits)` tool
2. Tool override in `src/index.ts:246-417` reads the existing file content, applies edits if needed, computes proposed content
3. `createReviewAndWait()` (line 37) generates a UUID, creates a review request JSON in `.pi/review-requests/{uuid}.json`
4. VS Code extension's `fs.watch` on `.pi/review-requests/` fires `handleRequest()` (line 93)
5. `handleRequest()` parses the JSON, creates a temp file with proposed content at `.pi/tmp/{uuid}/{basename}`, calls `vscode.commands.executeCommand('vscode.diff', ...)` to open a diff tab
6. User sees the diff and clicks Approve or Reject in the editor title bar (commands registered as `pi-sr.approveCurrent` / `pi-sr.rejectCurrent`)
7. `approveCurrent()` or `rejectCurrent()` applies the change (or not), closes the diff tab, and calls `checkReviewComplete()` (line 292)
8. `checkReviewComplete()` aggregates results for all files in the review, writes the result JSON to `.pi/review-results/{uuid}.json`
9. Simultaneously, `showTuiSelector()` (line 170) shows a terminal prompt for the same review. Both the TUI and VS Code paths race via `Promise.race()` (line 84)
10. In the pi process, `pollResultFile()` (line 145) detects the result file and returns the outcome
11. The tool override writes (or rejects) the file based on the outcome

### Secondary Review Flow (VS Code unavailable, terminal only)

1. LLM calls `write` or `edit`
2. `isVscodeReady(ctx.cwd)` returns false (no heartbeat file or stale timestamp)
3. VS Code bypass is NOT automatic — the TUI selector still races with polling
4. If VS Code is truly absent, only the TUI path resolves (user approves/rejects in terminal)
5. Results are written identically to `.pi/review-results/` so VS Code picks them up if opened later

### Tertiary Review Flow (no VS Code at all)

1. As above, but at session start a warning is logged: "VS Code not detected — working without diff review"
2. `isVscodeReady()` returns false, so `createReviewAndWait()` returns `{ status: "approved", final: proposed }` immediately
3. Files are written directly — no review UI at all

### Approve All Flow

1. User selects "Approve All for this session" in the TUI
2. All previously queued review IDs (tracked in `sessionReviewIds`) are added to `sessionApproveAll`
3. All subsequent reviews in the same session auto-approve without showing UI

### Cleanup Flow

1. On `message_end` event (line 447), `cleanupPiDir()` empties `.pi/tmp/`, `.pi/review-requests/`, and `.pi/review-results/`
2. `sessionApproveAll` is cleared on `before_agent_start` (line 443) — resets per user prompt
3. `sessionReviewIds` is cleared on `session_start` (line 425) — resets per session

**State Management:**
- Pi extension uses module-level variables: `sessionReviewIds` (Set), `sessionApproveAll` (Set), `projectCwd` (string), `vscodeNotOpenWarned` (boolean)
- VS Code extension uses module-level variables: `workspaceRoot`, `requestsDir`, `resultsDir`, `watcher` (FSWatcher), `resultsWatcher` (FSWatcher), `sessions` (Map<string, DiffSession>), `reviewFiles` (Map<string, Set<string>>)
- No DI, no class instances, no singletons beyond these module variables
- State persistence is via the filesystem (`.pi/*.json`), not in-memory across restarts

## Key Abstractions

**ReviewRequest JSON schema:**
- Purpose: IPC contract between pi and VS Code. Written by pi at `.pi/review-requests/{uuid}.json`, consumed by VS Code.
- Shape: `{ id: string, title: string, files: [{ path, original, proposed, description? }] }`
- Pattern: File-based message passing.

**ReviewResult JSON schema:**
- Purpose: IPC contract for results. Written by VS Code (or pi TUI) at `.pi/review-results/{uuid}.json`, consumed by the other process.
- Shape: `{ id: string, status: "approved" | "rejected", files: [{ path, status, final }] }`
- Pattern: File-based message passing.

**DiffSession:**
- Purpose: Internal VS Code state tracking a single diff editor's lifecycle.
- Fields: `reviewId`, `filePath`, `originalFsPath`, `tmpFsPath`, `status` (pending/approved/rejected)
- Pattern: Transient in-memory state mapped by temp file path.

**withFileMutationQueue:**
- Purpose: Framework-provided helper from `@earendil-works/pi-coding-agent` that serializes concurrent file writes.
- Usage: Wraps the actual `writeFileSync` call in the approved path of both tool overrides (`src/index.ts:295`, `src/index.ts:392`).

**resolveSafe:**
- Purpose: Path normalization that handles the common LLM mistake of passing absolute-like paths without the leading `/` (e.g. `home/user/project/file.ts` instead of `/home/user/project/file.ts`).
- Pattern: Duplicated in both extensions (`src/index.ts:233`, `vscode-ext/src/extension.ts:82`) — known code duplication.

## Entry Points

**Pi Extension Entry Point:**
- Location: `src/index.ts:421`
- Triggers: Pi framework discovers the extension via `package.json` field `pi.extensions: ["./src/index.ts"]` and calls the default export with an `ExtensionAPI` instance.
- Responsibilities: Register `write` and `edit` tool overrides, subscribe to `session_start`, `before_agent_start`, `message_end` lifecycle events.

**VS Code Extension Entry Point:**
- Location: `vscode-ext/src/extension.ts:19`
- Triggers: VS Code activates the extension via `activationEvents: ["onStartupFinished"]` in `vscode-ext/package.json`.
- Responsibilities: Create `.pi/` subdirectories, start heartbeat, start `fs.watch` watchers on review request/result directories, register editor title commands, recover any incomplete reviews.

**VS Code Deactivation:**
- Location: `vscode-ext/src/extension.ts:68`
- Triggers: VS Code extension host unload.
- Responsibilities: Close watchers, remove `.vscode-ready` signal.

## Extension Activation Lifecycle

### Pi Extension Activation
1. Pi agent starts (CLI `pi` command)
2. `package.json` declares `pi.extensions: ["./src/index.ts"]`
3. Framework imports `src/index.ts` and calls the default export function with `ExtensionAPI`
4. Tool registrations and event subscriptions are queued
5. Framework processes registrations: the `write` and `edit` tools now point to the overridden implementations
6. On first `session_start` event: review state reset, VS Code presence check

### VS Code Extension Activation
1. VS Code starts (extension host)
2. `vscode-ext/package.json` declares `activationEvents: ["onStartupFinished"]` — activates after startup
3. `activate()` called: workspace root detection, directory creation, heartbeat file written, `fs.watch` set up on both directories
4. Heartbeat timer writes timestamp to `.pi/.vscode-ready` every 15 seconds
5. Commands `pi-sr.approveCurrent` and `pi-sr.rejectCurrent` registered with editor/title menu contributions (visible when `piSr.isActive` context is true)
6. Recovery scan: any existing `.json` files in `review-requests/` are processed immediately

## Communication Patterns

**Pi <-> VS Code: File-based IPC.**
- No sockets, pipes, or RPC.
- Communication directory: `.pi/` in the workspace root, with subdirectories `review-requests/`, `review-results/`, `tmp/`.
- Detection: Pi detects VS Code presence by checking the heartbeat file `.pi/.vscode-ready` (fresh timestamp within 30 seconds, heartbeat interval = 15s).
- Watchers: VS Code uses `fs.watch` on both directories for immediate notification. Pi polls the results directory (500ms interval, 10-minute deadline).
- Concurrency model: Both processes can write to the same result file, but the Pi `writeSyncResult` and VS Code `checkReviewComplete` separately handle the same schema. Race conditions are avoided by Promise.race — whichever process resolves first wins, the other's result is ignored.

**Pi <-> LLM: Standard tool-calling protocol.**
- Pi framework manages the LLM conversation; this extension only hooks into tool execution.
- Tools registered with `executionMode: "sequential"` — the LLM must complete each write/edit before the next tool call.
- Tool results include `isError: true` for reject/error outcomes (tells LLM to retry or adapt).

**VS Code Internal: Context key `piSr.isActive`.**
- Set to `true` when diff editors are opened, `false` when reviews complete.
- Controls visibility of the Approve/Reject buttons in the editor title bar.

## Webview Architecture

Not applicable. The VS Code extension uses the **native diff editor** (`vscode.diff` command), not a custom webview. The diff view is opened side-by-side with the original (left) and proposed (right). Temp files are written to `.pi/tmp/{reviewId}/` for the proposed content.

## Key Design Patterns Used

- **Tool Override Pattern** — Registering tools with the same name as built-in tools to intercept and wrap their behavior. The pi framework accepts the last-registered tool for a given name.
- **Event Subscription Pattern** — Using `pi.on("event_name", handler)` to hook into lifecycle events (`session_start`, `before_agent_start`, `message_end`).
- **File-Based IPC** — Asynchronous message passing via JSON files on the filesystem.
- **Race-and-Winner Pattern** — `Promise.race()` between TUI and VS Code watcher to resolve reviews from either interface.
- **Module-Scoped State** — Simple module-level variables instead of classes or DI.
- **Guard Clause Flow** — Heavy use of early returns and switch/case in tool execute handlers rather than nested conditionals.
- **Result Object Pattern** — Returning structured result objects (`{ content, details, isError? }`) rather than throwing exceptions for expected error cases (rejection, timeout).

## Error Handling

**Strategy:** Return error information as tool result objects with `isError: true` rather than throwing exceptions. Wrap all file I/O in try/catch with fallback behavior.

**Patterns:**
- Tool execution catch blocks return error objects with descriptive text: `src/index.ts:308-310` (rejected), `src/index.ts:314-316` (timeout), `src/index.ts:359-363` (file not found), `src/index.ts:369-374` (edit failure).
- File polling catches and retries on parse errors (partial writes): `src/index.ts:162-166`.
- VS Code error handling uses try/catch in approve/reject/close operations with `showErrorMessage` user feedback: `vscode-ext/src/extension.ts:198-200`, `vscode-ext/src/extension.ts:221-223`.
- No centralized error boundary or logging framework — errors are handled locally per operation.

## Cross-Cutting Concerns

**Logging:** No structured logging. Pi uses `console.warn()` for the VS Code detection warning (`src/index.ts:431`). VS Code uses `showErrorMessage`/`showInformationMessage` for user-facing notifications. No log levels, no transport abstraction.

**Validation:** Parameter schemas defined with TypeBox (`Type.Object`, `Type.String`) for the tool definitions. The pi framework validates tool call arguments against these schemas before passing them to `execute()`. Review request JSON parsing in VS Code uses bare `JSON.parse` with try/catch.

**Authentication:** Not applicable — this extension provides no authentication layer. It relies on the local filesystem permissions.

---

*Architecture analysis: 2026-06-14*
