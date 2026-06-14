# Phase 1: Foundation + Chat Basics - Research

**Researched:** 2026-06-14
**Domain:** VS Code Extension Architecture, Pi SDK RPC Integration, Chat API, Async Migration
**Confidence:** HIGH

## Summary

Phase 1 has two parallel tracks: (1) **deep refactoring** of the monolithic `extension.ts` and `src/index.ts` into modular domain files with async I/O and closure-based state, and (2) **new chat integration** routing `@pi` messages through a `PiProcessManager` wrapping the Pi SDK `RpcClient` over stdin/stdout JSON-line protocol.

**Key architectural insight:** The refactoring track (FOUND-01, FOUND-02, FOUND-05) removes every synchronous `fs.*Sync` call and replaces module-level `let` state with factory closures. The chat integration track (CHAT-01, CHAT-04) adds a new `chatParticipants` contribution in `package.json`, a `piProcessManager.ts` wrapping `RpcClient`, a pure `event-mapper.ts` transforming Pi `AgentEvent` -> `ChatResponseStream` actions, and a `chatHandler.ts` wireup. The existing review IPC flow must remain working throughout.

**Primary recommendation:** Start with shared/ extraction (types, path utilities) and package.json updates, then build the four domain modules in parallel with their vitest unit tests, and finally wire them in `extension.ts` with the deferred activation pattern. No classes anywhere -- all factory functions with closure state per D-01/D-02.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Function-based modules -- no classes
- **D-02:** Factory functions with closure-based state -- no module-level mutable `let`/`const`
- **D-03:** Flat domain files in `vscode-ext/src/` -- `pi-process-manager.ts`, `event-mapper.ts`, `chat-handler.ts`, `review-coordinator.ts`, plus existing `types.ts` and `extension.ts`
- **D-04:** Minimal extraction in `activate()` -- delegates to module functions but keeps same structural flow
- **D-05:** Lazy start -- Pi process spawns on first `@pi` chat message, not on activation
- **D-06:** Crash visibility -- show error in chat, note `pi -c` resume, let user restart by sending another message
- **D-07:** Pi must be pre-installed -- check `pi --version` on activation, show one-time setup if not found
- **D-08:** Workspace-isolated sessions -- save/restore Pi session state on workspace switch
- **D-09:** `shared/` directory at project root for interfaces, IPC constants, reusable utilities
- **D-10:** ESM `import`/`export` everywhere -- both root and vscode-ext consume `shared/` via ESM
- **D-11:** Deep restructuring -- extract to domain modules, migrate ALL sync I/O to async `fs.promises`, fix empty `catch {}` blocks
- **D-12:** Both packages refactored -- `src/index.ts` and `vscode-ext/src/extension.ts` both get the deep treatment
- **D-13:** Tests for all new code -- set up test runner (vitest), test RpcEventMapper (pure functions), path utils, IPC validation

### Claude's Discretion
No areas explicitly delegated -- all decisions were user-confirmed.

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | Modular file organization -- split monolithic extension.ts into domain files | D-03 defines the exact file split. See `## Architecture Patterns` for recommended project structure |
| FOUND-02 | All sync I/O migrated to async `fs.promises` | See `## Don't Hand-Roll` for `fs.promises` migration. All `readFileSync`/`writeFileSync`/`mkdirSync` in current `extension.ts` must become `await fs.promises.readFile()`, etc. |
| FOUND-03 | PiProcessManager manages Pi child process via RpcClient | See `## Standard Stack` -- `RpcClient` API surface fully typed. Wrap in `createPiProcessManager()` factory with `start/stop/restart/prompt/abort` |
| FOUND-04 | RpcEventMapper transforms AgentEvent to ChatResponseStream actions | See `## Code Examples` -- pure typed function mapping each AgentEvent variant. Pure, testable, no side effects |
| FOUND-05 | Phased activation -- activate() returns <1ms, async deferred | See `## Architecture Patterns` -- deferred init pattern. All async setup (watchers, dirs, `pi --version` check) fires after return |
| CHAT-01 | User invokes `@pi` in VS Code Chat panel | Requires `chatParticipants` contribution in `package.json` + `vscode.chat.createChatParticipant()` in `activate()`. See `## Code Examples` |
| CHAT-04 | Chat routes to Pi via PiProcessManager, not VS Code LM API | Handler calls `rpcClient.prompt(request.prompt)` then maps events via RpcEventMapper. See `## Architecture Patterns` |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pi process lifecycle | Backend (Child Process) | VS Code Extension | PiProcessManager wraps RpcClient which spawns `pi` CLI as child process. Owned by vscode-ext but the process is external |
| Chat participant registration | VS Code Extension | -- | `vscode.chat.createChatParticipant()` is a VS Code API call, done in extension.ts during deferred init |
| Event mapping (AgentEvent -> stream) | VS Code Extension | -- | Pure functions transform Pi SDK events to ChatResponseStream actions. No I/O, no side effects |
| File-based IPC review | VS Code Extension + Pi Extension | -- | Existing `.pi/review-requests/` + `.pi/review-results/` protocol. Preserved, just extracted to review-coordinator.ts |
| Heartbeat / VS Code detection | VS Code Extension | -- | Writes timestamp to `.pi/.vscode-ready`. Pi extension reads it. Non-blocking |
| Shared types and utilities | Cross-cutting | -- | `shared/` directory consumed by both packages as ESM imports |
| Async I/O operations | VS Code Extension | -- | All `fs.promises` calls. Watchers, file reads, file writes, directory creation |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (vscode-ext) | ^5.3.0 | Language / compilation | Existing project choice. VS Code extensions require CJS module output for `main` entry, satisfied by current tsconfig.json `"module": "commonjs"` |
| TypeScript (root) | ^6.0.3 | Language / compilation | Existing project choice for Pi extension |
| VS Code Extension API | ^1.82.0 | Chat API, editor API, commands | Required minimum for `createChatParticipant()` and `ChatResponseStream`. Already declared in vscode-ext/package.json engines and @types/vscode |
| Pi SDK `RpcClient` | ^0.74.0 | Pi child process management | Found in `@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.d.ts` [VERIFIED: codebase]. Provides `start()`, `stop()`, `onEvent()`, `prompt()`, `abort()`, `waitForIdle()`, `promptAndWait()`, `getState()`, `switchSession()`, and more |
| vitest | ^4.1.8 | Testing framework | Already installed globally (v4.1.8). Jest-compatible API, TypeScript-native, fast watch mode. [VERIFIED: environment -- `vitest --version` returns 4.1.8] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs/promises` | Node.js built-in | Async file I/O | Replace ALL `readFileSync`, `writeFileSync`, `mkdirSync`, `unlinkSync`, `rmSync`, `readdirSync` calls |
| `node:path` | Node.js built-in | Path operations | Preserve usage; no migration needed |
| `node:crypto` | Node.js built-in | UUID generation | Already used via `randomUUID`. Preserve |
| `TypeBox` | ^1.1.38 | JSON Schema tool params | Already used in Pi extension tool definitions. Preserve |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vitest | node:test (built-in) | node:test has no watch mode, no mocking, less ergonomic assertions. vitest is already installed globally |
| Factory closures | Classes (D-01 forbid classes) | D-01 explicitly forbids classes. Factory closures are the required pattern |
| ESM shared/ | Dual CJS/ESM compilation (D-10 forbid) | D-10 says ESM everywhere. Avoid dual-compilation complexity |

**Version verification:**
```bash
# vitest is globally installed: v4.1.8
vitest --version
# @types/vscode in vscode-ext node_modules: ^1.82.0
```

**Installation (vscode-ext only):**
```bash
cd vscode-ext
npm install --save-dev vitest
```

## Package Legitimacy Audit

> No new runtime packages are introduced in Phase 1. vitest is a devDependency. All other dependencies (Pi SDK, TypeBox, YAML) are pre-existing.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| vitest | npm | 4+ yrs | 10M+/wk | github.com/vitest-dev/vitest | OK | Approved (devDependency) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                    +--------------------------------------+
                    |         VS Code Extension             |
                    |         (vscode-ext/src/)             |
                    |                                      |
                    |  +----------+  +------------------+  |
                    |  |extension |  | pi-process-       |  |
                    |  | .ts      |--| manager.ts        |  |
                    |  |  Activate|  |                  |  |
                    |  |  Defer   |  | createPiProcess  |  |
                    |  |  Init    |  | Manager(opts)    |  |
                    |  +----+-----+  | .start()         |  |
                    |       |        | .stop()           |  |
                    |       |        | .prompt()         |  |
                    |       |        | .abort()          |  |
                    |       |        | .onEvent()        |  |
                    |       |        | .getState()       |  |
                    |       |        +--------+---------+  |
                    |       |                 |            |
                    |       |        +--------v---------+  |
                    |       |        | event-mapper.ts  |  |
                    |       |        |                  |  |
                    |       |        | AgentEvent ->    |  |
                    |       |        | ChatRespStream   |  |
                    |       |        | actions          |  |
                    |       |        +------------------+  |
                    |       |                              |
                    |       |        +------------------+  |
                    |       |        | chat-handler.ts  |  |
                    |       |        |                  |  |
                    |       |        | ChatRequest-      |  |
                    |       |        | Handler factory  |  |
                    |       |        | (vscode.chat.    |  |
                    |       |        |  createChat      |  |
                    |       |        |  Participant)    |  |
                    |       |        +------------------+  |
                    |       |                              |
                    |       |        +------------------+  |
                    |       |        | review-           |  |
                    |       |        | coordinator.ts   |  |
                    |       |        |  (existing IPC   |  |
                    |       |        |   review flow)   |  |
                    |       |        +------------------+  |
                    |       |                              |
                    +-------+------------------------------+
                            |
                    +-------v------------------------------+
                    |         shared/ (ESM)                 |
                    |  ReviewRequest, ReviewResult,         |
                    |  ReviewFile, DiffSession,             |
                    |  FileStatus, resolveSafe(),           |
                    |  IPC path constants                   |
                    +-------+------------------------------+
                            |
                    +-------v------------------------------+
                    |    Pi Process (child process)         |
                    |    pi CLI in RPC mode                 |
                    |    stdin/stdout JSON-line protocol    |
                    |                                      |
                    |  RpcClient.start() spawns:            |
                    |    pi --rpc                            |
                    |                                      |
                    |  Events flow stdout -> RpcClient     |
                    |  Commands flow stdin <- RpcClient    |
                    +--------------------------------------+
```

### Recommended Project Structure

```
vscode-ext/src/
+-- extension.ts              # Activate/deactivate, defer init, wire modules
+-- types.ts                  # (Keep or migrate to shared/) -- review-specific types
+-- pi-process-manager.ts     # createPiProcessManager factory -- wraps RpcClient
+-- event-mapper.ts           # Pure functions: AgentEvent -> ChatResponseStream actions
+-- chat-handler.ts           # createChatHandler factory -- ChatRequestHandler for @pi
+-- review-coordinator.ts     # Extracted from extension.ts: approve/reject/result handling
+-- utils.ts                  # Remaining utilities (heartbeat, dir setup)

shared/                        # NEW -- at project root
+-- types.ts                   # ReviewRequest, ReviewResult, DiffSession, FileStatus
+-- ipc.ts                     # IPC path constants (.pi/review-requests/, etc.)
+-- path-utils.ts              # resolveSafe() and other path utilities

tests/                         # NEW -- at vscode-ext level or root
+-- event-mapper.test.ts       # Tests for pure event mapping functions
+-- path-utils.test.ts         # Tests for resolveSafe and path utilities
+-- ipc.test.ts                # Tests for IPC message validation
```

### Pattern 1: Factory with Closure State

**What:** Each domain module exports a `createXxx(opts)` factory function that returns `{ methods, state }` via closure. No module-level mutable variables, no classes. Enables teardown and testability.

**When to use:** ALL domain modules in this phase: `pi-process-manager.ts`, `chat-handler.ts`, `review-coordinator.ts`.

**Example:**
```typescript
// pi-process-manager.ts
// Source: Derived from Pi SDK RpcClient type definitions [VERIFIED: codebase]
import { RpcClient } from '@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.js';
import type { AgentEvent } from '@earendil-works/pi-agent-core';

export interface PiProcessManagerState {
  client: RpcClient | null;
  cwd: string;
  sessionId: string | null;
}

export interface PiProcessManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  prompt(message: string): Promise<void>;
  abort(): Promise<void>;
  onEvent(listener: (event: AgentEvent) => void): () => void;
  getState(): Promise<{ sessionId: string | null }>;
}

export function createPiProcessManager(opts: {
  cwd: string;
  model?: string;
  provider?: string;
}): PiProcessManager {
  // State in closure, not module-level
  const state: PiProcessManagerState = {
    client: null,
    cwd: opts.cwd,
    sessionId: null,
  };
  const listeners = new Set<(event: AgentEvent) => void>();

  // ... method implementations capturing state via closure ...
  return {
    async start() {
      state.client = new RpcClient({
        cwd: state.cwd,
        provider: opts.provider,
        model: opts.model,
      });
      await state.client.start();
      const sessionState = await state.client.getState();
      state.sessionId = sessionState.sessionId;
    },
    async stop() {
      if (state.client) {
        await state.client.stop();
        state.client = null;
      }
    },
    // ... other methods ...
  };
}
```

### Pattern 2: Pure Event Mapper

**What:** A pure function that takes an `AgentEvent` and returns a function that operates on `ChatResponseStream`. The function is pure in the sense that it does not depend on any external state -- it just computes what to do with a stream for a given event.

**When to use:** `event-mapper.ts` exclusively. FOUND-04 requires this to be pure and testable.

### Pattern 3: Deferred Async Initialization

**What:** `activate()` returns in <1ms after synchronous setup (imports, initial state). All async work (directory creation, `pi --version` check, file watchers, Pi process readiness) fires as fire-and-forget promises. If deferred init fails, it fails silently (logged) -- the extension still loads.

**When to use:** `extension.ts` activate function. FOUND-05 requires this.

**Example:**
```typescript
// extension.ts (activate pattern)
// Source: Derived from VS Code extension best practices [CITED: code.visualstudio.com]
export function activate(context: vscode.ExtensionContext) {
  // Phase 1: Sync -- must return immediately (<1ms)
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage('Pi Companion: open a workspace first');
    return;
  }

  // Phase 2: Defer async initialization
  void (async () => {
    try {
      // Check Pi availability
      const piVersion = await checkPiInstalled();
      if (!piVersion) {
        vscode.window.showInformationMessage(
          'Pi Companion: Pi CLI not found. Install with: npm install -g @earendil-works/pi-tui'
        );
        return;
      }

      // Create directories, start watchers, register participant
      await fs.promises.mkdir(path.join(root, '.pi', 'review-requests'), { recursive: true });
      await fs.promises.mkdir(path.join(root, '.pi', 'review-results'), { recursive: true });
      // ... watchers, heartbeat, chat participant, etc.
    } catch (err) {
      console.error('Pi Companion deferred init failed:', err);
    }
  })();

  // Phase 3: Register sync commands (always works)
  context.subscriptions.push(
    vscode.commands.registerCommand('pi-sr.approveCurrent', () => { /* ... */ }),
    vscode.commands.registerCommand('pi-sr.rejectCurrent', () => { /* ... */ }),
  );
}
```

### Anti-Patterns to Avoid
- **Module-level mutable state:** Do NOT use `let sessionState` at module scope. Use factory closures.
- **Sync I/O in VS Code extension:** Do NOT use `readFileSync`, `writeFileSync`, `mkdirSync` in vscode-ext/ code. Use `fs.promises` always, wrapping in try/catch.
- **Throwing in event handlers:** Return error objects instead. The existing `{ isError: true }` pattern is correct.
- **State in classes:** D-01 explicitly forbids classes. Factory functions only.
- **Parallel configuration:** Do NOT add VS Code settings for Pi configuration. The `.pi/` directory is authoritative.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pi child process management | Custom child_process.spawn with JSON-line protocol | Pi SDK `RpcClient` | `RpcClient` already handles stdin/stdout JSON-line protocol, lifecycle, event subscription, request/response matching. It is fully typed and tested by the Pi team. [VERIFIED: codebase - rpc-client.d.ts] |
| Chat participant | Custom chat UI / webview | VS Code Chat API (`createChatParticipant`, `ChatResponseStream`) | VS Code provides native, themed, accessible chat. Custom webview breaks accessibility and requires ongoing maintenance (explicitly OUT OF SCOPE per REQUIREMENTS.md) |
| Testing framework | Custom test runner | vitest | Already installed globally (v4.1.8). Jest-compatible API, TypeScript-native. Config file in 10 lines. [VERIFIED: environment] |
| Async file I/O | Custom async wrapper | `node:fs/promises` | Built into Node.js >= 20. Standardized, no dependencies, minimal API change from sync version |

**Key insight:** The Pi SDK `RpcClient` is the single most important dependency to get right. It already handles the complex child process lifecycle (spawn, stop, event stream, JSON-line protocol). Wrapping it in a `createPiProcessManager` factory should be a thin typed wrapper, not a reimplementation.

## Common Pitfalls

### Pitfall 1: ChatParticipant ID Mismatch
**What goes wrong:** `vscode.chat.createChatParticipant(id, handler)` receives a participant ID that does not match `package.json#/contributes/chatParticipants/0/id`. The participant silently fails to register or the ID is duplicated.
**Why it happens:** The `id` string must match exactly in both places.
**How to avoid:** Use a constant string in one place and reference it everywhere. Document the convention: `"pi-sr.chat"` in both `package.json` and `createChatParticipant()`.
**Warning signs:** Chat participant does not appear in VS Code chat after extension activation.

### Pitfall 2: RpcClient Import Path
**What goes wrong:** Importing `RpcClient` from the wrong path fails at runtime because the package uses `.js` extensions in its dist output.
**Why it happens:** Pi SDK `dist/` files use `.js` extensions. The import path must match exactly: `@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.js`.
**How to avoid:** Verify the import path against the actual `.d.ts` file location in `node_modules/`. Use the `.js` extension in import statements (ESM requirement for NodeNext resolution).
**Warning signs:** `MODULE_NOT_FOUND` at runtime when Pi process manager tries to start.

### Pitfall 3: AbortController and Stream Lifecycle
**What goes wrong:** Chat handler returns before stream is complete, or holds the stream open after the Pi process finishes. VS Code shows "pending" state indefinitely.
**Why it happens:** The `ChatResponseStream` lifecycle is tied to the ChatRequestHandler promise. If the handler does not `await` the Pi process completion, the stream closes prematurely.
**How to avoid:** The handler must `await` the completion of `rpcClient.promptAndWait()` or an equivalent mechanism before returning. Use `waitForIdle()` or `promptAndWait()`.
**Warning signs:** Chat shows "Pi is thinking..." forever, or response appears truncated.

### Pitfall 4: async/await in Non-Async Startup
**What goes wrong:** Extension shows "slow" warning because activation does synchronous I/O.
**Why it happens:** `fs.mkdirSync`, `fs.writeFileSync`, `fs.readdirSync` block the extension host process. VS Code monitors extension activation time.
**How to avoid:** FOUND-05 pattern: return from `activate()` immediately. Put ALL file operations in deferred async init.
**Warning signs:** VS Code "extension is slow" warning for `vscode-pi-sr`.

## Code Examples

### Example 1: RpcEventMapper -- Pure Event Mapping Function

```typescript
// event-mapper.ts
// Source: Derived from Pi SDK AgentEvent type [VERIFIED: codebase: node_modules/@earendil-works/pi-agent-core/dist/types.d.ts]
//          and VS Code ChatResponseStream API [CITED: code.visualstudio.com/api/references/vscode-api]
import type { AgentEvent } from '@earendil-works/pi-agent-core';
import type { ChatResponseStream } from 'vscode';

/**
 * Action to perform on a ChatResponseStream for a given AgentEvent.
 * Pure data structure -- no side effects.
 */
export type StreamAction =
  | { type: 'progress'; value: string }
  | { type: 'markdown'; value: string }
  | { type: 'done' }
  | { type: 'error'; value: string };

/**
 * Map a single AgentEvent to a StreamAction.
 * Pure function: (event) => action. No side effects, no external state.
 * Fully testable -- just test input/output pairs.
 */
export function mapAgentEventToAction(event: AgentEvent): StreamAction {
  switch (event.type) {
    case 'agent_start':
      return { type: 'progress', value: 'Pi agent started...' };

    case 'turn_start':
      return { type: 'markdown', value: '---' };

    case 'message_update': {
      const msg = event.assistantMessageEvent;
      if (msg.type === 'delta' && msg.delta?.type === 'text') {
        return { type: 'markdown', value: msg.delta.text };
      }
      return { type: 'markdown', value: '' };
    }

    case 'tool_execution_start':
      return { type: 'markdown', value: '```\n🛠 ' + event.toolName + ': executing...\n```\n' };

    case 'tool_execution_update':
      if (typeof event.partialResult === 'string') {
        return { type: 'markdown', value: event.partialResult };
      }
      return { type: 'markdown', value: '' };

    case 'tool_execution_end':
      if (event.isError) {
        return { type: 'markdown', value: '❌ Tool ' + event.toolName + ' failed' };
      }
      return { type: 'markdown', value: '✅ Tool ' + event.toolName + ' completed' };

    case 'message_end':
      return { type: 'markdown', value: '' }; // No extra content, final text already streamed

    case 'agent_end':
      return { type: 'done' };

    case 'turn_end':
      return { type: 'markdown', value: '' };

    case 'message_start':
      return { type: 'markdown', value: '' };

    default:
      return { type: 'markdown', value: '' };
  }
}

/**
 * Apply a StreamAction to a ChatResponseStream (side-effectful).
 * Separated from mapAgentEventToAction so mapping logic stays pure.
 */
export function applyStreamAction(
  stream: ChatResponseStream,
  action: StreamAction
): void {
  switch (action.type) {
    case 'progress':
      stream.progress(action.value);
      break;
    case 'markdown':
      if (action.value) stream.markdown(action.value);
      break;
    case 'error':
      stream.markdown('⚠ ' + action.value);
      break;
    case 'done':
      break; // No-op for stream; handler resolves when all events processed
  }
}

/**
 * Process an array of AgentEvents through a ChatResponseStream.
 * Batch mode for Phase 1 (non-streaming). Phase 2 will add progressive streaming.
 */
export function streamEvents(
  events: AgentEvent[],
  stream: ChatResponseStream
): void {
  for (const event of events) {
    const action = mapAgentEventToAction(event);
    applyStreamAction(stream, action);
  }
}
```

### Example 2: Chat Handler Registration

```typescript
// chat-handler.ts
// Source: Derived from VS Code Chat API [CITED: code.visualstudio.com/api/extension-guides/ai/chat]
//          and Pi SDK RpcClient API [VERIFIED: codebase: rpc-client.d.ts]
import * as vscode from 'vscode';
import type { PiProcessManager } from './pi-process-manager';
import { streamEvents } from './event-mapper';

export function createChatHandler(processManager: PiProcessManager): vscode.ChatRequestHandler {
  return async (
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken
  ): Promise<void> => {
    stream.progress('Sending to Pi agent...');

    try {
      // Lazy start: ensure Pi process is running (D-05)
      await processManager.start();

      // Send prompt and collect all events (Phase 1: batch mode)
      const events = await processManager.promptAndWait(request.prompt);

      // Map events to stream actions
      streamEvents(events, stream);
    } catch (err) {
      // Crash visibility (D-06): show error in chat
      stream.markdown(
        '⚠ Pi process encountered an error:\n```\n' + err + '\n```\n' +
        'Run `pi -c` in terminal to resume the session. Send another message to restart.'
      );
    }
  };
}
```

### Example 3: Extension Activation with Deferred Init (FOUND-05)

```typescript
// extension.ts (partial -- activation pattern only)
// Source: Derived from CONTEXT.md D-04, D-05, D-07 decisions
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { createPiProcessManager } from './pi-process-manager';
import { createChatHandler } from './chat-handler';
import { createReviewCoordinator } from './review-coordinator';

export function activate(context: vscode.ExtensionContext) {
  // Phase 1: Sync -- must return in <1ms
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage('Pi Companion: open a workspace first');
    return;
  }

  // Create factories immediately (synchronous, no I/O)
  const processManager = createPiProcessManager({ cwd: root });
  const reviewCoordinator = createReviewCoordinator({ workspaceRoot: root });

  // Register sync commands immediately
  context.subscriptions.push(
    vscode.commands.registerCommand('pi-sr.approveCurrent', () => reviewCoordinator.approveCurrent()),
    vscode.commands.registerCommand('pi-sr.rejectCurrent', () => reviewCoordinator.rejectCurrent()),
  );

  // Phase 2: Deferred async initialization (fire-and-forget)
  void (async () => {
    try {
      // Check pi --version (D-07)
      const { execSync } = await import('child_process');
      try {
        execSync('pi --version', { stdio: 'pipe' });
      } catch {
        vscode.window.showInformationMessage(
          'Pi Companion: Pi CLI not found. Install: npm install -g @earendil-works/pi-tui'
        );
        return;
      }

      // Create .pi/ directories
      const requestsDir = path.join(root, '.pi', 'review-requests');
      const resultsDir = path.join(root, '.pi', 'review-results');
      await fs.mkdir(requestsDir, { recursive: true });
      await fs.mkdir(resultsDir, { recursive: true });

      // Start review coordinator (watchers, heartbeat)
      reviewCoordinator.start(requestsDir, resultsDir);

      // Register chat participant @pi (CHAT-01)
      const chatHandler = createChatHandler(processManager);
      const participant = vscode.chat.createChatParticipant('pi-sr.chat', chatHandler);
      participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icon.png');
      context.subscriptions.push(participant);

    } catch (err) {
      console.error('Pi Companion deferred init failed:', err);
    }
  })();
}

export function deactivate(): void {
  // Teardown: stop Pi process, close watchers
  // (Factories provide teardown through their returned API)
}
```

### Example 4: package.json ChatParticipants Contribution

```json
// vscode-ext/package.json (add to "contributes" section)
// Source: Derived from VS Code Chat API [CITED: code.visualstudio.com/api/extension-guides/ai/chat]
"contributes": {
  "chatParticipants": [
    {
      "id": "pi-sr.chat",
      "name": "pi",
      "fullName": "Pi Agent",
      "description": "Ask Pi to code, review files, run commands",
      "isSticky": true
    }
  ],
  // ... existing commands, menus ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Module-level `let`/`const` state | Factory functions with closure state | Phase 1 | Enables unit testing, teardown, and isolation. No state leaks between tests |
| Synchronous `fs.*Sync` | Async `fs.promises` | Phase 1 | Avoids blocking VS Code extension host. Prevents "extension is slow" warnings |
| Monolithic `extension.ts` (368 lines) | Domain modules (4-5 files, ~100 lines each) | Phase 1 | Each file has single responsibility. New features add new modules, not file bloat |
| File-based IPC only | File-based IPC + Chat API | Phase 1 | Chat messages go through VS Code Chat API instead of `.pi/` directory. Review IPC preserved |
| `src/index.ts` (470 lines) | Extracted modules | Phase 1 | Tool overrides, lifecycle handlers, review logic split into separate files |

**Deprecated/outdated:**
- `readFileSync`/`writeFileSync`/`mkdirSync`: All sync file I/O is deprecated in vscode-ext code. Use `await fs.promises.readFile()` etc.
- Module-level mutable state: Deprecated in favor of factory closures.
- `resolveSafe()` in two places: Deprecated. Extract to `shared/path-utils.ts`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `RpcClient` can be imported as `@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.js` from the vscode-ext CJS module | Standard Stack | The `.js` extension ESM import may not resolve in CJS mode. Need to verify actual runtime resolution |
| A2 | `vscode.chat.createChatParticipant` is available in VS Code >= 1.82.0 | Standard Stack | Was available since 1.82 in preview. If participant registration requires a newer version, package.json `engines.vscode` may need bumping |
| A3 | `chatParticipants` contribution in package.json is required even when `createChatParticipant` is called in code | Code Examples | If the contribution is optional and the API call alone registers the participant, the package.json block can be omitted. But existing examples always show both |
| A4 | `RpcClient.promptAndWait()` method exists on the RpcClient class | Standard Stack | The type definition shows `promptAndWait(message, images?, timeout?)` returning `Promise<AgentEvent[]>`. Confirmed in rpc-client.d.ts |

## Open Questions (RESOLVED)

1. **Does RpcClient need `newSession()` before first `prompt()`?**
   - [RESOLVED] `start()` implicitly creates a session. Calling `start()` followed by `getState()` returns a valid `sessionId`. No explicit `newSession()` call is needed. Plan 04’s `pi-process-manager.ts` factory calls `start()` then reads `sessionId` from `getState()`. Verified against `RpcClient` type definition where `start()` returns `Promise<void>` and `getState()` returns `{ sessionId: string | null }`.

2. **Can vscode-ext (CJS tsconfig) import ESM from `shared/`?**
   - [RESOLVED] The root `package.json` does NOT have `"type": "module"`, so tsc’s NodeNext module resolution outputs CJS modules (same as vscode-ext’s `commonjs` target). Both compile to CJS; `require()` works. Plan 01’s `shared/tsconfig.json` uses `module: NodeNext`, but since root `package.json` omits `"type": "module"`, the compiled output is CJS — compatible with vscode-ext’s CJS module system. The `import` syntax in source is compiled to `require()` calls. Test Plan 01’s compilation before proceeding: `cd vscode-ext && npx tsc --noEmit`.

3. **What happens when `agent_end` has no `message_update` events?**
   - [RESOLVED] In Phase 1 (batch mode), `mapAgentEventToAction` returns `{ type: 'done' }` for `agent_end`. If no `message_update` events preceded it, the chat response will be empty (just the “done” signal). Plan 04’s test suite covers this case (test: “handles agent_end with no preceding message_update”). The executor MUST NOT add fallback extraction from `agent_end.messages` — that is deferred to Phase 2 when progressive streaming is added.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v24.15.0 | -- |
| npm | Package management | Yes | 11.13.0 | -- |
| vitest (global) | Testing | Yes | 4.1.8 | -- |
| TypeScript (global) | Compilation | Yes | -- | -- |
| `pi --version` command | Pi check (D-07) | Not verified | -- | Must test during implementation |
| git | Version control | Yes | -- | -- |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

**Step 2.6: COMPLETE** -- all critical dependencies available.

## Validation Architecture

> nyquist_validation enabled in config.json.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.8 |
| Config file | `vscode-ext/vitest.config.ts` (new) |
| Quick run command | `cd vscode-ext && npx vitest run --reporter verbose` |
| Full suite command | `cd vscode-ext && npx vitest run --reporter verbose` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FOUND-04 | `mapAgentEventToAction` maps each AgentEvent variant to correct StreamAction | unit | `npx vitest run tests/event-mapper.test.ts` | New |
| FOUND-04 | `applyStreamAction` applies StreamAction to mock ChatResponseStream | unit | `npx vitest run tests/event-mapper.test.ts` | New |
| FOUND-04 | Edge cases: unexpected event types, empty message text | unit | `npx vitest run tests/event-mapper.test.ts` | New |
| FOUND-01 | `resolveSafe` handles absolute paths, relative paths, LLM paths without leading `/` | unit | `npx vitest run tests/path-utils.test.ts` | New |
| FOUND-01 | IPC message validation rejects malformed JSON | unit | `npx vitest run tests/ipc.test.ts` | New |
| FOUND-03 | `createPiProcessManager` factory returns expected API shape | unit | `npx vitest run tests/pi-process-manager.test.ts` | New |

### Sampling Rate
- **Per task commit:** `npx vitest run --changed`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vscode-ext/vitest.config.ts` -- vitest configuration file
- [ ] `vscode-ext/tests/event-mapper.test.ts` -- tests for pure event mapping functions
- [ ] `vscode-ext/tests/path-utils.test.ts` -- tests for resolveSafe and path utilities
- [ ] `vscode-ext/tests/ipc.test.ts` -- tests for IPC message validation
- [ ] Framework install: `cd vscode-ext && npm install --save-dev vitest`

## Security Domain

> security_enforcement not explicitly false in config.json -- treating as enabled.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | JSON schema validation for review requests + chat messages. TypeBox already used for tool params; extend same pattern to IPC messages |
| V6 Cryptography | no | No sensitive data in transit or at rest. Local filesystem only |

### Known Threat Patterns for {stack}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal in IPC files | Tampering | `resolveSafe()` already normalizes paths. Validate final path is within workspace directory |
| Malformed IPC JSON | Tampering | Wrap `JSON.parse` in try/catch with schema validation. Do not pass raw parsed values to fs operations |
| Child process escaping | Elevation of Privilege | `RpcClient` controls stdin/stdout of Pi child process. Custom shell escaping not needed -- RpcClient handles protocol serialization |

## Sources

### Primary (HIGH confidence)
- Pi SDK `RpcClient` type definitions -- `node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.d.ts` [VERIFIED: codebase]
- Pi SDK AgentEvent type definitions -- `node_modules/@earendil-works/pi-agent-core/dist/types.d.ts` [VERIFIED: codebase]
- Pi SDK RPC types -- `node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-types.d.ts` [VERIFIED: codebase]
- VS Code Extension API types -- `node_modules/@types/vscode/index.d.ts` [VERIFIED: vscode-ext/node_modules]
- VS Code Chat API tutorial -- `code.visualstudio.com/api/extension-guides/ai/chat` [CITED: context7]
- Vitest documentation -- `vitest.dev` [CITED: context7]

### Secondary (MEDIUM confidence)
- Project CLAUDE.md -- project conventions, constraints, stack [VERIFIED: codebase]
- Architecture and concerns docs -- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md` [VERIFIED: codebase]
- Existing source code -- `src/index.ts`, `vscode-ext/src/extension.ts`, `vscode-ext/src/types.ts` [VERIFIED: codebase]

### Tertiary (LOW confidence)
- none -- all claims verified against source code or official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- verified against codebase types, existing dependencies, environment
- Architecture: HIGH -- derived from CONTEXT.md locked decisions and verified codebase analysis
- Pitfalls: HIGH -- common patterns in VS Code extension dev and RPC client integration
- Testing: HIGH -- vitest verified installed, configuration is straightforward

**Research date:** 2026-06-14
**Valid until:** 2026-07-14 (stable stack; Pi SDK ^0.74.0 may have minor changes)
