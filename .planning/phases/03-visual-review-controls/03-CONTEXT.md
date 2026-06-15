# Phase 3: Visual Review Controls - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers inline approve/reject/rethink buttons in chat responses for Pi-proposed file changes — users review and resolve files without switching to the terminal TUI. When Pi proposes file changes, each file gets a button row in the chat stream. Users can approve, reject, or rethink individual files, provide rethink feedback via VS Code native input box, and use batch Approve All / Reject All actions. Custom extension-defined review actions appear alongside standard buttons. The existing VS Code diff editor path remains fully operational alongside — both paths sync via shared state.

**Delivers:** REVW-01, REVW-02, REVW-03, REVW-04 (4 requirements)
**Depends on:** Phase 2 (chat-handler, event-mapper, rpc-ui-handler, PiProcessManager onEvent stream)
**Does NOT deliver:** Inline completions (Phase 4), review protocol redesign (file IPC stays)
</domain>

<decisions>
## Implementation Decisions

### Review Event Delivery
- **D-01:** Review requests reach the chat handler as **new agent event types** through the existing `onEvent()` RPC stream. Pi SDK emits `review_start`, `review_file`, and `review_end` events. The event mapper transforms them to `stream.button()` calls. No new communication channel — extends the established pattern.
- **D-02:** Events are **progressive per-file**: `review_start` → `review_file` × N → `review_end`. Each file's buttons render as its event arrives. Better UX for multi-file reviews; each file is independently actionable as soon as its event lands.
- **D-03:** Button click resolution writes **result JSON to `.pi/review-results/{id}.json`** — the same file IPC protocol the terminal TUI uses. Pi already polls for results. Single resolution path for both chat and TUI.
- **D-04:** Rethink feedback writes `{ status: "rethink", prompt: "<user feedback>" }` to the review-results file. Pi reads it, feeds the prompt back to the LLM, generates a new revision which creates a new review request. Full round-trip through the existing file IPC protocol.

### Button Layout & Rethink Flow
- **D-05:** Each file gets a **per-file button row** in the chat response: `filename + diff stats (+N / -M lines) [Approve] [Reject] [Rethink] [custom actions...]`. Files are independently actionable.
- **D-06:** Rethink feedback input uses **`vscode.window.showInputBox()`** — consistent with Phase 2 D-11 (native VS Code dialogs for user input). Single-line, keyboard-friendly.
- **D-07:** After action, buttons are **replaced with a status indicator**: "✓ Approved" or "✗ Rejected" in the row. The row stays visible so the user can review their decisions. Button row is no longer interactive for resolved files.
- **D-08:** Each row shows **filename + diff stats** (+N / -M lines). Gives the user enough context to decide without opening the diff editor.

### Chat-Diff Editor Sync
- **D-09:** Chat buttons and diff editor path synchronize via a **shared state module** — `createReviewState()` factory following Phase 1 D-02 pattern. Both chat handler and review coordinator read/write the same state. When one path resolves a file, the other reacts immediately: chat buttons update status, diff tabs close.
- **D-10:** **First action wins** for conflicts. If the user approves in chat and then tries to reject in the diff editor (or vice versa), the second action is silently ignored — the file is already resolved. The status indicator in the other path updates to reflect the first decision.
- **D-11:** Diff editors **auto-open by default** (current behavior preserved). A new VS Code setting `pi.review.autoOpenDiff` (boolean, default `true`) allows users to switch to on-demand via a "View Diff" button in the chat row. Follows the Phase 2 settings pattern (`pi.chat.toolVisibility`, `pi.chat.interruptionBehavior`).
- **D-12:** The **shared state module writes the final aggregate result** to `.pi/review-results/{id}.json` when the last file in a review resolves. Single responsibility — both paths feed into the same state, the module detects completion and writes.

### Batch Actions & Custom Extensions
- **D-13:** Approve All / Reject All buttons appear as **inline `stream.button()` calls** at the end of the `review_end` event — same response block as per-file buttons. Users see everything in one response.
- **D-14:** When batch buttons are clicked, **ask the user** via quick pick: "Approve remaining 3 pending files?" vs "Approve all 5 files (including 2 already decided)?". If all files are pending, approve/reject all directly without asking.
- **D-15:** Custom extension-defined review actions are **discovered from the Pi event payload** — the `review_file` event includes an `actions` array with `{ label, value }` objects. Pi extensions define actions; VS Code renders them as additional buttons. Follows the "Pi is source of truth" constraint — no config duplication in VS Code.
- **D-16:** Custom action buttons appear **in the same button row** as standard approve/reject/rethink — e.g., `[Approve] [Reject] [Rethink] [Approve & Continue] [Log & Skip]`. All actions are equal citizens in the row.

### Claude's Discretion
No areas were delegated — all decisions were user-confirmed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Definition
- `.planning/ROADMAP.md` — Phase 3 scope, success criteria, requirements mapping (REVW-01 through REVW-04)
- `.planning/REQUIREMENTS.md` — Full v1 requirement definitions with detailed acceptance criteria
- `.planning/PROJECT.md` — Core value, constraints, key decisions (especially "No config reinvention" and "Terminal TUI stays as fallback")

### Prior Phase Decisions (inherited)
- `.planning/phases/01-foundation-chat-basics/01-CONTEXT.md` — Module organization (D-01 through D-04), Pi process lifecycle (D-05 through D-08), shared code strategy (D-09, D-10), factory pattern (D-02), lazy start (D-05), tests for new code (D-13)
- `.planning/phases/02-rich-chat-experience/02-CONTEXT.md` — RPC UI handler pipeline (D-11, D-12), native VS Code dialogs (D-11), VS Code settings pattern (D-01, D-04), slash command passthrough (D-07), terminal TUI coexistence (D-13)

### Codebase Intelligence
- `.planning/codebase/ARCHITECTURE.md` — System overview, data flows, IPC patterns, Pi↔VS Code communication
- `.planning/codebase/CONVENTIONS.md` — TypeScript strictness, naming, error handling, async patterns, indentation (root 4-space, vscode-ext 2-space)
- `.planning/codebase/STACK.md` — Pi SDK version, VS Code API version, runtime requirements
- `.planning/codebase/STRUCTURE.md` — Dual-package layout, file locations, where to add new code

### Source Code (Phase 3 builds on these)
- `vscode-ext/src/chat-handler.ts` — Current streaming handler using `prompt()` + `onEvent()`. Phase 3 extends `onEvent()` subscription to handle new review event types. The `ChatResponseStream` is already available here for `stream.button()` calls.
- `vscode-ext/src/event-mapper.ts` — Pure `mapAgentEventToAction()` function. Phase 3 adds cases for `review_start`, `review_file`, `review_end` event types. `StreamAction` discriminated union may need a `button` variant, or button calls are made directly in the chat handler for review events.
- `vscode-ext/src/review-coordinator.ts` — Existing diff-editor review path (368 lines). Phase 3 integrates this with the shared state module — review coordinator reads/writes `createReviewState()` instead of managing its own isolated `sessions` Map.
- `vscode-ext/src/rpc-ui-handler.ts` — Maps `extension_ui_request` to VS Code native dialogs. Phase 3 review rethink uses `showInputBox()` — same pattern, may or may not go through this handler depending on whether rethink is an RPC UI request or a direct button callback.
- `shared/types.ts` — Review IPC types (`ReviewRequest`, `ReviewResult`, `ReviewResultFile`). Phase 3 may extend `ReviewResultFile` with a `prompt` field for rethink feedback.

### Pi SDK API Surface
- `node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.d.ts` — `RpcClient` class: `prompt()`, `onEvent()`, `abort()`, `getCommands()`
- `node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-types.d.ts` — RPC protocol types: `RpcSessionState`, `RpcSlashCommand`, `RpcExtensionUIRequest`
- `node_modules/@earendil-works/pi-agent-core/dist/types.d.ts` — `AgentEvent` discriminated union — Phase 3 review events may extend this or be a separate event category

### VS Code API Surface
- VS Code `ChatResponseStream` — `stream.button()` method for inline chat buttons with command callbacks
- VS Code `window.showInputBox()` — Used for rethink feedback input (consistent with Phase 2 D-11)
- VS Code `window.showQuickPick()` — Used for batch action scope selection (pending vs all files)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`createChatHandler()`** (`chat-handler.ts:20`) — Factory returning `ChatRequestHandler`. Already owns the `ChatResponseStream` and `onEvent()` subscription. Phase 3 extends the `onEvent` callback to handle review event types in addition to agent events.
- **`mapAgentEventToAction()`** (`event-mapper.ts:100`) — Pure function: `(AgentEvent, ToolVisibility?) => StreamAction`. Phase 3 either extends this for review events, or a parallel pure function `mapReviewEventToAction()` follows the same pattern.
- **`applyStreamAction()`** (`event-mapper.ts:174`) — Side-effectful: `(ChatResponseStream, StreamAction) => void`. May need extending for button-type actions or review-specific rendering.
- **`createReviewCoordinator()`** (`review-coordinator.ts:20`) — Factory managing diff editor sessions. Phase 3 refactors it to use the shared `createReviewState()` instead of its own isolated `sessions` Map.
- **`createRpcUiHandler()`** (`rpc-ui-handler.ts:78`) — Maps RPC UI requests to native VS Code dialogs. Phase 3 rethink uses `showInputBox()` — same pattern already established here.
- **`createPiProcessManager()`** (`pi-process-manager.ts`) — `onEvent()` subscription pattern. Review events arrive through the same stream. The `sendRpcMessage()` method may be used to send review responses if any path uses RPC instead of file IPC.

### Established Patterns
- **Factory function + closure state** (Phase 1 D-02) — `createReviewState()` follows this pattern. Both chat handler and review coordinator receive the same instance.
- **Pure function mapping** (Phase 1) — `mapAgentEventToAction` is the precedent. Review event mapping follows the same pure-function approach.
- **VS Code settings pattern** (Phase 2 D-01, D-04) — `pi.review.autoOpenDiff` added to `vscode-ext/package.json` `contributes.configuration`, read via `vscode.workspace.getConfiguration()`.
- **File IPC for results** — Existing protocol at `.pi/review-results/{id}.json`. Phase 3 writes the same JSON schema. No protocol change — Pi reads results the same way regardless of source (chat or TUI).
- **Deferred async init** (`extension.ts:68`) — Shared state module instantiation and wiring go in the deferred `void async` block.

### Integration Points
- **`chat-handler.ts` onEvent callback** — Currently handles `AgentEvent` only. Phase 3 adds handling for review event types (`review_start`, `review_file`, `review_end`). The `ChatResponseStream` is in scope here for `stream.button()` calls.
- **`event-mapper.ts`** — Add new event type cases for review events. `StreamAction` type may need a `button` variant, or review events bypass the mapper and are handled directly in the chat handler.
- **`review-coordinator.ts` session management** — Refactor from isolated `sessions` Map to shared `createReviewState()`. Diff editor result handling (approveCurrent/rejectCurrent) writes through shared state.
- **`extension.ts` activate()** — Instantiate `createReviewState()` in deferred init, pass to both `createChatHandler()` and `createReviewCoordinator()`. Add `pi.review.autoOpenDiff` setting read.
- **`vscode-ext/package.json`** — Add `contributes.configuration` for `pi.review.autoOpenDiff`.
- **Pi extension `src/index.ts`** — May need changes to emit review events through RPC event stream (depends on Pi SDK review event mechanism).

### Existing Gaps to Address
- **Review events don't exist yet in Pi SDK** — Phase 3 depends on Pi SDK emitting `review_start`/`review_file`/`review_end` events. Researcher must verify Pi SDK support for review events or plan the SDK changes needed.
- **`StreamAction` has no `button` variant** — The current discriminated union only has `progress`, `markdown`, `done`, `error`. Review buttons need a new action type, or review events bypass the mapper entirely and render buttons directly in the chat handler.
- **Review coordinator uses isolated state** — Currently manages its own `sessions` Map. Refactoring to shared state requires changes to `getCurrentSession()`, `approveCurrent()`, `rejectCurrent()`, `checkReviewComplete()`.
- **No mechanism to close specific diff tabs** — `closeReviewTabs()` already exists and works. Shared state can call it when chat resolves a file.
</code_context>

<specifics>
## Specific Ideas

- **Per-file button rows with diff stats** — The user specifically wants `filename + (+N / -M lines)` in each row. This is more technical than Pi's description field and requires computing the diff (or receiving stats from Pi in the event payload).
- **Status indicator replacement** — Buttons are replaced (not hidden) after action: "✓ Approved" / "✗ Rejected" in the same row. The row persists so the user can review their decisions at a glance.
- **Batch action quick pick** — "Approve remaining 3 pending files?" vs "Approve all 5 files (including 2 decided)?" Shown only when there are already-resolved files. If all pending, approve/reject all directly.
- **Custom actions from Pi payload** — Actions defined entirely on the Pi side, rendered by VS Code as equal-citizen buttons. Researcher should verify what the review event payload schema looks like and whether Pi extensions can already register custom review actions.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 3-Visual Review Controls*
*Context gathered: 2026-06-15*
