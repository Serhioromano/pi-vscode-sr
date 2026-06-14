# Phase 1: Foundation + Chat Basics - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the modular refactoring, async I/O migration, Pi child process management, and the `@pi` chat participant. When complete, a user can type `@pi` in the VS Code Chat panel, send a message, and receive a response routed through a properly managed Pi child process — all on a clean, modular codebase foundation.

**Delivers:** FOUND-01 through FOUND-05, CHAT-01, CHAT-04 (7 requirements)
**Does NOT deliver:** Streaming responses, slash commands, review buttons in chat, inline completions (those are Phase 2-4)

Existing diff review via file-based IPC + terminal TUI must continue working throughout.
</domain>

<decisions>
## Implementation Decisions

### Module Organization
- **D-01:** Function-based modules — no classes. Consistent with existing codebase patterns (no classes anywhere today).
- **D-02:** Factory functions with closure-based state — no module-level mutable `let`/`const` state. Each module exports a `createXxx(opts)` factory that returns `{ methods, state }` via closure. Enables teardown and testability.
- **D-03:** Flat domain files in `vscode-ext/src/` — `pi-process-manager.ts`, `event-mapper.ts`, `chat-handler.ts`, `review-coordinator.ts`, plus existing `types.ts` and `extension.ts`. No subdirectories.
- **D-04:** Minimal extraction in `activate()` — delegates to module functions (`startHeartbeat()`, `watchRequests()`, etc.) but keeps the same structural flow. Not a full orchestrator rewrite.

### Pi Process Lifecycle
- **D-05:** Lazy start — Pi process spawns on the first `@pi` chat message, not on VS Code activation. Zero memory/CPU overhead when unused. First message has startup latency; subsequent messages are instant.
- **D-06:** Crash visibility — if Pi process exits unexpectedly, show the error in chat (for debugging), note that `pi -c` can resume the session, and let the user restart by sending another message. No silent restarts.
- **D-07:** Pi must be pre-installed — check `pi --version` on activation. Do NOT bundle Pi with the VS Code extension. If Pi is not found, show a one-time setup message.
- **D-08:** Workspace-isolated sessions — when the user switches VS Code workspaces, save the current Pi session state, stop the process for the old workspace, and restore (or start fresh) for the new workspace. Switching back restores the saved session. No progress lost across workspace switches.

### Shared Code Strategy
- **D-09:** `shared/` directory at project root — contains TypeScript interfaces (`ReviewRequest`, `ReviewResult`, `DiffSession`, etc.), IPC protocol constants (`.pi/review-requests/`, `.pi/review-results/` paths), and reusable utilities (`resolveSafe` path normalization).
- **D-10:** ESM `import`/`export` everywhere — both root and vscode-ext consume `shared/` via standard ESM imports. No dual CJS/ESM compilation needed. The vscode-ext package is confirmed to work with ESM imports despite its `commonjs` tsconfig history.

### Refactoring Approach
- **D-11:** Deep restructuring — extract to domain modules, migrate ALL synchronous file I/O (`readFileSync`, `writeFileSync`, `mkdirSync`) to async `fs.promises`, fix empty `catch {}` blocks with at minimum `console.error`, and redesign internal API boundaries between the process manager, event mapper, chat handler, and review coordinator.
- **D-12:** Both packages refactored — `src/index.ts` (470 lines, Pi extension) and `vscode-ext/src/extension.ts` (368 lines, VS Code extension) both get the same deep treatment. Dedicated git branch for Phase 1 so `main` stays untouched if the refactoring fails.
- **D-13:** Tests for all new code — set up a test runner (vitest or node:test), write tests for `RpcEventMapper` (pure functions, ideal for unit testing), path utilities, IPC message validation, and any other new domain logic. Existing code gets tests as it's refactored.

### Claude's Discretion
No areas were explicitly delegated — all decisions were user-confirmed.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Definition
- `.planning/ROADMAP.md` — Phase 1 scope, success criteria, requirements mapping
- `.planning/REQUIREMENTS.md` — Full v1 requirement definitions (FOUND-01 through FOUND-05, CHAT-01, CHAT-04)
- `.planning/PROJECT.md` — Core value, constraints, key decisions, out-of-scope items

### Codebase Intelligence
- `.planning/codebase/ARCHITECTURE.md` — Current system overview, component responsibilities, data flows, IPC patterns
- `.planning/codebase/CONVENTIONS.md` — TypeScript strictness, naming patterns, error handling conventions, async patterns, indentation rules (root 4-space, vscode-ext 2-space)
- `.planning/codebase/STACK.md` — Runtime requirements, Pi SDK version, framework dependencies
- `.planning/codebase/CONCERNS.md` — Known technical debt (empty catches, sync I/O, duplicated code, monolithic files, zero tests)

### Source Code (current implementation)
- `src/index.ts` — Pi extension: tool overrides, review lifecycle, TUI selector (470 lines, will be refactored)
- `vscode-ext/src/extension.ts` — VS Code extension: activation, diff handling, approve/reject, IPC (368 lines, will be refactored)
- `vscode-ext/src/types.ts` — Shared IPC types (will move to `shared/`)

### Pi SDK API Surface
- `node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.d.ts` — `RpcClient` class: `start()`, `stop()`, `onEvent()`, `prompt()`, `abort()`, `getCommands()`, `waitForIdle()`, etc.
- `node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-types.d.ts` — RPC protocol types: `RpcCommand`, `RpcResponse`, `RpcSessionState`, `RpcSlashCommand`
- `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/index.d.ts` — `AgentEvent` types: `agent_start`, `turn_start`, `message_update`, `tool_execution_*`, `agent_end`, and more
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`RpcClient`** (Pi SDK) — fully typed child process manager. Handles JSON-line protocol over stdin/stdout. Supports `prompt()`, `onEvent()`, `getCommands()`, `abort()`, lifecycle management. Phase 1 wraps this in `createPiProcessManager()`.
- **`ReviewRequest` / `ReviewResult` types** — existing IPC schemas in `vscode-ext/src/types.ts`. Move to `shared/`, no redesign needed.
- **`resolveSafe()`** — path normalization at `src/index.ts:233` and `vscode-ext/src/extension.ts:82`. Extract to `shared/` to eliminate duplication.
- **Heartbeat pattern** — `setInterval` writing timestamp to `.pi/.vscode-ready`. Keep in `activate()`, delegate to a helper function.

### Established Patterns
- **Tool override pattern** — registering tools with the same name as built-ins. Pi extension uses this for `write`/`edit`. Preserved — Phase 1 doesn't touch tool overrides beyond extracting them to a separate file.
- **File-based IPC** — `.pi/review-requests/` and `.pi/review-results/` protocol. Preserved for backward compatibility. Chat responses go through VS Code Chat API, NOT through `.pi/`.
- **Result object pattern** — `{ content, details, isError? }` for tool results. `{ status, files }` for review results. Continue in new code.
- **Guard clause flow** — early returns, switch/case. Continue in new code.

### Integration Points
- **`activate()` in `extension.ts`** — extension entry point. Will delegate to new modules but keep the same registration flow (commands, watchers, heartbeat).
- **`deactivate()` in `extension.ts`** — cleanup. Will call each factory's teardown.
- **`vscode.chat.createChatParticipant()`** — VS Code Chat API. New integration point. Called in `activate()` or deferred init. Registers the `@pi` participant.
- **Existing diff review commands** — `pi-sr.approveCurrent`, `pi-sr.rejectCurrent`. Move to `review-coordinator.ts`, keep command IDs unchanged.
- **Pi extension `export default function(pi: ExtensionAPI)`** — Pi framework entry point. Extract tool registrations to `tool-overrides.ts`, lifecycle handlers to separate modules.
</code_context>

<specifics>
## Specific Ideas

- **Workspace isolation persistence** — when switching workspaces, save session state keyed by workspace path. On return, restore the Pi process with its previous session context. The user explicitly wants no progress lost on workspace switch.
- **Pi crash message** — should be visible and actionable: show what happened (stderr output), note that `pi -c` can resume the session, and let the user decide when to reconnect by sending a new message.
- **Dedicated git branch** — create a Phase 1 branch before any refactoring. If the deep restructuring fails or breaks the review flow, `main` is untouched.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.
</deferred>

---

*Phase: 1-Foundation + Chat Basics*
*Context gathered: 2026-06-14*
