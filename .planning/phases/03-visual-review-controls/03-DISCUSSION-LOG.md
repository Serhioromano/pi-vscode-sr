# Phase 3: Visual Review Controls - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 3-Visual Review Controls
**Areas discussed:** Review Event Delivery, Button Layout & Rethink Flow, Chat-Diff Editor Sync, Batch Actions & Custom Extensions

---

## Review Event Delivery

| Option | Description | Selected |
|--------|-------------|----------|
| New agent event types | Pi SDK emits review_start, review_file, review_end through onEvent() stream | ✓ |
| Review coordinator bridge | Review coordinator watches .pi/ and gets a reference to the active ChatResponseStream | |
| Piggyback on tool events | Wrap review data inside existing tool_execution events | |

| Option | Description | Selected |
|--------|-------------|----------|
| Single event (batch) | One review_request event with all files at once | |
| Progressive per-file events | review_start → review_file × N → review_end | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Write result via file IPC | Chat handler writes result JSON to .pi/review-results/ | ✓ |
| RPC response to Pi | New RPC message type sent back to Pi | |
| Delegate to review coordinator | Reuse existing approveCurrent/rejectCurrent logic | |

| Option | Description | Selected |
|--------|-------------|----------|
| File IPC with status rethink | Write { status: 'rethink', prompt: '...' } to review-results | ✓ |
| RPC rethink feedback | New RPC message type for rethink feedback | |

**User's choice:** New agent event types, progressive per-file events, file IPC for all resolution (approve/reject/rethink).
**Notes:** Pi SDK may need changes to emit review events. File IPC keeps a single resolution path for both chat and TUI — no protocol fragmentation.

---

## Button Layout & Rethink Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Per-file button row | Filename + diff stats + [Approve] [Reject] [Rethink] per file | ✓ |
| Toolbar + file selector | Single toolbar row with file dropdown | |
| Checkbox + batch actions | Checkboxes with batch actions at bottom | |

| Option | Description | Selected |
|--------|-------------|----------|
| VS Code input box | vscode.window.showInputBox() for rethink feedback | ✓ |
| Inline chat input | Inline text field in the chat response | |
| Multi-line editor tab | New untitled editor for detailed feedback | |

| Option | Description | Selected |
|--------|-------------|----------|
| Replace with status indicator | "✓ Approved" / "✗ Rejected" — row stays visible | ✓ |
| Remove button row | Entire row disappears after action | |
| Keep all active (toggleable) | All buttons stay, user can change mind | |

| Option | Description | Selected |
|--------|-------------|----------|
| Filename + description | Pi-provided description of the change | |
| Filename + diff stats | +N / -M lines summary | ✓ |
| Filename only | Just the filename, no context | |

**User's choice:** Per-file button rows with diff stats, VS Code input box for rethink, status indicator replacement.
**Notes:** VS Code input box consistent with Phase 2 D-11. Diff stats give context without opening the diff editor.

---

## Chat-Diff Editor Sync

| Option | Description | Selected |
|--------|-------------|----------|
| Shared state module | createReviewState() factory — both paths read/write same state | ✓ |
| Command-based sync | VS Code commands for cross-path communication | |
| Final result only (loose sync) | No per-file sync, only final result file matters | |

| Option | Description | Selected |
|--------|-------------|----------|
| First action wins | Second action silently ignored for already-resolved files | ✓ |
| Last action overrides | Last action always takes effect | |
| Confirm on override | Dialog asking to confirm override of previous decision | |

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-open both | Diff editors open automatically (current behavior) — but with VS Code setting to change | ✓ |
| On-demand via chat button | Diff editors only open when user clicks "View Diff" | |

| Option | Description | Selected |
|--------|-------------|----------|
| Shared state writes final result | Module writes final JSON when last file resolves | ✓ |
| Pi aggregates partial results | Pi reads partial results and determines completion | |

**User's choice:** Shared state module, first action wins, auto-open by default with VS Code setting `pi.review.autoOpenDiff` (true/false), shared state writes final result.
**Notes:** VS Code setting follows Phase 2 pattern. Shared state module follows Phase 1 factory pattern.

---

## Batch Actions & Custom Extensions

| Option | Description | Selected |
|--------|-------------|----------|
| Inline stream buttons | Approve All / Reject All as stream.button() at end of review_end | ✓ |
| Followup provider buttons | Buttons appear after response via followupProvider | |
| Both inline + followup | Both placements | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pending files only | Batch only affects files still in 'pending' state | |
| Override all files | Batch overrides all decisions | |
| Ask user each time | Quick pick: "remaining 3 pending?" vs "all 5 including decided?" | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Pi event payload | Custom actions in review_file event's actions array | ✓ |
| VS Code settings | Custom actions defined in pi.review.customActions setting | |
| RPC command discovery | Extension fetches available actions via RPC command | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same row as standard | Custom actions in same button row as approve/reject/rethink | ✓ |
| Secondary row below | Custom actions in separate row with divider | |
| Overflow dropdown menu | "⋯ More" dropdown for custom actions | |

**User's choice:** Inline stream buttons, ask user each time for scope, Pi event payload for custom actions, same row as standard buttons.
**Notes:** Pi is source of truth for custom actions — VS Code just renders what it receives. No config duplication.

---

## Claude's Discretion

No areas were delegated — all decisions were user-confirmed.

## Deferred Ideas

None — discussion stayed within phase scope.
