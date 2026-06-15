# Phase 2: Rich Chat Experience - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers streaming token-by-token markdown responses via `@pi` chat, pass-through of all Pi slash commands with VS Code-side autocomplete, and verified terminal TUI coexistence. When complete, users see Pi responses appear progressively in chat (not as a single block), can type `/model`, `/help`, `/plan` and any custom skill/agent slash commands through `@pi`, and can switch between VS Code Chat and terminal Pi without conflicts.

**Delivers:** CHAT-02, CHAT-03, CHAT-05 (3 requirements)
**Depends on:** Phase 1 (chat-handler, event-mapper, pi-process-manager, @pi participant)
**Does NOT deliver:** Visual review buttons in chat, inline completions (Phase 3-4)
</domain>

<decisions>
## Implementation Decisions

### Tool Execution Visibility
- **D-01:** Tool execution visibility is a user-configurable VS Code setting — `pi.chat.toolVisibility` with values `"verbose"` (default) and `"quiet"`.
- **D-02:** Verbose mode renders each tool execution as a **collapsible section, collapsed by default**. The tool name is the summary; clicking expands to show partial results and completion status. Quiet mode shows only "Pi is working..." progress.
- **D-03:** Implementation should use HTML `<details>`/`<summary>` tags in streamed markdown if VS Code Chat's renderer supports them. Researcher to verify webview-backed markdown renderer compatibility.

### Mid-Response Interruption
- **D-04:** Interruption behavior is a user-configurable VS Code setting — `pi.chat.interruptionBehavior` with values `"abort"` (default) and `"followUp"`.
- **D-05:** `"abort"` immediately kills the current Pi response via `RpcClient.abort()` and starts the new message as a fresh turn. `"followUp"` queues the new message via `RpcClient.followUp()` and processes it after the current response completes.
- **D-06:** `steer()` is excluded — simpler surface area, fewer edge cases around mid-stream redirection.

### Slash Command UX
- **D-07:** Slash commands are **pure passthrough** to Pi — the extension sends user text as-is, Pi interprets `/` commands natively. No command parsing or validation in the extension.
- **D-08:** The extension fetches available commands via `RpcClient.getCommands()` and registers them so VS Code Chat shows **autocomplete suggestions** when the user types `/`. This enhances discoverability without interpreting commands.
- **D-09:** Commands are **fetched on each `/` keystroke** (not cached for the session). `getCommands()` is local RPC over stdin/stdout JSON-line protocol, not a network call — expected to be fast. Researcher to verify performance.
- **D-10:** All command sources appear in autocomplete: extensions, prompt templates, skills, and custom agents — everything `getCommands()` returns.

### Terminal TUI Coexistence
- **D-11:** Pi's `RpcExtensionUIRequest` events (`select`, `confirm`, `input`, `notify`) are handled using **VS Code's native UI API**, not markdown buttons or custom webviews. `window.showQuickPick()` for selections, `window.showInputBox()` for text input, `window.showInformationMessage()` for notifications.
- **D-12:** The RPC UI request handling pipeline should be established in Phase 2. Phase 3 builds on this infrastructure for review-specific controls (approve/reject/rethink buttons in chat).
- **D-13:** Terminal TUI remains the fallback when VS Code is not connected — both paths must be verified working. The extension must not break the existing `.pi/` file-based review protocol.

### Claude's Discretion
No areas were delegated — all decisions were user-confirmed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Definition
- `.planning/ROADMAP.md` — Phase 2 scope, success criteria, requirements mapping (CHAT-02, CHAT-03, CHAT-05)
- `.planning/REQUIREMENTS.md` — Full v1 requirement definitions with detailed acceptance criteria
- `.planning/PROJECT.md` — Core value, constraints, key decisions, out-of-scope items (especially "No config reinvention" and "Terminal TUI stays as fallback")
- `.planning/phases/01-foundation-chat-basics/01-CONTEXT.md` — Phase 1 decisions this phase inherits (factory pattern, lazy start, pure functions, module organization)

### Codebase Intelligence
- `.planning/codebase/ARCHITECTURE.md` — Current system overview, data flows, IPC patterns, Pi<->VS Code communication
- `.planning/codebase/CONVENTIONS.md` — TypeScript strictness, naming patterns, error handling, async patterns, indentation rules
- `.planning/codebase/STACK.md` — Pi SDK version, VS Code API version, runtime requirements

### Source Code (Phase 1 output — Phase 2 builds on these)
- `vscode-ext/src/chat-handler.ts` — Current batch-mode handler using `promptAndWait()` + `streamEvents()`. Phase 2 switches to progressive streaming via `prompt()` + `onEvent()`.
- `vscode-ext/src/event-mapper.ts` — Pure `mapAgentEventToAction()` function. Currently processes arrays; Phase 2 feeds it individual events as they arrive. `StreamAction` discriminated union already supports progressive streaming.
- `vscode-ext/src/pi-process-manager.ts` — `PiProcessManager` interface with `prompt()`, `onEvent()`, `abort()`, `getState()`, `getCommands()`. Phase 2 uses `onEvent()` for streaming instead of `promptAndWait()`.
- `vscode-ext/src/extension.ts` — Chat participant registration, deferred init, workspace isolation. Phase 2 adds RPC UI request handler registration here.
- `shared/types.ts` — Shared IPC types (ReviewRequest, ReviewResult, etc.). Phase 2 may extend for RPC UI request types.

### Pi SDK API Surface (critical — all Pi interaction goes through these)
- `node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.d.ts` — `RpcClient` class: `prompt()`, `onEvent()`, `abort()`, `followUp()`, `getCommands()`, `waitForIdle()`
- `node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-types.d.ts` — `RpcSlashCommand` (name, description, source), `RpcSessionState` (isStreaming field), `RpcExtensionUIRequest` types (select, confirm, input, notify)
- `node_modules/@earendil-works/pi-agent-core/dist/types.d.ts` — `AgentEvent` discriminated union — all event types the event mapper handles

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`mapAgentEventToAction()`** (`event-mapper.ts:18`) — Pure function: `(AgentEvent) => StreamAction`. Already handles all event types. Phase 2 calls this per-event instead of in a batch loop.
- **`applyStreamAction()`** (`event-mapper.ts:68`) — Side-effectful: `(ChatResponseStream, StreamAction) => void`. Already supports progressive `stream.markdown()` and `stream.progress()` calls.
- **`PiProcessManager.onEvent()`** (`pi-process-manager.ts:104`) — Event subscription pattern. Returns unsubscribe function. Phase 2 streaming hooks into this instead of `promptAndWait()`.
- **`RpcClient.prompt()`** — Returns immediately after sending. Events stream via `onEvent()`. `waitForIdle()` resolves on `agent_end`. This is the streaming foundation.
- **`RpcClient.getCommands()`** — Returns `RpcSlashCommand[]`. Already typed. Phase 2 calls this for autocomplete.
- **`RpcClient.abort()` / `RpcClient.followUp()`** — Already available for D-05 interruption behavior.

### Established Patterns
- **Factory function + closure state** (from Phase 1 D-02) — New handlers (e.g., RPC UI request handler) follow `createXxx(opts)` pattern.
- **Pure function mapping** — `mapAgentEventToAction` is the precedent. Any new event transformation should be a pure function in its own module.
- **VS Code settings pattern** — Phase 4 plans `pi.inlineCompletions.enabled`. Phase 2 adds `pi.chat.toolVisibility` and `pi.chat.interruptionBehavior` following the same `package.json` `contributes.configuration` pattern.
- **Deferred async init** (`extension.ts:38`) — New side-effectful setup (RPC UI handler registration) goes in the deferred `void async` block.

### Integration Points
- **`chat-handler.ts`** — The async handler function. Phase 2 replaces `promptAndWait()` + batch `streamEvents()` with `prompt()` + `onEvent()` progressive streaming.
- **`event-mapper.ts`** — `streamEvents()` batch function. Either replaced or augmented with a progressive variant. Pure functions `mapAgentEventToAction` and `applyStreamAction` stay unchanged.
- **`extension.ts` activate()** — Chat participant registration (line 33). Phase 2 adds VS Code settings contribution and RPC UI request handler setup in deferred init.
- **`vscode-ext/package.json`** — Add `contributes.configuration` for `pi.chat.toolVisibility` and `pi.chat.interruptionBehavior`.
- **`pi-process-manager.ts`** — Interface may need `getCommands()` exposed (currently not in the interface, only in the underlying `RpcClient`).

### Existing Gaps to Address
- **`tool_execution_start` mapping** (`event-mapper.ts:35`) — Currently maps to `"error executing <toolName>..."` which is clearly a placeholder/error. Phase 2 must fix this to proper tool visibility rendering.
- **No `getCommands()` in PiProcessManager interface** — The factory returns `RpcClient` methods but `getCommands()` isn't in the `PiProcessManager` interface. Phase 2 needs to add it.
</code_context>

<specifics>
## Specific Ideas

- **Collapsible tool sections via `<details>`/`<summary>`** — The user specifically wants collapsed-by-default expandable sections for tool execution in verbose mode. VS Code Chat's markdown renderer is webview-backed; researcher should verify `<details>` tag support. Fallback: custom rendering via `stream.button()` with hidden/shown content.

- **VS Code native UI for RPC requests** — The user explicitly wants `window.showQuickPick()` for selectors and `window.showInputBox()` for text input, NOT just markdown buttons. This is a strong preference for platform-native feel over custom UI.

- **`/` autocomplete on every keystroke** — The user chose always-fresh over cached. If `getCommands()` latency is noticeable (unlikely for local RPC but researcher should verify), a debounced fetch on first `/` with a short TTL cache is an acceptable fallback.
</specifics>

<deferred>
## Deferred Ideas

- **`steer()` interruption mechanism** — Excluded from interruption options for simplicity. If users request mid-response redirection that preserves context, this could be added as a third `pi.chat.interruptionBehavior` value in a future phase.
- **Per-category tool visibility toggles** — The user chose simple two-level verbose/quiet. Per-category toggles (show tool starts, partial results, completions separately) would be a configuration enhancement for a future phase.

</deferred>

---

*Phase: 2-Rich Chat Experience*
*Context gathered: 2026-06-15*
