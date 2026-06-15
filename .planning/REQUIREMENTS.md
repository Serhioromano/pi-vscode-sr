# Requirements: pi-vscode-sr

**Defined:** 2026-06-14
**Core Value:** Interact with the full Pi agent (chat, slash commands, extensions, review) entirely through VS Code's native interface without reinventing Pi's configuration, extension, or agent system.

## v1 Requirements

Requirements for the VS Code native integration milestone. Each maps to roadmap phases.

### CHAT — Chat Integration

- [x] **CHAT-01**: User can invoke `@pi` in VS Code Chat panel to start a conversation with the Pi agent
- [ ] **CHAT-02**: All Pi slash commands (`/model`, `/help`, `/plan`, `/handoff`, custom skills and agents) work through `@pi` chat — Pi engine handles them, VS Code extension passes through
- [ ] **CHAT-03**: Pi responses stream progressively in chat (token-by-token markdown) via `stream.markdown()`
- [x] **CHAT-04**: Chat messages route to Pi via `PiProcessManager` (Pi SDK RPC child process), not through VS Code LM API
- [ ] **CHAT-05**: Terminal TUI remains operational as a parallel review path — chat features must not break the existing terminal workflow

### REVW — Review Controls

- [ ] **REVW-01**: Dynamic review action buttons rendered in chat responses via `stream.button()` — actions defined by Pi's review request (approve, reject, rethink, and custom extension-defined actions beyond the standard options)
- [ ] **REVW-02**: Rethink action supports text input — user can type feedback that Pi uses to revise the proposed file
- [ ] **REVW-03**: Existing VS Code diff editor and editor title bar approve/reject buttons retained and working alongside chat buttons
- [ ] **REVW-04**: Batch followup actions ("Approve All", "Reject All") available as followup buttons after the full review response renders

### COMP — Inline Completions

- [ ] **COMP-01**: Ghost-text code suggestions appear in editor as user types, accept with Tab — registered via `InlineCompletionItemProvider`
- [ ] **COMP-02**: Keystroke debounce (300-500ms) prevents completion requests on every character — module-level debounce timer
- [ ] **COMP-03**: Feature toggle via VS Code setting `pi.inlineCompletions.enabled`, defaults to `false` (off) — user opts in explicitly
- [ ] **COMP-04**: Pending completion request cancelled via `AbortController` when user continues typing
- [ ] **COMP-05**: Completion model configurable separately from chat model in Pi config — user sets a lighter model (e.g. `deepseek-v4-flash`) for completions vs the main model (e.g. `deepseek-v4-pro`) for chat, configured through Pi, read by VS Code extension

### FOUND — Foundation

- [x] **FOUND-01**: Modular file organization — monolithic `extension.ts` (368 lines) split into separate domain files: process manager, event mapper, chat handler, review coordinator, completion provider
- [x] **FOUND-02**: All synchronous file I/O (`readFileSync`, `writeFileSync`, `mkdirSync`) migrated to async `fs.promises` equivalents
- [x] **FOUND-03**: `PiProcessManager` manages Pi child process lifecycle — start, stop, restart, health check — via Pi SDK `RpcClient`
- [x] **FOUND-04**: `RpcEventMapper` transforms Pi agent events (`agent_start`, `turn_start`, `message_update`, `tool_execution_*`, `agent_end`) to `ChatResponseStream` actions as pure, testable functions
- [x] **FOUND-05**: Phased activation pattern — extension `activate()` returns immediately (<1ms sync setup), async initialization (file watchers, Pi process start) deferred and fire-and-forget

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### CHAT — Chat Integration (v2)

- **CHAT-06**: Context variable support — `#file`, `#selection`, `#terminal` references in chat messages
- **CHAT-07**: Chat history persistence across VS Code restarts

### AGNT — Agents Window (v2)

- **AGNT-01**: Extension activates and operates in VS Code Agents Window
- **AGNT-02**: Extension opt-in via `extensions.supportAgentsWindow` setting

### COMP — Inline Completions (v2)

- **COMP-06**: LRU result cache (20 items) to reduce latency on repeated patterns
- **COMP-07**: Two-phase return — heuristic fast-path result within 120ms, full completion on next keystroke
- **COMP-08**: Multi-line completion support

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Custom chat UI / webview | VS Code Chat API provides native, themed, accessible, keyboard-navigable chat. Custom webview breaks all of this and requires ongoing maintenance. |
| Model management UI in VS Code settings | Pi already manages model config via `/model` slash command and `.pi/` config files. Duplicating in VS Code settings creates split-brain configuration. |
| Multi-session management | Pi's session model is single session per instance. VS Code Chat API also doesn't natively support multi-session per participant. Revisit for v2. |
| Replacing Pi's configuration system | Pi has a mature `.pi/` config system with `settings.json`, `models.json`, `auth.json`, skills, agents, extensions. VS Code extension reads from these — does not create parallel configuration. |
| Inline completions enabled by default | High latency risk (Pi not designed as autocomplete engine). User must explicitly opt in. |
| `@workspace` context provider | Significant infrastructure required. Defer to v2+. |
| `@vscode/chat-extension-utils` usage | Alpha-quality, designed for LM tool-calling loops, not proxying to an external agent process. |
| `request.model.sendRequest()` usage | Sends Pi prompts to Copilot/LM API instead of Pi. Extension bypasses this entirely. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Complete |
| FOUND-05 | Phase 1 | Complete |
| CHAT-01 | Phase 1 | Complete |
| CHAT-02 | Phase 2 | Pending |
| CHAT-03 | Phase 2 | Pending |
| CHAT-04 | Phase 1 | Complete |
| CHAT-05 | Phase 2 | Pending |
| REVW-01 | Phase 3 | Pending |
| REVW-02 | Phase 3 | Pending |
| REVW-03 | Phase 3 | Pending |
| REVW-04 | Phase 3 | Pending |
| COMP-01 | Phase 4 | Pending |
| COMP-02 | Phase 4 | Pending |
| COMP-03 | Phase 4 | Pending |
| COMP-04 | Phase 4 | Pending |
| COMP-05 | Phase 4 | Pending |

**Coverage:**

- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-14*
*Last updated: 2026-06-14 after roadmap creation*
