# Architecture Research

**Domain:** VS Code extension bridging an external LLM agent process (Pi) with native VS Code Chat API and InlineCompletionProvider
**Researched:** 2026-06-14
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        VS CODE EXTENSION (vscode-ext/)                       │
│                                                                              │
│  ┌──────────────────┐  ┌────────────────────┐  ┌───────────────────────────┐ │
│  │ ChatParticipant   │  │ InlineCompletion   │  │ ReviewCoordinator        │ │
│  │ Handler           │  │ Provider            │  │ (existing file watcher)  │ │
│  │ (@pi participant) │  │ (editor ghost-text) │  │                          │ │
│  └────────┬─────────┘  └─────────┬──────────┘  └───────────┬───────────────┘ │
│           │                      │                          │                 │
│           └──────────┬───────────┘                          │                 │
│                      │                                      │                 │
│              ┌───────▼────────┐                     ┌───────▼───────┐        │
│              │  RpcEventMapper │                     │ File-based IPC│        │
│              │  (AgentEvent →  │                     │   .pi/ dir    │        │
│              │   ChatResponse) │                     │  (unchanged)  │        │
│              └───────┬────────┘                     └───────┬───────┘        │
│                      │                                      │                 │
│              ┌───────▼────────┐                             │                 │
│              │ PiProcessManager│                             │                 │
│              │ (RpcClient)     │                             │                 │
│              └───────┬────────┘                             │                 │
│                      │                                      │                 │
├──────────────────────┴──────────────────────────────────────┴─────────────────┤
│                   CHILD PROCESS (Node.js)                                       │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │           Pi Agent in RPC mode (JSON lines stdin/stdout)                 │ │
│  │                                                                          │ │
│  │  ┌──────────────────────────────────────┐                                │ │
│  │  │  @earendil-works/pi-coding-agent     │                                │ │
│  │  │  (LLM, tools, session mgmt)          │                                │ │
│  │  └────────────────┬─────────────────────┘                                │ │
│  │                   │                                                      │ │
│  │  ┌────────────────▼─────────────────────┐                                │ │
│  │  │  pi-vscode-sr extension              │                                │ │
│  │  │  src/index.ts (write/edit overrides) │                                │ │
│  │  │  (loaded by Pi via extension system)  │                               │ │
│  │  └────────────────┬─────────────────────┘                                │ │
│  │                   │                                                      │ │
│  │            File-based IPC ───────────────────────────────────────────────┼──┘
│  │                   │                    (.pi/review-requests/)            │
│  └───────────────────┼──────────────────────────────────────────────────────┘
└──────────────────────┼────────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                TERMINAL CLI (existing — unchanged)                            │
│                                                                              │
│  pi-vscode-sr extension loaded by Pi framework                               │
│  Write/edit tool overrides with file-based IPC                               │
│  TUI selector + Promise.race with file polling                              │
│  Heartbeat-based VS Code readiness detection                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Two Parallel Integration Paths

The project has two distinct integration paths that coexist:

| Path | Pi Runs As | Communication | User Interface |
|------|-----------|---------------|----------------|
| **CLI terminal** (existing) | Standalone CLI process | File-based IPC via `.pi/` directory | Terminal TUI for reviews |
| **VS Code Chat** (new) | Child process managed by VS Code extension | RPC protocol (JSON lines via stdio) + file-based IPC for reviews | Native VS Code Chat panel |

The terminal CLI path is **unchanged**. The VS Code Chat path adds a new way to interact with Pi. Users can use both, either, or neither. The file-based IPC protocol remains the common bridge for review requests/results — both paths write and read from the same `.pi/` directories.

## Process Model: Why Child Process, Not In-Process

The VS Code extension **spawns Pi as a child process** in RPC mode via the Pi SDK's `RpcClient`. It does **not** import Pi's LLM code in-process.

**Why:**
- Pi loads native addons (C++), which are unsafe in VS Code's extension host process
- Pi's runtime dependencies (Node.js native modules, shell access) conflict with VS Code's sandbox
- Process isolation: if Pi crashes, VS Code stays alive; if VS Code crashes, Pi handles cleanup
- Pi manages its own state (sessions, config, model connections) independently
- Pi has dependencies that may conflict with VS Code's extension host (dual TypeScript module systems already exist)

The Pi SDK already provides `RpcClient` for exactly this purpose — it spawns Pi in RPC mode and communicates via JSON lines on stdin/stdout. This is the designed integration point.

### RPC Protocol Summary

| Direction | Format | Examples |
|-----------|--------|----------|
| VS Code → Pi | JSON command on stdin | `{"type":"prompt","message":"add error handling"}` |
| Pi → VS Code | JSON response on stdout | `{"type":"response","command":"prompt","success":true}` |
| Pi → VS Code | JSON event on stdout | `{"type":"agent_start"}`, `{"type":"message_update","message":...}` |
| Pi → VS Code | UI request on stdout | `{"type":"extension_ui_request","method":"select",...}` |
| VS Code → Pi | UI response on stdin | `{"type":"extension_ui_response","id":"...","value":"..."}` |

### Pi RPC Agent Events → ChatResponseStream Mapping

| AgentEvent | ChatResponseStream Method | Visual Effect |
|-----------|--------------------------|---------------|
| `agent_start` | `stream.progress("Pi is working...")` | Shows progress indicator |
| `turn_start` | `stream.progress("Thinking...")` | Updates progress message |
| `message_update` (with `assistantMessageEvent.text`) | `stream.markdown(text)` | Renders streaming markdown |
| `tool_execution_start` | `stream.progress("Editing: src/file.ts")` | Progress update for current tool |
| `tool_execution_end` (isError) | `stream.markdown(errorMsg)` | Shows error in chat |
| `tool_execution_end` (success + review created) | (enqueue review tracking) | Prepares buttons for agent_end |
| `agent_end` | `stream.button({command, title})` actions | Adds approve/reject buttons per review |

### Extension UI Request Mapping

When Pi RPC emits `extension_ui_request` events (from the `src/index.ts` extension calling `ctx.ui.select()` etc.), the VS Code extension intercepts them and renders native VS Code dialogs:

| UI Request Method | VS Code Equivalent |
|-------------------|-------------------|
| `select` | `vscode.window.showQuickPick()` |
| `confirm` | `vscode.window.showInformationMessage(..., {modal: true})` |
| `input` | `vscode.window.showInputBox()` |
| `notify` | `vscode.window.showInformationMessage()` / `showWarningMessage()` |
| `setStatus` | Status bar item |
| `setWidget` | Not directly mappable — defer to default |

## Component Responsibilities

| Component | File | Responsibility | Communicates With |
|-----------|------|---------------|-------------------|
| **Extension Entry** (`activate`/`deactivate`) | `vscode-ext/src/extension.ts` | Registers all components, manages subscriptions, delegates to domain classes | All other components |
| **PiProcessManager** | `vscode-ext/src/pi-process.ts` | Lifecycle of Pi RPC child process (start, stop, restart, health check) | `RpcClient` from Pi SDK; report state to other components |
| **ChatParticipantHandler** | `vscode-ext/src/chat-participant.ts` | `@pi` chat participant: routes messages to Pi, maps events to chat stream, renders buttons | `PiProcessManager`, `RpcEventMapper`, `ReviewCoordinator` |
| **InlineCompletionProvider** | `vscode-ext/src/inline-completion.ts` | `InlineCompletionItemProvider`: queries Pi for suggestions, returns completions | `PiProcessManager` |
| **ReviewCoordinator** | `vscode-ext/src/review-coordinator.ts` | File-based IPC watchers, diff editor management, approve/reject commands, chat button handlers | `PiProcessManager` (for notifying Pi of results), file system |
| **RpcEventMapper** | `vscode-ext/src/rpc-events.ts` | Pure functions: `AgentEvent` → `ChatResponseStream` method calls. No side effects. | Called by `ChatParticipantHandler` |
| **Types** | `vscode-ext/src/types.ts` | Shared interfaces (existing `ReviewRequest`, `ReviewResult`, `DiffSession` + new chat types) | All components |
| **Pi Extension** (unchanged) | `src/index.ts` | `write`/`edit` tool overrides, review lifecycle, TUI | Pi framework, file system |

### Boundary Decisions

| Boundary | Communication | Why This Way |
|----------|---------------|-------------|
| VS Code → Pi (chat) | `RpcClient.prompt()` (JSON via stdio) | Pi SDK built-in, supports streaming events back |
| VS Code → Pi (inline completion) | TBD — needs research | Full RPC agent session may be too heavy for low-latency completions |
| VS Code ↔ Pi (reviews) | File-based IPC (`./pi/`) | Backward compatible, works across all modes (CLI, RPC, missing VS Code) |
| ChatParticipantHandler ↔ ReviewCoordinator | Event emitter or shared state | Review status needed to render buttons in chat responses |
| Chat buttons → Pi | VS Code command → writes result JSON → Pi polls | Reuses existing file-based IPC result protocol |

## Recommended Project Structure

```
vscode-ext/src/
├── extension.ts              # Thin activate/deactivate — wires components together
├── types.ts                  # Shared interfaces (existing + new chat/review types)
├── pi-process.ts             # PiProcessManager — RPC child process lifecycle
├── rpc-events.ts             # RpcEventMapper — AgentEvent → ChatResponseStream mapping
├── chat-participant.ts       # ChatParticipantHandler — @pi participant registration + handler
├── inline-completion.ts      # InlineCompletionProvider — editor ghost-text suggestions
└── review-coordinator.ts     # ReviewCoordinator — file watchers, diff editors, approve/reject

src/
└── index.ts                  # Pi extension — UNCHANGED (write/edit overrides, TUI, review lifecycle)
```

### Structure Rationale

- **extension.ts stays thin:** The entry point should only register subscriptions and delegate to domain classes. Currently 368 lines doing everything — this is the first thing to fix.
- **One class/concern per file:** Each file represents a VS Code API boundary or a distinct responsibility. File count stays under 7, which is manageable.
- **pi-process.ts encapsulates RpcClient:** The Pi SDK's `RpcClient` manages a child process. Its lifecycle (start/stop/restart/health) is non-trivial and should be a self-contained module with clear disposal semantics.
- **rpc-events.ts contains pure functions:** Event mapping has no side effects, takes `AgentEvent` in, returns call descriptors out. Easy to unit test.
- **review-coordinator.ts consolidates existing diff/review logic:** Moves the file watchers, diff editor management, approve/reject, and result writing from the monolithic `extension.ts` into its own module. Also adds chat button integration.
- **src/index.ts stays untouched:** The Pi extension's tool overrides don't need changes for VS Code Chat to work. RPC mode loads extensions the same as CLI mode.

## Architectural Patterns

### Pattern 1: Process-Managed Child Process (PiProcessManager)

**What:** A class that wraps `RpcClient` from the Pi SDK, managing the Pi agent process lifecycle. It handles start, stop, restart, health checks, and clean shutdown.

**When to use:** When an external process must be spawned, monitored, and kept alive for the duration of a VS Code session.

**Trade-offs:**
- Pro: Process isolation, clean separation of concerns, uses Pi SDK's intended API
- Pro: Backward compatibility — existing terminal Pi + VS Code extension continues working
- Con: Child process adds ~200-500ms startup time
- Con: RPC overhead for each message (JSON serialize/deserialize)
- Con: If Pi crashes, the chat session state is lost (managed by Pi process)

**Example:**
```typescript
// vscode-ext/src/pi-process.ts
import { RpcClient, type AgentEvent } from '@earendil-works/pi-coding-agent';

export class PiProcessManager {
  private client: RpcClient | null = null;
  private _onEvent = new vscode.EventEmitter<AgentEvent>();

  readonly onEvent: vscode.Event<AgentEvent> = this._onEvent.event;

  async start(workspaceRoot: string): Promise<void> {
    this.client = new RpcClient({
      cwd: workspaceRoot,
      // Pi loads extensions (including src/index.ts) from its config automatically
    });
    this.client.onEvent((event) => this._onEvent.fire(event));
    await this.client.start();
    await this.client.newSession();
  }

  async stop(): Promise<void> {
    if (this.client) {
      await this.client.stop();
      this.client = null;
    }
    this._onEvent.dispose();
  }

  async sendPrompt(message: string): Promise<void> {
    if (!this.client) throw new Error('Pi not started');
    await this.client.prompt(message);
  }

  get isRunning(): boolean {
    return this.client !== null;
  }
}
```

### Pattern 2: Pure Event Mapper (RpcEventMapper)

**What:** A set of pure functions that transform `AgentEvent` objects into `ChatResponseStream` method call descriptors. The handler iterates over events and applies the mappings.

**When to use:** When a streaming protocol from one system (Pi RPC events) must be rendered in another system's streaming API (VS Code Chat), and the mapping logic should be testable without VS Code APIs.

**Trade-offs:**
- Pro: Fully unit-testable — no VS Code dependency
- Pro: Single place to update mapping when either API changes
- Con: One extra layer of abstraction
- Con: Must handle events that arrive after `agent_end` (shouldn't happen but guard against it)

**Example:**
```typescript
// vscode-ext/src/rpc-events.ts
import type { AgentEvent } from '@earendil-works/pi-coding-agent';
import type * as vscode from 'vscode';

export type StreamAction =
  | { kind: 'markdown'; text: string }
  | { kind: 'progress'; message: string }
  | { kind: 'button'; command: string; title: string; arguments: unknown[] }
  | { kind: 'error'; message: string };

export function mapEventToActions(event: AgentEvent): StreamAction[] {
  switch (event.type) {
    case 'agent_start':
      return [{ kind: 'progress', message: 'Pi is working...' }];
    case 'turn_start':
      return [{ kind: 'progress', message: 'Pi is thinking...' }];
    case 'message_update':
      // Extract text parts from assistantMessageEvent
      return extractTextParts(event.assistantMessageEvent);
    case 'tool_execution_start':
      return [{ kind: 'progress', message: `Running: ${event.toolName}` }];
    case 'tool_execution_end':
      if (event.isError) {
        return [{ kind: 'error', message: `Tool ${event.toolName} failed` }];
      }
      return [];
    case 'agent_end':
      return []; // Buttons are added by ChatParticipantHandler based on review state
    default:
      return [];
  }
}
```

### Pattern 3: Command-Mediated Chat Buttons

**What:** Chat response buttons invoke VS Code commands that are registered by `ReviewCoordinator`. The buttons are rendered at `agent_end` if any file reviews are pending. Clicking a button triggers the same approve/reject logic as the editor title bar buttons.

**When to use:** When chat responses need interactive controls that affect extension state outside the chat, such as approving file changes.

**Trade-offs:**
- Pro: Uses VS Code's native Chat API button mechanism — no custom webview
- Pro: Reuses existing approve/reject command infrastructure
- Con: Buttons are static at render time — cannot be updated after the response is sent
- Con: One button per review file means many buttons for multi-file reviews

**Example:**
```typescript
// Inside ChatParticipantHandler, after agent_end event:
if (pendingReviews.size > 0) {
  for (const [reviewId, reviewFiles] of pendingReviews) {
    stream.button({
      command: 'pi-sr.approveReview',
      title: `Approve changes in ${reviewFiles.size} file(s)`,
      arguments: [reviewId],
    });
    stream.button({
      command: 'pi-sr.rejectReview',
      title: `Reject changes in ${reviewFiles.size} file(s)`,
      arguments: [reviewId],
    });
  }
}
```

### Pattern 4: File-Based IPC as Common Ground

**What:** Both the terminal CLI path and VS Code Chat path write review requests and results to the same `.pi/` directories. The existing file-based IPC protocol remains the source of truth for review state.

**When to use:** When two independent processes (Pi CLI, VS Code extension, Pi RPC child) need a shared coordination mechanism that survives process restarts and works without a live connection.

**Trade-offs:**
- Pro: Backward compatible — existing terminal-only users are unaffected
- Pro: Survives process crashes — review requests persist on disk
- Con: No atomicity guarantees (mitigated by polling and retry)
- Con: Latency from file polling (500ms in current impl)
- Con: Race conditions when both TUI and Chat resolve the same review

## Data Flow

### Chat Message Flow

```
User types @pi "add error handling to server.ts"
    │
    ▼
ChatParticipantHandler receives ChatRequest
    │
    ├─ Check request.command for slash commands (/model, /compact, etc.)
    ├─ If slash command: RpcClient.setModel(), RpcClient.compact(), etc.
    ├─ If regular message: continue
    │
    ▼
PiProcessManager.sendPrompt("add error handling to server.ts")
    │
    ▼
RpcClient sends JSON to Pi child process stdin:
    {"type":"prompt","message":"add error handling to server.ts"}
    │
    ▼
Pi processes prompt:
    1. LLM thinks and generates tool calls
    2. write/edit tool overrides (src/index.ts) create review requests
       → writes .pi/review-requests/{uuid}.json
    3. Tool results stream back as events
    │
    ▼
RpcClient.onEvent() receives AgentEvent stream:
    agent_start → turn_start → message_update* → tool_execution_start
    → tool_execution_end → ... → agent_end
    │
    ▼
RpcEventMapper maps each event to StreamAction[]
    │
    ▼
ChatParticipantHandler applies actions to ChatResponseStream:
    stream.progress("Pi is working...")
    stream.markdown("I'll add error handling to server.ts...")
    stream.progress("Editing: server.ts")
    stream.progress("Review needed — check diff")
    │
    ▼
ReviewCoordinator (file watcher) detects new review request:
    fs.watch fires → handleRequest() → opens diff editors
    │
    ▼
agent_end → ChatParticipantHandler checks pending reviews
    │
    ▼
stream.button({command: "pi-sr.approveReview", arguments: [reviewId]})
stream.button({command: "pi-sr.rejectReview", arguments: [reviewId]})
    │
    ▼
User clicks "Approve" button in chat
    │
    ▼
pi-sr.approveReview command fires → ReviewCoordinator writes result JSON
    → .pi/review-results/{uuid}.json
    │
    ▼
Pi (RPC child process) polls and detects result → applies changes
    → LLM continues (if follow-up actions needed)
```

### Inline Completion Flow

```
User types code in editor (pauses, or explicitly triggers completions)
    │
    ▼
InlineCompletionProvider.provideInlineCompletionItems()
    │
    ├─ context.triggerKind === Automatic → return single suggestion (or none)
    ├─ context.triggerKind === Invoke → return multiple suggestions
    │
    ▼
Send completion request to Pi (exact protocol TBD — see research flags)
    │
    ▼
Pi returns completion text(s)
    │
    ▼
Return InlineCompletionItem[] or InlineCompletionList
    │
    ▼
VS Code renders ghost text in editor
    │
    ▼
User presses Tab → completion accepted, Pi notified (optional)
```

### Review Resolution Flow (Three Paths)

```
                       Review Request Created
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
      VS Code Diff Tab  Chat Button     Terminal TUI
      (existing)        (new)           (existing)
              │               │               │
              ▼               ▼               ▼
      approveCurrent()  pi-sr.approveReview  ctx.ui.select()
      or rejectCurrent() or rejectReview     (Approve/Reject/Rethink)
              │               │               │
              └───────────────┼───────────────┘
                              │
                              ▼
                    Write .pi/review-results/{uuid}.json
                              │
                              ▼
                    Pi polls and detects result
                              │
                              ▼
                    Tool override applies/rejects change
```

All three paths write to the same result JSON file in `.pi/review-results/`. The Pi process (whether CLI or RPC) polls the directory at 500ms intervals. `Promise.race()` resolves whichever path finishes first.

## State Management

### State Ownership

| State | Owner | Persistence | Notes |
|-------|-------|-------------|-------|
| Pi session state | Pi agent process (RPC child) | In-memory, Pi session files on disk | Pi handles this internally via `RpcSessionState` |
| Review requests/results | File system (`.pi/`) | On disk | Shared across processes, survives restarts |
| Diff editor sessions | `ReviewCoordinator` | In-memory (`Map<string, DiffSession>`) | Transient — rebuilt from file system if VS Code restarts |
| Pending review tracking for chat buttons | `ChatParticipantHandler` | In-memory (`Map<reviewId, reviewInfo>`) | Reset on each chat turn; reviews referenced by file UUID |
| Pi process handle | `PiProcessManager` | In-memory | Recreated on start |
| Chat history | VS Code Chat API | VS Code internal | Not managed by extension |

### State Flow

```
┌──────────────────────────────┐
│       PiProcessManager        │
│   RpcClient (child process)   │
│   ┌──────────────────────┐    │
│   │ Pending Prompts: Set │    │
│   │ IsRunning: boolean   │    │
│   └──────────────────────┘    │
└────────────┬─────────────────┘
             │ events via onEvent()
             ▼
┌──────────────────────────────┐
│     ChatParticipantHandler    │
│   ┌──────────────────────┐    │
│   │ PendingReviews: Map  │────┼──→ Used for: chat button rendering
│   │   reviewId → files[] │    │
│   │ PiProcess ref        │    │
│   └──────────────────────┘    │
└──────────────────────────────┘

┌──────────────────────────────┐
│      ReviewCoordinator        │
│   ┌──────────────────────┐    │
│   │ Sessions: Map         │────┼──→ Used for: diff tab management
│   │   tmpPath → DiffSession│   │
│   │ ReviewFiles: Map     │    │
│   │   reviewId → Set<path> │   │
│   │ Watchers: FSWatcher[]  │    │
│   └──────────────────────┘    │
└──────────────────────────────┘
```

### Avoiding State Duplication

The `pendingReviews` in `ChatParticipantHandler` and the `sessions`/`reviewFiles` in `ReviewCoordinator` both track review state. To avoid duplication:

- `ReviewCoordinator` is the **source of truth** for review state (it writes the result files)
- `ChatParticipantHandler` only tracks a **summary** (review IDs + file count) for button rendering
- When a review resolves (via any path), `ReviewCoordinator` emits an event that `ChatParticipantHandler` listens to, updating its button visibility

### Recovery on VS Code Restart

1. VS Code restarts, extension activates
2. `PiProcessManager.start()` spawns new Pi RPC process
3. `ReviewCoordinator` scans `.pi/review-requests/` for incomplete reviews
4. Opens diff editors for any pending reviews
5. Pi RPC process starts fresh (no chat history), but file reviews continue independently

## Build Order

The build order is driven by dependency chains and risk:

### Phase 1: Foundation — File Restructuring
**Files:** `extension.ts`, `types.ts`, `review-coordinator.ts`
**Dependency: None** — pure refactor
**What:**
- Split `extension.ts` (368 lines) into `extension.ts` (thin entry) + `review-coordinator.ts` (file watchers, diff, approve/reject logic)
- No behavioral changes — move code, don't rewrite
- This is the lowest-risk change and immediately improves codebase health
**Avoids:** Making the monolithic file problem worse (cited as a known issue)

### Phase 2: Pi Process Manager
**Files:** `pi-process.ts`
**Dependency:** Phase 1 (needs organized file structure)
**What:**
- Implement `PiProcessManager` class wrapping `RpcClient`
- Start/stop lifecycle tied to VS Code extension activate/deactivate
- Health check + restart logic
- This is the highest-risk component (depends on Pi SDK pre-1.0 stability)
**Flags:** Needs deeper research into `RpcClient` error modes, crash recovery, and console/stderr handling

### Phase 3: Event Mapper
**Files:** `rpc-events.ts`
**Dependency:** Phase 2 (needs event types from Pi SDK)
**What:**
- Pure functions for `AgentEvent → StreamAction[]` mapping
- Handle all event types: `agent_start`, `turn_start`, `message_update`, `tool_execution_*`, `agent_end`
- Handle edge cases: empty events, unsupported event types, malformed messages
- Easily testable without VS Code APIs
**Avoids:** Coupling event transformation logic with VS Code rendering

### Phase 4: Chat Participant
**Files:** `chat-participant.ts`
**Dependency:** Phase 2 + Phase 3
**What:**
- Register `@pi` chat participant via `vscode.chat.createChatParticipant`
- Route messages: slash commands → direct RPC methods, plain messages → `RpcClient.prompt()`
- Stream responses using `RpcEventMapper`
- Render approve/reject buttons on `agent_end`
- Handle `ChatContext.history` for conversation continuity
**Avoids:** Building without the underlying process management working

### Phase 5: Chat-Review Integration
**Files:** `review-coordinator.ts` (modifications), `chat-participant.ts` (modifications)
**Dependency:** Phase 4
**What:**
- Wire approve/reject chat buttons to write review result files
- Add `onDidReceiveFeedback` handler for chat result quality tracking
- Ensure Promise.race between chat path and TUI path works correctly
- Test all three review resolution paths (diff tab, chat button, TUI)

### Phase 6: Inline Completion
**Files:** `inline-completion.ts`
**Dependency:** Phase 2 (needs Pi process)
**What:**
- Register `InlineCompletionItemProvider` for workspace languages
- Handle `Automatic` vs `Invoke` trigger kinds differently
- Query Pi for completion context
- Return completions with appropriate ranges
**Flags:** Needs deeper research — the exact mechanism for querying Pi for completions is not yet determined. Full RPC agent session may be too heavyweight for low-latency completions. Options:
- Use Pi's built-in `AutocompleteProvider` if exposed via RPC
- Send short prompts via a dedicated lightweight completion endpoint
- Use a separate Pi process dedicated to completions

## Scaling Considerations

Not applicable in the traditional sense — this is a desktop VS Code extension, not a web service. The scaling considerations are about **codebase growth** and **multi-workspace scenarios**.

| Scale Factor | Approach |
|-------------|----------|
| Codebase growth | Domain-driven file organization (7 files max per concern) prevents monolithic expansion |
| Multi-workspace windows | Each VS Code window gets its own `PiProcessManager` instance tied to its workspace root |
| Pi process lifecycle | One Pi process per VS Code window; Pi internally handles session management |
| Large chat history | Pi handles compaction internally; VS Code Chat API handles its own conversation history |

### First Bottleneck: Pi RPC Process Startup

Pi's RPC mode startup is the highest-latency operation. Users opening VS Code and immediately typing `@pi` will see a delay. Mitigation: lazy start on first `@pi` invocation rather than on extension activation, with a `stream.progress()` indicator.

## Anti-Patterns

### Anti-Pattern 1: Custom Chat Webview

**What people do:** Build a custom webview-based chat UI instead of using VS Code's native Chat API.

**Why it's wrong:** VS Code's Chat API provides accessibility, keyboard navigation, theme support, and search out of the box. A custom webview duplicates all of that, adds maintenance burden, and creates a non-native experience. The project scope explicitly excludes custom chat UI.

**Do this instead:** Register a `ChatParticipant` with `vscode.chat.createChatParticipant()`. Use `ChatResponseStream.markdown()` for rich responses and `stream.button()` for interactive controls. The only case for a webview would be visual elements Chat API doesn't support (charts, inline images) — Pi reviews don't need those.

### Anti-Pattern 2: Running Pi Logic In-Process

**What people do:** Import Pi's code directly into the VS Code extension's process (e.g., creating an `AgentSession` directly inside the extension).

**Why it's wrong:** Pi loads native addons (C++) that can crash the VS Code extension host, tying Pi's stability to VS Code's. Pi's Node.js dependencies may conflict with VS Code's runtime. The extension host can't safely run long-lived blocking operations without freezing the UI.

**Do this instead:** Spawn Pi as a child process using the Pi SDK's built-in `RpcClient`. The VS Code extension communicates over JSON lines on stdin/stdout. If Pi crashes, the extension handles it gracefully and can restart. If VS Code's extension host restarts, Pi continues running (orphaned process can be cleaned up on extension reactivation).

### Anti-Pattern 3: Duplicating Pi Configuration in VS Code Settings

**What people do:** Create VS Code settings for model selection, provider config, agent settings — duplicating what Pi already manages in `.pi/` files.

**Why it's wrong:** Creates two sources of truth. Users who configure Pi via its own system (`.pi/` config, `/model` slash command) will be confused when VS Code settings override or conflict. Maintenance doubles. The project explicitly requires Pi config to remain authoritative.

**Do this instead:** Route all configuration through the Pi RPC process. Model selection → `RpcClient.setModel()`. Config changes → send as prompt commands. VS Code settings should only control extension-specific behavior (e.g., whether to auto-open diff editors, chat response verbosity). No model/provider/agent settings in VS Code.

### Anti-Pattern 4: Mixed TUI and Chat State

**What people do:** Try to synchronize the terminal TUI state with the VS Code chat state, pausing one when the other resolves.

**Why it's wrong:** The existing architecture deliberately uses `Promise.race()` between the TUI and file polling paths. Both can resolve independently. Adding chat as a third path should follow the same pattern — write to the same result file, let the race resolve. Synchronization logic would fragile and unnecessary.

**Do this instead:** Keep the race-and-winner pattern. Chat buttons write result files the same way the TUI does. Whichever path writes first wins. The other path's result is silently ignored (as is already handled by the polling logic checking `existsSync`).

### Anti-Pattern 5: Blocking InlineCompletionProvider on Full Agent Cycle

**What people do:** Route every inline completion trigger through the full RPC agent cycle (agent_start → turn_start → LLM → agent_end).

**Why it's wrong:** Inline completions need sub-second latency. A full agent cycle with tool setup, prompt engineering, and model initialization takes 5-30 seconds. Users expect ghost-text to appear as they type, not after they've moved on.

**Do this instead:** Use a lightweight completion mechanism. Either:
- Pi's built-in `AutocompleteProvider` (if exposed via RPC or importable separately)
- A dedicated "completion mode" in the RPC protocol that skips agent setup
- Or, for MVP, disable automatic inline completions and only support explicit trigger (Ctrl+Space) with a progress indicator. This is honest with users about latency constraints.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Pi agent process | `RpcClient` from Pi SDK (child process, JSON-line stdin/stdout) | Designed for exactly this use case; handles process management, event streaming |
| VS Code Chat API | `vscode.chat.createChatParticipant()` + `ChatRequestHandler` | Native API, no dependencies needed |
| VS Code InlineCompletion API | `vscode.languages.registerInlineCompletionItemProvider()` | Native API, register once per workspace language selector |
| File system (`.pi/`) | `fs.watch` + `fs.readFileSync`/`writeFileSync` | Existing protocol, unchanged |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `PiProcessManager` → `ChatParticipantHandler` | `vscode.Event<AgentEvent>` | Events emitted by RpcClient, consumed by handler |
| `ChatParticipantHandler` → `PiProcessManager` | Direct method calls: `sendPrompt()`, `setModel()`, `abort()` | Synchronous-ish calls that enqueue work on Pi's stdin |
| `ReviewCoordinator` → `ChatParticipantHandler` | `vscode.Event<ReviewEvent>` | ReviewCoordinator emits review resolution events; ChatParticipantHandler updates button visibility |
| `ChatParticipantHandler` → `ReviewCoordinator` | VS Code command (`pi-sr.approveReview`) | Chat buttons invoke commands that ReviewCoordinator handles |
| All ↔ Pi process | File-based IPC (`.pi/` dir) | Common ground for review requests/results across all paths |

## Questions Needing Deeper Research

| Question | Affects Phase | Impact |
|----------|---------------|--------|
| What happens when `RpcClient` process crashes? Auto-restart? Report to user? | 2 | Error handling design |
| Can the Pi RPC session be resumed after a crash, or must it start fresh? | 2 | Session continuity |
| Does Pi's `AutocompleteProvider` have an RPC endpoint, or is it TUI-only? | 6 | Inline completion architecture |
| How does Pi handle concurrent requests (e.g., chat + inline completion at the same time)? | 5, 6 | Request queuing |
| What are the Pi SDK's breaking change patterns at ^0.74.0 (pre-1.0)? | 2 | Pin strategy, upgrade cadence |
| How does Pi's extension system interact with RPC mode — are `ctx.ui` methods proxied? | 2 | UI request handling |

## Sources

- VS Code Extension API documentation (Context7: `/websites/code_visualstudio_api`): ChatParticipant, ChatRequestHandler, ChatResponseStream, InlineCompletionItemProvider
- Pi SDK source types (node_modules): `RpcClient`, `RpcCommand`, `RpcResponse`, `AgentEvent`, `ExtensionAPI`, `AutocompleteProviderFactory`
- Pi SDK dist files: `rpc-client.d.ts`, `rpc-types.d.ts`, `rpc-mode.d.ts`, `types.d.ts` (extensions)
- VS Code Extension Samples (Context7: `/microsoft/vscode-extension-samples`): Chat sample with tool calling
- Existing codebase analysis: `.planning/codebase/ARCHITECTURE.md`, `src/index.ts`, `vscode-ext/src/extension.ts`

---
*Architecture research for: VS Code agent bridge with Chat API + InlineCompletionProvider*
*Researched: 2026-06-14*
