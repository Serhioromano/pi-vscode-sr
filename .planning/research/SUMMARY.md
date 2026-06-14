# Project Research Summary

**Project:** pi-vscode-sr — VS Code extension bridging Pi coding agent with native VS Code Chat API and InlineCompletionProvider
**Domain:** VS Code AI agent extension (Chat participant + InlineCompletionProvider + file-based IPC)
**Researched:** 2026-06-14
**Confidence:** HIGH

## Executive Summary

This project integrates an external LLM agent (Pi) into VS Code's native Chat panel and editor completion system. Unlike Copilot, Cline, or Continue — which either embed their own models or proxy through a cloud service — Pi runs as an independent process with its own session management, model configuration, and extensibility system (skills, agents, extensions). The VS Code extension is a bridge layer that surfaces Pi's capabilities through VS Code's Chat Participant API (`@pi`) and InlineCompletionItemProvider, while retaining existing terminal TUI and file-based IPC pathways as parallel integration channels.

The recommended approach, confirmed unanimously across all four research documents, is a **child process architecture**: spawn Pi as an RPC child process using the Pi SDK's built-in `RpcClient`, communicate via JSON lines over stdin/stdout for chat, and retain file-based IPC (`.pi/` directory) for review request/result coordination. This preserves process isolation (Pi can crash without taking down VS Code), backward compatibility with terminal-only users, and uses Pi's designed integration point. The three research flags (Pi SDK crash recovery, inline completion protocol, concurrent request queuing) are manageable with standard patterns from competitors like OpenCode and Continue.dev.

The key risks are: (1) Pi SDK pre-1.0 breaking changes (mitigate by pinning exact version), (2) 120ms implicit deadline for inline completions vs Pi's multi-second latency (mitigate by aggressive caching and two-phase return), and (3) file-based IPC corruption without atomicity guarantees (mitigate by write-then-rename pattern and corruption recovery). None of these are blockers with proper design, but they warrant explicit testing in each phase.

## Key Findings

### Recommended Stack

The VS Code Chat Participant API (`vscode.chat.createChatParticipant`, available since 1.82) is the correct integration point. The project deliberately bypasses `request.model.sendRequest()` because Pi manages its own models — the extension routes messages to Pi via `RpcClient`, not through Copilot's LM infrastructure. The VS Code engine minimum of `^1.82.0` is sufficient for all chat features; bumping to `^1.98.0` is recommended for better type definitions but not required.

**Core technologies:**
- **VS Code Chat API** (`@types/vscode@^1.82.0`): Register `@pi` chat participant — native, accessible, keyboard-navigable chat in VS Code's panel. No custom UI needed.
- **Pi SDK `RpcClient`** (`@earendil-works/pi-coding-agent@^0.74.0`): Spawn Pi as child process, communicate via JSON lines over stdin/stdout. Designed integration point for the bridge pattern.
- **`lodash.debounce` or `@thi.ng/async`**: Debounce InlineCompletionItemProvider calls (300-500ms). Every competitor (Continue at 350ms, Void at 500ms) uses this pattern — mandatory, not optional.
- **`async-mutex`** (optional): File locking for `.pi/` IPC to prevent corruption from concurrent writes.

**Do NOT use:**
- `@vscode/chat-extension-utils` (alpha-quality, designed for LM tool-calling loops, irrelevant for proxying to an external agent)
- `request.model.sendRequest()` (sends Pi prompts to Copilot instead of Pi)
- Custom WebviewView chat UI (loses native accessibility, theming, keyboard nav)
- `selectChatModels()` / `vscode.lm.selectChatModels()` (deprecated API)

### Expected Features

**Must have (table stakes) — P1/P0:**
- **`@pi` chat participant** — Register in VS Code Chat panel. Forward messages to Pi via RPC. Stream responses via `stream.markdown()`. Foundation for everything else.
- **Slash command forwarding** — All Pi built-in and custom slash commands (`/model`, `/skill`, `/agent`, `/help`, `/plan`, `/handoff`, `/bmad`, etc.) work through `@pi`.
- **Context references** — `#file`, `#selection`, and other `@variable` references supported in chat messages.
- **Visual approve/reject controls in chat responses** — Per-file approve/reject/rethink buttons rendered via `stream.button()` when Pi proposes changes. Uses workaround for the Chat API limitation (buttons cannot be visually grouped; use filetree + per-file button pattern).
- **Terminal TUI retention** — The existing Pi TUI must continue working in parallel. P0: do not break.
- **Diff view for proposed file changes** — Already implemented in v1.4.7. Retain and enhance.
- **Streaming responses** — Pi responses appear progressively in chat via `RpcEventMapper` mapping `AgentEvent` to `ChatResponseStream` actions.

**Should have (competitive) — P2:**
- **Review state lifecycle in chat** — Track per-file approve/reject state across multiple chat turns. Show summary when all files resolved.
- **Button grouping workaround** — Monitor microsoft/vscode#228038 for API improvements; improve UX when available.

**Defer (v3+) — P3:**
- **Inline ghost-text completions** — Register InlineCompletionProvider. Requires solving 120ms deadline. Lower urgency since Pi is a chat agent, not an autocomplete engine. Implement in a later milestone.
- **`@workspace` context provider** — Index workspace for codebase-aware context. Significant infrastructure.
- **Chat session persistence** — Restore chat history on VS Code reload.
- **VS Code Agents Window support** — Deferred per PROJECT.md.
- **Multi-session support** — Requires Pi engine changes.

### Architecture Approach

The architecture uses a **child process bridge pattern**: the VS Code extension spawns Pi via the Pi SDK's `RpcClient`, communicates bidirectionally over JSON lines on stdin/stdout for chat, and retains file-based IPC (`.pi/` directory) for review request/result coordination. This gives three parallel review resolution paths (diff editor tabs, chat buttons, terminal TUI) all converging on the same result file protocol.

**Major components:**
1. **PiProcessManager** (`pi-process.ts`) — Wraps `RpcClient`, manages Pi child process lifecycle (start, stop, restart, health check, cancellation relay). Highest-risk component due to Pi SDK pre-1.0 dependency.
2. **RpcEventMapper** (`rpc-events.ts`) — Pure functions transforming `AgentEvent` objects (agent_start, turn_start, message_update, tool_execution_*, agent_end) into `ChatResponseStream` actions. Fully unit-testable without VS Code APIs.
3. **ChatParticipantHandler** (`chat-participant.ts`) — Registers `@pi` participant, routes messages to Pi, applies event mappings to chat stream, renders approve/reject buttons on `agent_end`.
4. **ReviewCoordinator** (`review-coordinator.ts`) — File watchers on `.pi/review-requests/` and `.pi/review-results/`, diff editor management, approve/reject command handlers. Consolidates existing logic from the monolithic `extension.ts`.
5. **InlineCompletionProvider** (`inline-completion.ts`) — Registers `InlineCompletionItemProvider`, debounces keystrokes, queries Pi for completions. Independent dependency chain — can be built separately from chat features.

**Architectural patterns:**
- Process-Managed Child Process (PiProcessManager wrapping RpcClient)
- Pure Event Mapper (RpcEventMapper — testable without VS Code)
- Command-Mediated Chat Buttons (stream.button invokes VS Code commands -> ReviewCoordinator)
- File-Based IPC as Common Ground (`.pi/` shared across all three resolution paths)

### Critical Pitfalls

1. **Transactional Chat API prevents proactive messaging** — ChatRequestHandler is strictly request-response. Cannot push unsolicited updates (review completed, tool finished) into chat. Use VS Code notifications for async events. Enforce from Phase 1: never hold stream reference after handler returns.

2. **InlineCompletionProvider fires on every keystroke with no built-in debounce** — Without 300-500ms debounce, every character triggers a completion request, flooding Pi and causing CPU churn. Must implement module-level debounce timer from day one of Phase 4.

3. **Sync I/O blocks extension host main thread** — Existing codebase uses `readFileSync`/`writeFileSync` exclusively, which blocks VS Code's single extension thread. Migrate all I/O to `fs.promises` in Phase 0 before adding features. VS Code will show "extension is slow" warnings otherwise.

4. **120ms implicit deadline for inline completions** — VS Code drops suggestions that take longer than ~120ms. Pi agent latency (model inference + network) almost always exceeds this. Requires aggressive caching, two-phase return (heuristic immediately, full completion later), and honest latency communication.

5. **File-based IPC without atomicity causes corruption** — `.pi/` directory writes have no atomicity guarantees. Partial writes (crash mid-write, WSL filesystem latency) leave corrupt JSON that silently breaks the review protocol. Mitigate with write-then-rename (.tmp + fs.rename) and corruption recovery (move to `.pi/corrupt/` + error status back).

## Implications for Roadmap

Based on research, the recommended phase structure is:

### Phase 0: Foundation — File Restructuring and Async Migration
**Rationale:** Prerequisite for everything. The current `extension.ts` (368 lines) does everything in one monolithic file with synchronous I/O. Every component built on top will inherit the same structural and performance problems.
**Delivers:** Clean file organization (extension.ts + types.ts + review-coordinator.ts), all file I/O migrated to `fs.promises`, phased activation pattern (sync <1ms -> fire-and-forget -> lazy).
**Addresses:** Codebase health, removes "Looks Done But Isn't" activation gap.
**Avoids Pitfall 4 (sync I/O blocking main thread) and Pitfall 6 (activation timeout).**

### Phase 1: Pi Process Bridge — PiProcessManager + RpcEventMapper
**Rationale:** Foundation for all chat features. ChatParticipantHandler cannot work without a process manager and event mapper. The RpcEventMapper (pure functions) can be built and tested independently of the process manager.
**Delivers:** PiProcessManager (start/stop/restart/health of Pi RPC child process), RpcEventMapper (AgentEvent -> StreamAction mapping with tests), proper disposal and error handling.
**Uses:** Pi SDK `RpcClient`, `child_process.spawn`.
**Research flag: HIGH** — Pi SDK pre-1.0 stability unknown. Needs: crash recovery strategy, RPC error modes, `ctx.ui` proxying in RPC mode. Plan for a spike before this phase.
**Avoids Pitfall 8 (sendRequest consent dialog — PiProcessManager bypasses VS Code LM API entirely).**

### Phase 2: @pi Chat Participant — ChatParticipantHandler
**Rationale:** Core integration. The `@pi` participant is the foundation for all chat features. Depends on Phase 1 (needs PiProcessManager and RpcEventMapper).
**Delivers:** Registration of `@pi` chat participant (package.json contributes + createChatParticipant), slash command forwarding, context variable support (#file, #selection), streaming response rendering, ChatContext.history for conversation continuity.
**Addresses features:** @pi chat participant (P1), slash command forwarding (P1), context variable support (P1), streaming responses (table stakes).
**Avoids Pitfall 1 (transactional Chat API — enforce request-response contract, no stream retention), Pitfall 9 (token counting — always pass strings not objects), Pitfall 10 (stream error handling — try/catch around for await, user-visible error messages).**

### Phase 3: Visual Approve/Reject in Chat — Chat-Review Integration
**Rationale:** Depends on Phase 2 (chat participant exists) and existing ReviewCoordinator from Phase 0. The chat buttons need to wire into the same review result protocol as diff editor and TUI paths.
**Delivers:** Approve/reject/rethink buttons rendered via stream.button() on agent_end, command handlers for pi-sr.approveFile/pi-sr.rejectFile/pi-sr.openDiff, per-file review state tracking, followup buttons for batch actions (Approve All, Reject All), Promise.race compatibility with TUI path.
**Addresses features:** Visual approve/reject in chat (P1), review state lifecycle in chat (P2), button grouping workaround (P2).
**Uses:** Existing file-based IPC protocol (`.pi/review-results/`), Chat API button limitation workaround.
**Avoids Pitfall 5 (file-based IPC corruption — hardened in this phase with write-then-rename and corruption recovery).**

### Phase 4: Inline Ghost-Text Completions — InlineCompletionProvider
**Rationale:** Independent of chat features (no dependency on Phases 2-3). Depends only on Phase 1 (PiProcessManager for communicating with Pi). Listed as P3 in feature research — lower urgency, higher complexity.
**Delivers:** InlineCompletionItemProvider registration, 300-500ms debounce, Pi completion query (protocol TBD), LRU caching (20 items), Automatic vs Invoke trigger kind handling, cancellation relay.
**Addresses features:** Inline ghost-text completions (P3).
**Research flag: HIGH** — The exact mechanism for querying Pi for completions is NOT determined by research. Options: Pi's built-in AutocompleteProvider (if exposed via RPC), dedicated lightweight completion endpoint, or separate Pi process for completions. Needs a dedicated research spike.
**Avoids Pitfall 2 (no debounce — 300-500ms debounce), Pitfall 3 (cancellation — check after every await), Pitfall 7 (120ms deadline — two-phase return + LRU cache), Pitfall 8 (consent dialog — route through Pi agent directly, not VS Code LM API).**

### Phase Ordering Rationale

- **Phase 0 (Foundation) must come first** because every subsequent phase inherits the monolithic file structure and sync I/O problem. Building features on a broken foundation multiplies tech debt.
- **Phase 1 (Pi Process Bridge) before Phase 2 (Chat Participant)** because ChatParticipantHandler needs a working PiProcessManager and RpcEventMapper. These are the highest-risk components and should be validated independently before layering chat on top.
- **Phase 2 (Chat Participant) before Phase 3 (Chat-Review Integration)** because visual approve/reject buttons require an existing chat response stream to render into.
- **Phase 4 (Inline Completion) is independent** and can be deferred to a later milestone. It shares the PiProcessManager dependency with chat features but otherwise has no coupling.
- **Phase 0, 1, 2, 3 are the core v1 milestone** (chat participant + visual approve/reject). Phase 4 (inline completion) is the stretch goal that can slip to v2.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Pi Process Bridge):** High complexity, Pi SDK pre-1.0. Needs: RpcClient error mode documentation, crash recovery patterns, `ctx.ui` proxying behavior in RPC mode, concurrent request queuing semantics. Plan a 2-3 day research spike.
- **Phase 4 (Inline Completion):** Undefined protocol for querying Pi for completions. Needs: determine if Pi has an AutocompleteProvider RPC endpoint, or if a custom lightweight protocol is needed. Full research spike required.

Phases with standard patterns (skip research-phase):
- **Phase 0 (Foundation):** Standard VS Code extension refactoring. Well-documented patterns (split monolithic activate, fs.promises migration, phased activation). Skip research.
- **Phase 2 (Chat Participant):** Well-documented VS Code Chat API with official samples and tutorials. The unique aspect (routing to external agent instead of LM API) is what makes it work, not complexity. Skip research.
- **Phase 3 (Chat-Review Integration):** The Chat API button limitation is documented (microsoft/vscode#228038). The workaround pattern is established. Skip research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against VS Code API docs, Pi SDK source types, and competitor reference implementations (Continue, Void, OpenCode). The recommendation to bypass `request.model` and use Pi's own model management is sound. |
| Features | HIGH | Competitive landscape analysis covers 7 competitors (Copilot, Cline, Continue, Cody, Tabnine, Amazon Q, Supermaven). Feature parity decisions are well-substantiated. The P1/P2/P3 priority scheme accounts for Chat API limitations. |
| Architecture | HIGH | Design is based on Pi SDK's explicit RPC integration point, VS Code Chat API documentation, and existing codebase analysis. The child process bridge pattern is the standard approach used by OpenCode and recommended by VS Code extension samples. |
| Pitfalls | HIGH | All 10 critical pitfalls are sourced from official VS Code issues, GitHub discussions, or documented competitor incidents. The recovery strategies are grounded in real-world failures (RooCode O(n^2), Claude Code session accumulation, Cline token counting bug). |

**Overall confidence:** HIGH

### Gaps to Address

The following gaps could not be resolved during research and must be addressed during implementation:

- **Pi SDK RpcClient error modes** — The exact error types, crash behavior, and restart semantics of `RpcClient` at `^0.74.0` are not documented in source types. Plan a spike in Phase 1 to test: kill child process, malformed JSON input, concurrent prompts, missing workspace.
- **Inline completion protocol** — No documentation exists for querying Pi for completions via RPC. Is Pi's `AutocompleteProvider` exposed as an RPC endpoint? Does it support FIM (Fill-in-the-Middle)? Full research spike needed before Phase 4.
- **Concurrent request handling** — How does Pi handle simultaneous requests (chat message + inline completion at the same time)? Does `RpcClient` queue requests or error on concurrent prompts? Must be tested during Phase 1 spike.
- **WSL filesystem performance** — File-based IPC latency on WSL (DrvFs) is 10-100x slower than Linux native. If a significant portion of users are on WSL, consider adding socket-based IPC as an alternative path.
- **Pi SDK breaking change risk** — At `^0.74.0` (pre-1.0), any minor bump can break the RpcClient API. Pin exact version and add integration tests that run against the pinned version.

## Sources

### Primary (HIGH confidence)
- **VS Code API Documentation** (Context7: `/websites/code_visualstudio_api`) — `createChatParticipant`, `ChatResponseStream`, `InlineCompletionItemProvider`, `InlineCompletionItem` API signatures and examples
- **VS Code Chat Extension Guide** (Context7: `/microsoft/vscode-docs`) — Chat participant tutorial, slash commands, followupProvider, `package.json` contributions
- **Pi SDK source types** (node_modules) — `RpcClient`, `RpcCommand`, `RpcResponse`, `AgentEvent`, `ExtensionAPI`, `AutocompleteProviderFactory`
- **Pi SDK dist files** — `rpc-client.d.ts`, `rpc-types.d.ts`, `rpc-mode.d.ts`, `types.d.ts`
- **Existing codebase analysis** — `.planning/codebase/ARCHITECTURE.md`, `src/index.ts`, `vscode-ext/src/extension.ts`
- **VS Code Extension Samples** (Context7: `/microsoft/vscode-extension-samples`) — Chat sample with tool calling
- **Microsoft VS Code release notes** (v1_82, v1_98, v1_100, v1_122) — Chat API evolution, BYOK changes, InlineCompletion changes

### Secondary (MEDIUM confidence)
- **OpenCode PR #15501** — Reference implementation of chat participant with external agent process (ACP over stdio) [MEDIUM: single implementation reference]
- **Continue.dev autocomplete system** (DeepWiki) — Debouncing (350ms), FIM templates, context gathering, LRU caching patterns [MEDIUM: well-known project but not official docs]
- **Void editor autocomplete** (DeepWiki) — 500ms debounce, LRU cache (20 items), concurrency control (max 2 pending) [MEDIUM: same caveat]
- **Cody VS Code architecture** (DeepWiki) — Complex initialization, multi-session state, observable patterns, disposal requirements [MEDIUM]
- **Competitor feature documentation** — Continue.dev docs, Sourcegraph Cody docs, Tabnine docs, Amazon Q docs, Cline docs, Codeium Windsurf docs, Supermaven docs [MEDIUM: marketing documentation may not reflect implementation reality]

### Tertiary (LOW confidence)
- **GitHub community discussions** — microsoft/vscode-discussions#2595 (Copilot requirement), robpitcher/forge#53 (Chat API migration), HAZat/pi-config references [LOW: single-source anecdotes]
- **Blog posts and community articles** — CSDN profiling data (sync I/O latency), memo.d.foundation Cline breakdown [LOW: not authoritative]

---

*Research completed: 2026-06-14*
*Ready for roadmap: yes*
