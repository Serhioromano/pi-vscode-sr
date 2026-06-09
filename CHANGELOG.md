# Changelog

All notable changes to Pi VS Code will be documented in this file.

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
- VS Code extension `vscode-pi-companion` in `vscode-ext/` with approve/reject buttons in diff editor
- Protocol: `.pi/review-requests/` → diff editor → `.pi/review-results/`
- Commands: Pi Companion: Approve Current, Reject Current, Approve All, Reject All
- Debug configuration (F5 launch)
- Test review request at `.pi/review-requests/test.json`
