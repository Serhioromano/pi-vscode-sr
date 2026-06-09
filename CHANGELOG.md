# Changelog

All notable changes to Pi VS Code will be documented in this file.

## [1.0.1] - 2026-06-09

### Fixed

- **Reject in VS Code diff editor:** `checkReviewComplete()` incorrectly marked rejected files as "approved" because sessions were deleted before result formation. Sessions now persist until result is written, and `session.status` is used to determine file outcome.
- **Agent continued after reject:** `createReviewAndWait` no longer throws on rejection. Instead, returns `{ status: "rejected" }` and the tool responds with `isError: true`. This ensures the agent sees a proper error result rather than an unhandled exception it might ignore.
- **TUI selector kept open:** Added 1.5s Phase 1 head start for VS Code before showing TUI. If VS Code responds in that window, TUI never appears.
- **Approve All reset prematurely:** Removed `message_update` event handler that could clear `sessionApproveAll` mid-prompt. Only `message_start` and `message_end` now reset it.

## [1.0.0] - 2026-06-09

### Added

- Pi extension `src/index.ts` — overrides `write` and `edit` tools to create review requests
- VS Code extension `vscode-pi-companion` in `vscode-ext/` with approve/reject buttons in diff editor
- Protocol: `.pi/review-requests/` → diff editor → `.pi/review-results/`
- Commands: Pi Companion: Approve Current, Reject Current, Approve All, Reject All
- Debug configuration (F5 launch)
- Test review request at `.pi/review-requests/test.json`
