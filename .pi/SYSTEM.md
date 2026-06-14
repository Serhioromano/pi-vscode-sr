# Pi VS Code — Project Overview

This is a **monorepo** containing two components that work in pair:

## Components

### 1. Pi Extension (root, npm package `pi-vscode-sr`)
- **`src/index.ts`** — loaded by `@earendil-works/pi-tui`
- **Overrides built-in `write` and `edit` tools** — intercepts every file mutation call
- Instead of writing/editing directly, creates `.pi/review-requests/{uuid}.json` with proposed changes
- Opens a **TUI selector** in the terminal with options:
  - ✅ Approve
  - ❌ Reject  (calls `ctx.abort()`)
  - ⭐ Approve All for this session
- Also polls `.pi/review-results/{uuid}.json` for VS Code diff editor result
- **Whoever responds first wins** — terminal selector or VS Code buttons
- **Session** = one prompt's work. `session_start` event resets session state.

### 2. VS Code Extension (`vscode-ext/`, package `vscode-pi-companion`)
- **`vscode-ext/src/extension.ts`** — loaded by VS Code
- Watches `.pi/review-requests/` for new requests from Pi
- Opens diff editors with **✓ Approve / ✗ Reject** buttons in editor title bar
- User can edit the right side of diff, then click Approve or Reject
- Writes result to `.pi/review-results/{uuid}.json` for Pi to read

## Communication Protocol

```
Pi (terminal)                          VS Code Extension (diff UI)
    │                                         │
    ├─ writeFile(.pi/review-requests/         │
    │           {uuid}.json)                  │
    │                                         ├─ fs.watch → parse JSON
    │                                         ├─ open diff editor(s)
    │                                         │  with ✓/✗ buttons
    │                                         │
    │     ...user reviews in VS Code...       │
    │                                         │
    │                                         ├─ ✓: write tmp → original
    │                                         ├─ ✗: delete tmp
    │                                         ├─ all done →
    │                                         │  writeFile(review-results/{uuid}.json)
    │                                         │
    ├─ readFile(.pi/review-results/           │
    │           {uuid}.json)                  │
    │                                         │
    └─ continue (or revert)                   │
```

### Review Request (Pi → Extension)
`.pi/review-requests/{uuid}.json`:
- `id` — UUID
- `title` — review title
- `files[]` — array of files, each with `path`, `original`, `proposed`, `description?`, `language?`

### Review Result (Extension → Pi)
`.pi/review-results/{uuid}.json`:
- `id` — same UUID
- `status` — `"approved" | "rejected" | "partial"`
- `files[]` — each with `path`, `status`, `final` (content)

### How Pi learns result
Polling: check `.pi/review-results/{uuid}.json` every 500ms after writing a request.

## Key Commands (VS Code Extension)
- `pi-companion.approveCurrent` — approve active diff
- `pi-companion.rejectCurrent` — reject active diff
- `pi-companion.approveAll` — approve all pending

## Context Key
- `piCompanion.isActive` — set to `true` when any review is active
