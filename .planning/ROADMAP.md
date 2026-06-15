# Roadmap: pi-vscode-sr -- VS Code Native Integration

## Overview

This roadmap transforms the pi-vscode-sr VS Code extension from a file-IPC-and-terminal-TUI tool into a full native VS Code integration. Starting with a foundation refactoring and `@pi` chat participant, we add streaming responses and slash commands, then visual review controls inline in chat, and finally ghost-text inline completions with configuration. Each phase delivers a working end-to-end user capability.

## Phases

- [x] **Phase 1: Foundation + Chat Basics** -- Modular refactoring, Pi process bridge, async migration, and basic `@pi` chat participant with message routing (completed 2026-06-15)
- [x] **Phase 2: Rich Chat Experience** -- Streaming markdown responses, slash command forwarding, terminal TUI retention verification (completed 2026-06-15)
- [ ] **Phase 3: Visual Review Controls** -- Approve/reject/rethink buttons rendered inline in chat responses with batch actions
- [ ] **Phase 4: Inline Completions** -- Ghost-text code suggestions with keystroke debounce, cancellation, feature toggle, and separate model configuration

## Phase Details

### Phase 1: Foundation + Chat Basics

**Goal**: User can invoke `@pi` in VS Code Chat and send/receive messages routed through a properly managed Pi child process
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, CHAT-01, CHAT-04
**Success Criteria** (what must be TRUE):

  1. User can type `@pi` in VS Code Chat panel and send a message to the Pi agent -- the participant is registered via `vscode.chat.createChatParticipant`
  2. Pi responds to chat messages routed through `PiProcessManager` (RPC child process via Pi SDK `RpcClient`)
  3. Extension activates without VS Code "extension is slow" warnings -- all file I/O migrated to async `fs.promises`, activation returns synchronously in <1ms with deferred async initialization
  4. Extension code is organized into separate domain files (process manager, event mapper, chat handler, review coordinator) -- no monolithic `extension.ts`
  5. `RpcEventMapper` correctly transforms Pi `AgentEvent` types (`agent_start`, `turn_start`, `message_update`, `tool_execution_*`, `agent_end`) to `ChatResponseStream` actions as pure, testable functions

**Plans**: 5 plansPlans:
**Wave 1**

- [x] 01-01-PLAN.md -- Foundation: shared/ module + test infra + git branch

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md -- VS Code extension refactoring: review-coordinator, utils, deferred activation
- [x] 01-03-PLAN.md -- Pi extension refactoring: tool-overrides, review-lifecycle modules
- [x] 01-04-PLAN.md -- Event mapper (pure functions) + Pi process manager (factory wrapping RpcClient)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-05-PLAN.md -- Chat integration: chat-handler, extension.ts wiring, @pi participant

**UI hint**: yes

### Phase 2: Rich Chat Experience

**Goal**: User sees streaming markdown responses, uses Pi slash commands through `@pi`, and terminal TUI remains unaffected
**Depends on**: Phase 1
**Requirements**: CHAT-02, CHAT-03, CHAT-05
**Success Criteria** (what must be TRUE):

  1. User can type `/model`, `/help`, `/plan`, `/handoff`, and custom skill/agent slash commands in `@pi` chat -- Pi engine handles them, VS Code extension passes through without interpretation
  2. Pi responses stream token-by-token in chat as progressive markdown via `stream.markdown()` -- not delivered as a single block
  3. Terminal TUI remains fully operational alongside chat -- user can switch between VS Code Chat panel and terminal Pi workflow without interruption or conflicts

**Plans**: 4 plans
**UI hint**: yes

**Wave 1**
- [x] 02-01-PLAN.md -- Infrastructure: PiProcessManager interface extensions, VS Code settings, RPC UI handler factory
- [x] 02-02-PLAN.md -- Event mapper: tool visibility with collapsible `<details>` sections, buffered HTML output
- [x] 02-03-PLAN.md -- Chat handler: progressive streaming via `onEvent()` + `prompt()`, interruption handling, slash passthrough

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-04-PLAN.md -- Extension wiring: settings integration, RPC UI handler registration, followup provider

### Phase 3: Visual Review Controls

**Goal**: User can approve, reject, or rethink Pi file changes directly from chat without switching to terminal TUI
**Depends on**: Phase 2
**Requirements**: REVW-01, REVW-02, REVW-03, REVW-04
**Success Criteria** (what must be TRUE):

  1. When Pi proposes file changes, approve/reject/rethink buttons appear inline in the chat response via `stream.button()` -- actions defined by Pi's review request
  2. User can click "Rethink" and type feedback text that Pi uses to revise the proposed file
  3. Existing VS Code diff editor with editor title bar approve/reject buttons retains full functionality alongside chat buttons -- both review paths work in parallel
  4. For multi-file reviews, "Approve All" / "Reject All" batch followup buttons appear after the full review response renders
  5. Custom extension-defined actions (beyond standard approve/reject/rethink) appear as buttons in chat

**Plans**: TBD
**UI hint**: yes

### Phase 4: Inline Completions

**Goal**: User receives ghost-text code suggestions as they type, with debounce, cancellation, and configurable behavior
**Depends on**: Phase 1 (shares PiProcessManager dependency, independent from chat/review phases)
**Requirements**: COMP-01, COMP-02, COMP-03, COMP-04, COMP-05
**Success Criteria** (what must be TRUE):

  1. Ghost-text suggestions appear inline in the editor as user types code -- registered via `InlineCompletionItemProvider`, accepted with Tab
  2. Keystrokes within 300-500ms debounce window do not trigger duplicate completion requests -- module-level debounce timer
  3. Continued typing cancels the pending completion (via `AbortController`) -- no stale suggestions appear after the user has moved on
  4. User can toggle inline completions on/off via `pi.inlineCompletions.enabled` VS Code setting (defaults to `false` -- user opts in explicitly)
  5. User can configure a separate completion model in Pi config (e.g. `deepseek-v4-flash` for completions vs `deepseek-v4-pro` for chat), read by the extension and passed to the completion provider

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation + Chat Basics | 6/6 | Complete    | 2026-06-15 |
| 2. Rich Chat Experience | 4/4 | Complete    | 2026-06-15 |
| 3. Visual Review Controls | 0/0 | Not started | - |
| 4. Inline Completions | 0/0 | Not started | - |
