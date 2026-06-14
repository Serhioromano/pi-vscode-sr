# Changelog

All notable changes to Pi VS Code will be documented in this file.

## [1.4.3] - 2026-06-14

### Added

- **VS Code detection via heartbeat file `.pi/.vscode-ready`:** Pi extension now checks whether VS Code is open with the current project before creating review requests. VS Code extension writes a timestamp (Unix ms) to `.pi/.vscode-ready` on activation and refreshes it every 15 seconds via `setInterval`. On deactivation, the file is deleted. Pi extension's `isVscodeReady()` checks that the file exists AND the timestamp is fresh (≤ 30 seconds). If VS Code is not detected:
  - Review requests are NOT written to `.pi/review-requests/` (avoiding orphan files)
  - Polling for VS Code results is skipped (no wasted 10-minute timeout)
  - TUI selector is shown immediately — terminal-only review flow
- **Heartbeat guards against stale lock file:** If VS Code crashes or is killed (SIGKILL), `deactivate()` doesn't run, but the 30-second freshness check on Pi's side detects the stale timestamp and correctly falls back to TUI-only mode.

## [1.4.2] - 2026-06-14

### Fixed

- **Approve button in VS Code fails with ENOENT (doubled path):** `checkReviewComplete` used `path.join(workspaceRoot, fp)` to read the approved file back for the result JSON, but `fp` from `fileSet` was sometimes relative (missing leading `/`), causing a doubled path like `/home/user/project/home/user/project/file.ts`. Fixed by using `fp` directly when it starts with `/`, falling back to `path.join` for relative paths. Added diagnostic logging to `getCurrentSession`, `approveCurrent`, `rejectCurrent`, and `checkReviewComplete` to catch similar issues faster.

### Changed

- **TUI shows instantly — no more Phase 1 delay:** Removed the 2-second head start (Phase 1) where the extension polled VS Code before showing the TUI. The TUI selector now appears immediately and races with VS Code in parallel from the start. `AbortController` still dismisses the TUI if VS Code responds first. Empty-file handling in `pollResultFile` now uses the standard poll interval (500ms) instead of a separate 200ms sleep.

### Added

    - **Rethink option in TUI selector** (`💭 Rethink`): opens a text input dialog where the user can type feedback for the agent (e.g., "use async/await instead of promise chains"). The changes are not applied, the VS Code diff is closed (rejected result), and the tool returns `isError: true` with the user's feedback text. The agent sees `🔄 file.ts — rethinking requested: "..."` and can incorporate the feedback in its next attempt. Enables a smooth, iterative refinement workflow without leaving the terminal.
- **`.vscodeignore` for VS Code extension:** Added `.vscodeignore` to `vscode-ext/` to exclude `src/`, `node_modules/`, `tsconfig.json`, and dev files from the `.vsix` package. Only `dist/`, `package.json`, `icon.jpg`, and `README.md` are now packaged — reducing VSIX size and preventing accidental inclusion of build artifacts.

### Fixed

- **Doubled path when LLM passes absolute-looking path without leading slash:** When the LLM passed a path like `home/user/project/file.ts` (missing the leading `/`), `resolve()`/`path.join()` treated it as relative and produced `/home/user/project/home/user/project/file.ts` — creating files at wrong nested locations. Fixed in three places: (1) Pi extension: `resolveSafe()` in tool handlers for final write path, (2) Pi extension: normalize path in review-request JSON so VS Code receives correct absolute path, (3) VS Code extension: `resolveSafe()` in `handleRequest` and normalized path stored in `fileSet` + session — belt and suspenders.
- **Diff tabs not closing when decision made in terminal:** When the user approved, rejected, aborted, or rethought via the terminal TUI selector, the VS Code diff tabs remained open indefinitely. Root cause: `writeSyncResult` was missing for `"approved"` and `"rejected"` TUI outcomes — the result file was only written for `"approve-all"`, `"abort"`, and `"rethink"`. Fixed by splitting the `"file-approved"|"approved"` and `"file-rejected"|"rejected"` branches so TUI-originated decisions also write a result file. Combined with the new `resultsWatcher` in the VS Code extension, diff tabs now close automatically within ~1 second of any terminal-side decision.
- **TUI selector stays on screen after VS Code responds:** When the user approved/rejected changes in VS Code's diff editor, the `pollResultFile` detected the result file and `Promise.race` resolved correctly, but the TUI selector remained visible in the terminal because `ctx.ui.select()` was still pending. Fixed by passing an `AbortSignal` to `ctx.ui.select()` via `ExtensionUIDialogOptions` and calling `tuiController.abort()` when the poll wins the race. The TUI now dismisses immediately when VS Code responds first.

## [1.1.0] - 2026-06-09

### Added

- **Abort option in TUI selector** (`🚪 Abort`): calls `ctx.abort()` to immediately stop the agent session. Writes a rejected result file first so the VS Code extension cleans up its diff editors. Useful when the agent is going in the wrong direction and you want to stop it entirely.

## [1.0.1] - 2026-06-09

### Fixed

- **Reject button silently ignored:** `getCurrentSession()` only checked `activeTextEditor`, which in a diff editor points to whichever side last had focus (original vs tmp). If the user clicked the original side then pressed ✗, the session was never found and `rejectCurrent()` silently returned. Now checks ALL `visibleTextEditors` — both original and tmp sides.
- **Reject in VS Code diff editor:** `checkReviewComplete()` incorrectly marked rejected files as "approved" because sessions were deleted before result formation. Sessions now persist until result is written, and `session.status` is used to determine file outcome.
- **Agent continued after reject:** `createReviewAndWait` no longer throws on rejection. Instead, returns `{ status: "rejected" }` and the tool responds with `isError: true`. This ensures the agent sees a proper error result rather than an unhandled exception it might ignore.
- **TUI selector appeared when VS Code already responded:** Extended Phase 1 head start from 1.5s → 5s to give users enough time to review and click in VS Code. Added synchronous `existsSync` check between Phase 1 and Phase 2 — if VS Code wrote a result file between poll intervals, TUI is skipped entirely. Added defensive try-catch in `pollResultFile` for partially-written/empty result files.
- **Approve All reset prematurely:** Removed `message_update` event handler that could clear `sessionApproveAll` mid-prompt. Only `message_start` and `message_end` now reset it.

## [1.0.0] - 2026-06-09

### Added

- Pi extension `src/index.ts` — overrides `write` and `edit` tools to create review requests
- VS Code extension `vscode-pi-sr` in `vscode-ext/` with approve/reject buttons in diff editor
- Protocol: `.pi/review-requests/` → diff editor → `.pi/review-results/`
- Commands: Pi Companion: Approve Current, Reject Current, Approve All, Reject All
- Debug configuration (F5 launch)
- Test review request at `.pi/review-requests/test.json`
