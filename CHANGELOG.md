# Changelog

All notable changes to Pi VS Code will be documented in this file.

## [1.0.0] - 2026-06-09

### Added

- Pi extension `src/index.ts` — overrides `write` and `edit` tools to create review requests
- VS Code extension `vscode-pi-companion` in `vscode-ext/` with approve/reject buttons in diff editor
- Protocol: `.pi/review-requests/` → diff editor → `.pi/review-results/`
- Commands: Pi Companion: Approve Current, Reject Current, Approve All, Reject All
- Debug configuration (F5 launch)
- Test review request at `.pi/review-requests/test.json`
