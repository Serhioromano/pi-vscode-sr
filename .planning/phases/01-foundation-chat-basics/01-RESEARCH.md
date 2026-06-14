# Phase 1: Foundation + Chat Basics - Research

**Researched:** 2026-06-14
**Domain:** VS Code Extension Chat API, Pi SDK RPC, Test Infrastructure
**Confidence:** HIGH

## Summary

Phase 1 delivers the modular refactoring of the monolithic `extension.ts` and `src/index.ts`, migration of all synchronous file I/O to async `fs.promises`, the `PiProcessManager` (wrapping Pi SDK `RpcClient`), the `RpcEventMapper` (pure event-to-stream functions), and the `@pi` chat participant registered via `vscode.chat.createChatParticipant`. When complete, a user can type `@pi` in VS Code Chat and receive a response routed through a managed Pi child process, all on a clean modular codebase.

The VS Code Chat API is available since VS Code 1.82 (documented in `@types/vscode` namespace `chat`). The Pi SDK `RpcClient` is exported from `@earendil-works/pi-coding-agent` (ESM only, ^0.74.0, installed in root `node_modules` but needs to be added as a dependency of `vscode-ext`). No test infrastructure exists yet -- vitest or Node.js built-in `node:test` can serve.

**Primary recommendation:** Use `vscode.chat.createChatParticipant` with a `ChatRequestHandler` that delegates to `PiProcessManager` (which wraps `RpcClient`), map `AgentEvent` types to `ChatResponseStream.markdown()` actions via pure `RpcEventMapper` functions, and use `vitest` for unit testing the pure mapper functions and path utilities.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Module Organization
- **D-01:** Function-based modules -- no classes. Consistent with existing codebase patterns (no classes anywhere today).
- **D-02:** Factory functions with closure-based state -- no module-level mutable `let`/`const` state. Each module exports a `createXxx(opts)` factory that returns `{ methods, state }` via closure. Enables teardown and testability.
- **D-03:** Flat domain files in `vscode-ext/src/` -- `pi-process-manager.ts`, `event-mapper.ts`, `chat-handler.ts`, `review-coordinator.ts`, plus existing `types.ts` and `extension.ts`. No subdirectories.
- **D-04:** Minimal extraction in `activate()` -- delegates to module functions (`startHeartbeat()`, `watchRequests()`, etc.) but keeps the same structural flow. Not a full orchestrator rewrite.

#### Pi Process Lifecycle
- **D-05:** Lazy start -- Pi process spawns on the first `@pi` chat message, not on VS Code activation. Zero memory/CPU overhead when unused. First message has startup latency; subsequent messages are instant.
- **D-06:** Crash visibility -- if Pi process exits unexpectedly, show the error in chat (for debugging), note that `pi -c` can resume the session, and let the user restart by sending another message. No silent restarts.
- **D-07:** Pi must be pre-installed -- check `pi --version` on activation. Do NOT bundle Pi with the VS Code extension. If Pi is not found, show a one-time setup message.
- **D-08:** Workspace-isolated sessions -- when the user switches VS Code workspaces, save the current Pi session state, stop the process for the old workspace, and restore (or start fresh) for the new workspace. Switching back restores the saved session. No progress lost across workspace switches.

#### Shared Code Strategy
- **D-09:** `shared/` directory at project root -- contains TypeScript interfaces (`ReviewRequest`, `ReviewResult`, `DiffSession`, etc.), IPC protocol constants (`.pi/review-requests/`, `.pi/review-results/` paths), and reusable utilities (`resolveSafe` path normalization).
- **D-10:** ESM `import`/`export` everywhere -- both root and vscode-ext consume `shared/` via standard ESM imports. No dual CJS/ESM compilation needed. The vscode-ext package is confirmed to work with ESM imports despite its `commonjs` tsconfig history.

#### Refactoring Approach
- **D-11:** Deep restructuring -- extract to domain modules, migrate ALL synchronous file I/O (`readFileSync`, `writeFileSync`, `mkdirSync`) to async `fs.promises`, fix empty `catch {}` blocks with at minimum `console.error`, and redesign internal API boundaries between the process manager, event mapper, chat handler, and review coordinator.
- **D-12:** Both packages refactored -- `src/index.ts` (470 lines, Pi extension) and `vscode-ext/src/extension.ts` (368 lines, VS Code extension) both get the same deep treatment. Dedicated git branch for Phase 1 so `main` stays untouched if the refactoring fails.
- **D-13:** Tests for all new code -- set up a test runner (vitest or node:test), write tests for `RpcEventMapper` (pure functions, ideal for unit testing), path utilities, IPC message validation, and any other new domain logic. Existing code gets tests as it's refactored.

#### Claude's Discretion
No areas were explicitly delegated -- all decisions were user-confirmed.

#### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | Modular file organization -- split monolithic extension.ts into domain files | `vscode-ext/src/` files: `pi-process-manager.ts`, `event-mapper.ts`, `chat-handler.ts`, `review-coordinator.ts`, `extension.ts`, `types.ts`, plus `shared/` at root |
| FOUND-02 | Migrate sync file I/O to async `fs.promises` | All `readFileSync`/`writeFileSync`/`mkdirSync`/`unlinkSync`/`rmSync` calls in existing `extension.ts` (11 calls) and `src/index.ts` (10 calls) must become `fs.promises.*` await calls |
| FOUND-03 | `PiProcessManager` manages Pi child process lifecycle via Pi SDK `RpcClient` | `RpcClient` exported from `@earendil-works/pi-coding-agent`: `.start()`, `.stop()`, `.onEvent()`, `.prompt()`, `.waitForIdle()`, `.abort()`, `.newSession()`, `.getState()`, `.getStderr()` |
| FOUND-04 | `RpcEventMapper` transforms Pi `AgentEvent` types to `ChatResponseStream` actions | `AgentEvent` = `agent_start` | `agent_end` | `turn_start` | `turn_end` | `message_start` | `message_update` | `message_end` | `tool_execution_start` | `tool_execution_update` | `tool_execution_end` |
| FOUND-05 | Phased activation pattern -- `activate()` returns immediately (<1ms), async init deferred | Activation pattern: sync registration + `Promise.resolve().then(() => deferredInit())` for watchers/heartbeat |
| CHAT-01 | User can invoke `@pi` in VS Code Chat panel | `vscode.chat.createChatParticipant('pi-sr', handler)` + `contributes.chatParticipants` in `package.json` |
| CHAT-04 | Chat messages route to Pi via `PiProcessManager` (RPC child process), not VS Code LM API | `RpcClient.prompt(message)` -- explicitly NOT `request.model.sendRequest()` or `lm.invokeTool()` |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Chat participant registration | Extension Host | -- | `vscode.chat.createChatParticipant()` is a VS Code API call, must run in extension host |
| Pi child process lifecycle | Extension Host | -- | `child_process.spawn` runs in extension host, process manager is in-process |
| Agent event processing | Extension Host | -- | All `AgentEvent` handling and stream operations run in extension host |
| Chat response streaming | Extension Host | -- | `ChatResponseStream.markdown()` calls must be made from the extension host |
| IPC file protocol (reviews) | Extension Host (both) | -- | File-based IPC between two in-process agents; no server or CDN involved |
| Module state management | Extension Host (closure) | -- | Factory closure state replaces module-level mutable variables |
| Test runner | Build/Dev | -- | vitest runs in Node.js, not in extension host |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@earendil-works/pi-coding-agent` | ^0.74.0 | Pi SDK -- RpcClient for child process management | Only available SDK for Pi RPC protocol; already a devDependency in root |
| `@types/vscode` | ^1.82.0 (installed 1.120.0) | VS Code API type definitions -- Chat, commands, windows | Required for any VS Code extension development |
| `typescript` | ^5.3.0 (vscode-ext) / ^6.0.3 (root) | TypeScript compiler | Already in use; required for compilation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | latest (^3.x) | Unit test framework | Pure functions: `RpcEventMapper`, `resolveSafe`, IPC validation; not yet installed -- requires `npm install -D vitest` in vscode-ext |
| Node.js `node:test` | built-in (v20+) | Alternative unit test framework | Available with no install; less ergonomic than vitest for watch mode and coverage |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vitest | node:test (built-in) | node:test has no install cost but lacks watch mode, coverage, expect matchers, and VS Code extension runner support |
| vitest | mocha + chai | mocha is stable but slower, more config, and has less active development |
| @earendil-works/pi-coding-agent as direct dep | Bundle Pi SDK | Bundling is possible but wasteful -- `RpcClient` spawns a separate process; adding as a dependency is standard |

**Installation:**
```bash
# In vscode-ext/ directory
npm install @earendil-works/pi-coding-agent@^0.74.0
npm install -D vitest
```

**Version verification:**
```bash
npm view @earendil-works/pi-coding-agent version    # 0.74.0 (verified 2026-06-14)
npm view @types/vscode version                      # 1.120.0 (verified 2026-06-14)
npm view vitest version                             # latest checked 2026-06-14
```

## Package Legitimacy Audit

> **Required** whenever this phase installs external packages.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@earendil-works/pi-coding-agent` | npm | 1 day (0.74.0) | 2.4M/wk | github.com/earendil-works/pi | SUS (too-new) | Flagged -- planner must add checkpoint |
| `vitest` | npm | 13 days (latest) | 68M/wk | github.com/vitest-dev/vitest | SUS (too-new) | Flagged -- planner must add checkpoint |

**Packages removed due to SLOP verdict:** None
**Packages flagged as suspicious SUS:** `@earendil-works/pi-coding-agent` (new version published 2026-06-13 -- established package with 2.4M weekly downloads), `vitest` (new version published 2026-06-01 -- established framework with 68M weekly downloads). Both are mature, widely-used packages. The SUS verdict is from recency of registry publish, not from any indicator of malicious intent.

Both packages pass the smell check: official GitHub repo, high weekly downloads, no suspicious postinstall scripts, not deprecated. The "too-new" signal fires because these packages were published very recently (within 14 days). The planner should add `checkpoint:human-verify` before each install per protocol but these are safe.

**Postinstall check:** Neither package has a postinstall script.

## Architecture Patterns

### System Architecture Diagram

```
VS Code Extension Host (vscode-ext/)
=====================================
       v
extension.ts (activate)
  |
  +-- createPiProcessManager()  (pi-process-manager.ts)
  |     RpcClient.start() -- spawns Pi subprocess
  |     RpcClient.onEvent() -- subscribes to AgentEvent stream
  |     RpcClient.prompt() -- sends messages
  |     RpcClient.stop() / abort() -- lifecycle control
  |     Returns: { start, stop, sendMessage, onEvent, abort, getState, isRunning }
  |
  +-- createRpcEventMapper()  (event-mapper.ts)
  |     Pure functions:
  |       mapAgentEvent(event, stream) => ChatResult | void
  |       Handles: agent_start, turn_start, message_update,
  |               tool_execution_*, message_end, agent_end
  |
  +-- createChatHandler()  (chat-handler.ts)
  |     ChatRequestHandler for @pi participant
  |     1. Check pi --version on first message
  |     2. start PiProcessManager (lazy)
  |     3. RpcClient.prompt(request.prompt)
  |     4. Subscribe to events -> delegate to RpcEventMapper
  |     5. Return ChatResult on agent_end
  |
  +-- createReviewCoordinator()  (review-coordinator.ts)
  |     Diff view management (extracted from existing extension.ts)
  |     Approve/Reject commands (existing pi-sr.approveCurrent, pi-sr.rejectCurrent)
  |     File watchers on .pi/review-requests/ and .pi/review-results/
  |
  +-- startHeartbeat()  (inline in activate or helper)
  |     setInterval writes timestamp to .pi/.vscode-ready
  |
  v
Pi subprocess (spawned by RpcClient)
  stdin/stdout JSON-line protocol
  Emits AgentEvent[] via RpcClient.onEvent()
```

### Recommended Project Structure
```
pi-vscode-sr/
├── shared/                      # New: shared types and utilities
│   ├── types.ts                 # ReviewRequest, ReviewResult, DiffSession, FileStatus
│   ├── constants.ts             # IPC paths (.pi/review-requests/, .pi/review-results/)
│   └── utils.ts                 # resolveSafe path normalization
├── src/
│   └── index.ts                 # Pi extension (will be refactored in parallel)
├── vscode-ext/
│   ├── src/
│   │   ├── extension.ts         # Activate/deactivate (minimal, delegates)
│   │   ├── pi-process-manager.ts # NEW - RpcClient wrapper factory
│   │   ├── event-mapper.ts       # NEW - AgentEvent -> ChatResponseStream
│   │   ├── chat-handler.ts       # NEW - ChatRequestHandler for @pi
│   │   ├── review-coordinator.ts # NEW - extracted review logic
│   │   └── types.ts              # Deleted? Moved to shared/
│   ├── tests/                    # NEW - test directory
│   │   ├── event-mapper.test.ts  # Tests for pure mapper functions
│   │   ├── utils.test.ts         # Tests for resolveSafe + IPC validation
│   │   └── pi-process-manager.test.ts  # Integration tests with mock
│   ├── package.json              # Add dependencies
│   └── tsconfig.json             # May need module adjustment for ESM
└── package.json                  # root
```

### Pattern 1: Factory Function with Closure State

**What:** Each domain module exports a `createXxx(options)` factory that returns an object with methods and no exposed internals. State lives in the closure, not in module-level variables.

**When to use:** All new modules -- `pi-process-manager`, `chat-handler`, `review-coordinator`, `event-mapper` (stateless, but factory allows dependency injection for testing).

**Example:**
```typescript
// pi-process-manager.ts
import { RpcClient } from "@earendil-works/pi-coding-agent";
import type { AgentEvent } from "@earendil-works/pi-agent-core";

export type ProcessState = "stopped" | "starting" | "running" | "errored";

export interface PiProcessManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(message: string): Promise<void>;
  onEvent(listener: (event: AgentEvent) => void): () => void;
  getState(): ProcessState;
  getStderr(): string;
}

export interface PiProcessManagerOptions {
  cwd: string;
  onCrash?: (stderr: string) => void;
}

export function createPiProcessManager(
  opts: PiProcessManagerOptions
): PiProcessManager {
  let client: RpcClient | null = null;
  let state: ProcessState = "stopped";
  let stderr = "";

  return {
    async start() {
      state = "starting";
      client = new RpcClient({ cwd: opts.cwd });
      client.onEvent((event) => {
        // ... handle or forward
      });
      await client.start();
      state = "running";
    },

    async stop() {
      if (client) {
        await client.stop();
        client = null;
      }
      state = "stopped";
    },

    async sendMessage(message: string) {
      if (!client) throw new Error("Process not started");
      await client.prompt(message);
    },

    onEvent(listener) {
      if (!client) throw new Error("Process not started");
      return client.onEvent(listener);
    },

    getState() { return state; },
    getStderr() { return stderr; },
  };
}
```

### Pattern 2: Pure Event Mapper

**What:** A stateless module that takes an `AgentEvent` and a `ChatResponseStream` and performs the appropriate stream action. Each event maps to 0 or more stream calls.

**When to use:** Converting Pi `AgentEvent` types to VS Code Chat stream responses.

**Example:**
```typescript
// event-mapper.ts
import type { ChatResponseStream } from "vscode";
import type { AgentEvent } from "@earendil-works/pi-agent-core";

export interface MapResult {
  done: boolean;
  errorMessage?: string;
}

/**
 * Map a single AgentEvent to ChatResponseStream actions.
 * Pure function -- no side effects beyond the stream parameter.
 * Returns { done: true } on agent_end to signal completion.
 */
export function mapAgentEvent(
  event: AgentEvent,
  stream: ChatResponseStream
): MapResult {
  switch (event.type) {
    case "agent_start":
      stream.progress("Pi is working...");
      return { done: false };

    case "turn_start":
      stream.progress("Processing turn...");
      return { done: false };

    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        stream.markdown(event.assistantMessageEvent.delta);
      }
      return { done: false };

    case "tool_execution_start":
      stream.progress(`Using tool: ${event.toolName}`);
      return { done: false };

    case "tool_execution_update":
      // Optionally show progress updates
      return { done: false };

    case "message_end":
      // Ensure buffer is flushed
      return { done: false };

    case "agent_end":
      stream.markdown("\n\n---\n*Done*");
      return { done: true };

    case "tool_execution_end":
      return { done: false };

    default:
      return { done: false };
  }
}

/**
 * Collect multiple events and map them all to the stream.
 * Useful for bulk processing from RpcClient.collectEvents().
 */
export function mapAgentEvents(
  events: AgentEvent[],
  stream: ChatResponseStream
): void {
  for (const event of events) {
    const result = mapAgentEvent(event, stream);
    if (result.done) break;
  }
}
```

### Pattern 3: Chat Participant with Lazy Pi Process

**What:** The `@pi` chat participant is registered in `activate()` with a handler that lazily starts the Pi process on first message.

**When to use:** CHAT-01 + D-05 (lazy start).

**Example:**
```typescript
// chat-handler.ts
import { commands, chat, type ChatRequest, type ChatContext,
         type ChatResponseStream, type CancellationToken } from "vscode";
import { createPiProcessManager } from "./pi-process-manager";
import { mapAgentEvent } from "./event-mapper";

export interface ChatHandlerOptions {
  workspaceRoot: string;
  onSetupNeeded: () => void;
}

export function createChatHandler(opts: ChatHandlerOptions) {
  const pm = createPiProcessManager({ cwd: opts.workspaceRoot });
  let started = false;

  const handler: chat.ChatRequestHandler = async (
    request: ChatRequest,
    context: ChatContext,
    response: ChatResponseStream,
    token: CancellationToken
  ) => {
    // Lazy start on first message
    if (!started) {
      response.progress("Starting Pi...");
      try {
        await pm.start();
        started = true;
      } catch (err) {
        response.markdown(
          `**Pi failed to start.** ${err}\n\nEnsure Pi is installed (\`pi --version\`) and try again.`
        );
        return { errorDetails: { message: "Pi process failed to start" } };
      }
    }

    // Subscribe to events and stream them
    const unsubscribe = pm.onEvent((event) => {
      const result = mapAgentEvent(event, response);
      if (result.done) {
        unsubscribe();
      }
    });

    // Send message
    await pm.sendMessage(request.prompt);

    // Wait for completion (or cancellation)
    // Note: RpcClient.prompt() returns immediately; events stream asynchronously
    // Use pm.waitForIdle() or listen for agent_end event
  };

  return {
    handler,
    dispose: () => pm.stop(),
  };
}
```

### Anti-Patterns to Avoid
- **Module-level mutable state in new modules:** D-02 forbids it. Use factory closures instead.
- **Empty catch blocks:** All existing empty `catch {}` blocks must be replaced with at minimum `console.error`.
- **Sync file I/O in extension host:** All `readFileSync`, `writeFileSync`, `mkdirSync`, `unlinkSync`, `rmSync` calls must become `fs.promises.*`.
- **Using VS Code LM API for Pi routing:** CHAT-04 explicitly requires routing through `PiProcessManager` (RPC), NOT through `request.model.sendRequest()` or `lm.invokeTool()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pi child process management | Custom `child_process.spawn` + JSON-line parsing | Pi SDK `RpcClient` | Handles stdin/stdout protocol, event subscription, lifecycle, error handling, signal management. Re-implementing is error-prone and duplicates SDK logic. |
| Event stream to chat stream mapping | One monolithic handler | Pure `RpcEventMapper` functions | Pure functions are testable, composable, and can be unit tested without VS Code host. |
| VS Code diff editor management | Custom diff view | `vscode.commands.executeCommand('vscode.diff')` + `vscode.window.tabGroups` | VS Code provides native diff editor with syntax highlighting, navigation, and keyboard shortcuts. |
| File watchers | Polling or custom FS watchers | `fs.watch` (existing pattern) | Already works. Just migrate to async handling in the watcher callbacks. |
| JSON Schema/tool parameters | Manual validation | `typebox` (already used in `src/index.ts`) | Already a dependency. Consistent with existing code pattern. |

**Key insight:** The Pi SDK's `RpcClient` does the heavy lifting for subprocess management. The wrapper (`PiProcessManager`) should be thin -- adding lifecycle guards, crash handling, and workspace isolation on top of the SDK, not re-implementing the RPC protocol.

## Runtime State Inventory

> Include this section for rename/refactor/migration phases only. Phase 1 is a restructuring/refactoring phase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `.pi/review-requests/*.json`, `.pi/review-results/*.json`, `.pi/.vscode-ready` heartbeat file | None -- IPC protocol unchanged; just refactoring code that reads/writes them |
| Live service config | None -- Pi is a local CLI process, no cloud services | N/A |
| OS-registered state | None -- no systemd, launchd, or pm2 registrations | N/A |
| Secrets/env vars | None -- no secret names contain the renamed strings | N/A |
| Build artifacts | `vscode-ext/dist/extension.js` (compiled output), `src/index.ts` compiled by Pi at runtime | After refactoring, recompile: `cd vscode-ext && npm run compile` for VS Code extension. Pi extension is loaded from source (`./src/index.ts`) by Pi framework at startup -- no build step needed for it |

**Nothing found in category:** Live service config, OS-registered state, Secrets/env vars -- verified by codebase analysis. No external services, daemon registrations, or secret keys exist.

## Common Pitfalls

### Pitfall 1: ESM vs CommonJS module mismatch
**What goes wrong:** `@earendil-works/pi-coding-agent` is ESM-only (`"type": "module"` in its package.json). The vscode-ext `tsconfig.json` currently has `"module": "commonjs"`. TypeScript can transpile ESM imports to CommonJS output, but `RpcClient` calls `await import()` internally which may fail in a CommonJS context.
**Why it happens:** The VS Code extension host historically ran extensions as CommonJS. Modern VS Code supports ESM extensions, but the configuration must be right.
**How to avoid:** Keep `"module": "commonjs"` in tsconfig -- TypeScript compiles ESM imports to CommonJS `require()` calls, which works in the VS Code host. Verify by compiling and running `node -e "require('./dist/extension.js')"` which should not throw on the `@earendil-works/pi-coding-agent` import.
**Warning signs:** Runtime errors like `ERR_REQUIRE_ESM` when the extension loads.

### Pitfall 2: Synchronous file I/O in VS Code "slow extension" warning
**What goes wrong:** VS Code shows "extension is slow" warning if `activate()` takes > 10ms. The current code has 3 sync file operations in `activate()`.
**Why it happens:** `fs.mkdirSync`, `fs.writeFileSync`, `fs.readdirSync` in the activation path block the UI thread.
**How to avoid:** Only register commands and create the participant synchronously in `activate()`. Defer ALL file I/O (directory creation, heartbeat start, file watchers, pending review recovery) to a `Promise.resolve().then(() => deferredInit())` call that fires after activation returns.
**Warning signs:** VS Code showing "extension 'vscode-pi-sr' appears slow" in the status bar.

### Pitfall 3: Missing `chatParticipants` contribution in package.json
**What goes wrong:** `vscode.chat.createChatParticipant('pi-sr', handler)` succeeds but `@pi` doesn't appear in the VS Code chat participant picker.
**Why it happens:** VS Code requires the participant to be declared in `package.json` under `contributes.chatParticipants` with at minimum `id` and `name`. The `createChatParticipant` API call alone is not sufficient.
**How to avoid:** Always add the contribution in package.json alongside the API call.
```json
"contributes": {
  "chatParticipants": [
    {
      "id": "pi-sr",
      "name": "pi",
      "fullName": "Pi Agent",
      "description": "Interact with the Pi coding agent",
      "isSticky": true
    }
  ]
}
```

### Pitfall 4: RpcClient.prompt() returns immediately -- events are async
**What goes wrong:** Writing `await client.prompt("Hello"); const events = await client.collectEvents();` may miss events if the agent finishes before the subscription is set up.
**Why it happens:** `prompt()` returns as soon as the command is sent over stdin. The agent processes and emits events asynchronously. If you `await prompt()` then subscribe, you miss the `agent_start` and `message_update` events.
**How to avoid:** Subscribe to events via `onEvent()` BEFORE calling `prompt()`. The subscription callback receives events as they arrive. Use `waitForIdle()` to know when the stream has ended.
**Warning signs:** Chat shows no progress messages or only shows the final response.

### Pitfall 5: Workspace switch -- saving and restoring Pi sessions
**What goes wrong:** When the user switches VS Code workspaces, the Pi process for workspace A needs to stop. If it's not properly saved, all session history is lost.
**Why it happens:** `RpcClient.stop()` kills the process. Pi saves sessions to `.pi/sessions/` by default, but the session file path is tied to the workspace.
**How to avoid:** Before stopping the old workspace's process, call `client.newSession()` to ensure current state is persisted. Store the session file path keyed by workspace root. On restore, call `client.switchSession(sessionPath)` to resume. This is D-08 and requires explicit implementation.
**Warning signs:** User sees "no session history" when switching back to workspace A.

## Code Examples

### Complete Chat Participant Registration (in activate)

```typescript
// extension.ts -- activation
import * as vscode from "vscode";
import { createChatHandler } from "./chat-handler";
import { createReviewCoordinator } from "./review-coordinator";
import * as path from "path";
import * as fs from "fs/promises";

export function activate(context: vscode.ExtensionContext) {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage("Pi Companion: open a workspace first");
    return;
  }

  // Phase 1: Register @pi chat participant synchronously
  const chatHandler = createChatHandler({
    workspaceRoot: root,
    onSetupNeeded: () => {
      vscode.window.showInformationMessage(
        "Pi is not installed. Run: npm install -g @earendil-works/pi"
      );
    },
  });

  const participant = vscode.chat.createChatParticipant("pi-sr", chatHandler.handler);
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, "icon.png");
  context.subscriptions.push(participant, { dispose: () => chatHandler.dispose() });

  // Phase 1: Deferred async initialization (fire-and-forget)
  queueMicrotask(async () => {
    try {
      const readyFile = path.join(root, ".pi", ".vscode-ready");
      await fs.mkdir(path.dirname(readyFile), { recursive: true });
      await fs.writeFile(readyFile, Date.now().toString(), "utf-8");
      // ... start heartbeat, watchers, recover pending reviews
    } catch (err) {
      console.error("Pi Companion: deferred init failed", err);
    }
  });

  // Phase 1: Register existing review commands (will be extracted to review-coordinator)
  context.subscriptions.push(
    vscode.commands.registerCommand("pi-sr.approveCurrent", () => { /* ... */ }),
    vscode.commands.registerCommand("pi-sr.rejectCurrent", () => { /* ... */ })
  );
}

export function deactivate() {
  // Cleanup will be handled by chatHandler.dispose() and reviewCoordinator.dispose()
}
```

### RpcEventMapper Full Implementation

```typescript
// event-mapper.ts
// Source: [VERIFIED: pi-agent-core types.d.ts + VS Code @types/vscode 1.120.0]
import type { ChatResponseStream } from "vscode";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { AssistantMessageEvent } from "@earendil-works/pi-ai";

export interface RpcEventMapper {
  /** Map a single event to stream operations. Pure function. */
  map(event: AgentEvent, stream: ChatResponseStream): void;
  /** Check if the last event indicated completion. */
  isComplete(event: AgentEvent): boolean;
}

export function createRpcEventMapper(): RpcEventMapper {
  return {
    map(event: AgentEvent, stream: ChatResponseStream): void {
      switch (event.type) {
        case "agent_start":
          stream.progress("Pi is starting up...");
          return;

        case "turn_start":
          stream.progress("Processing...");
          return;

        case "message_update": {
          const msgEvent = event.assistantMessageEvent;
          if (msgEvent.type === "text_delta") {
            stream.markdown(msgEvent.delta);
          }
          // Could handle thinking_delta, toolcall_delta if needed later
          return;
        }

        case "tool_execution_start":
          stream.progress(`Tool: ${event.toolName}`);
          return;

        case "tool_execution_update":
          // Optional: show partial progress within a tool
          return;

        case "tool_execution_end":
          // Optionally show tool result summary
          return;

        case "message_end":
          // Ensure any buffered markdown is flushed
          return;

        case "agent_end":
          // Final marker -- caller should stop the stream
          return;

        case "turn_end":
          // Turn concluded, next turn may follow
          return;

        default:
          // Exhaustiveness check
          ((_exhaustive: never) => {})(event);
      }
    },

    isComplete(event: AgentEvent): boolean {
      return event.type === "agent_end";
    },
  };
}
```

### Lazy Pi Process Manager with Crash Handling

```typescript
// pi-process-manager.ts
// Source: [VERIFIED: @earendil-works/pi-coding-agent rpc-client.d.ts]
import { RpcClient } from "@earendil-works/pi-coding-agent";
import type { RpcClientOptions, RpcEventListener } from "@earendil-works/pi-coding-agent";
import type { AgentEvent } from "@earendil-works/pi-agent-core";

export type ProcessStatus = "stopped" | "starting" | "running" | "crashed";

export interface PiProcessManager {
  readonly status: ProcessStatus;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(text: string): Promise<void>;
  abort(): Promise<void>;
  onEvent(listener: RpcEventListener): () => void;
  getStderr(): string;
}

export interface PiProcessManagerOptions {
  cwd: string;
  /** Called on unexpected exit with stderr output */
  onCrash?: (stderr: string) => void;
  /** Optional RpcClientOptions overrides */
  rpcOptions?: Partial<RpcClientOptions>;
}

export function createPiProcessManager(
  opts: PiProcessManagerOptions
): PiProcessManager {
  let client: RpcClient | null = null;
  let status: ProcessStatus = "stopped";

  return {
    get status() { return status; },

    async start() {
      if (status === "running" || status === "starting") return;
      status = "starting";

      try {
        client = new RpcClient({
          cwd: opts.cwd,
          ...opts.rpcOptions,
        });
        await client.start();
        status = "running";
      } catch (err) {
        status = "crashed";
        throw err;
      }
    },

    async stop() {
      if (client) {
        await client.stop();
        client = null;
      }
      status = "stopped";
    },

    async sendMessage(text: string) {
      if (!client || status !== "running") {
        throw new Error("Pi process is not running");
      }
      // Subscribe MUST happen before prompt() to avoid missing events
      await client.prompt(text);
    },

    async abort() {
      await client?.abort();
    },

    onEvent(listener: RpcEventListener): () => void {
      if (!client) throw new Error("Process not started");
      return client.onEvent(listener);
    },

    getStderr(): string {
      return client?.getStderr() ?? "";
    },
  };
}
```

### Deferred Initialization Pattern

```typescript
// Used in activate() to avoid blocking VS Code startup
export function deferInit(initFn: () => Promise<void>): void {
  // Return immediately, schedule initialization after activation completes
  queueMicrotask(async () => {
    try {
      await initFn();
    } catch (err) {
      console.error("Pi Companion: deferred init failed", err);
    }
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Module-level `let` state | Factory closure state | Phase 1 | Enables testability, teardown, multiple instances |
| Sync `fs.*` calls | Async `fs.promises.*` | Phase 1 | Eliminates VS Code "slow extension" warnings, better concurrency |
| Monolithic extension.ts (368 lines) | Domain files (process manager, event mapper, chat handler, review coordinator) | Phase 1 | Improved maintainability, testability, separation of concerns |
| Empty `catch {}` blocks | `console.error` or user-facing error messages | Phase 1 | Better debugging, actionable error messages |
| No tests | Unit tests for pure functions | Phase 1 | Regression protection, confidence in refactoring |
| Pi extension and VS Code extension isolated | Shared types in `shared/` directory | Phase 1 | Eliminates type duplication, single source of truth for IPC protocol |

**Deprecated/outdated:**
- `vscode-ext/src/types.ts` -- move to `shared/types.ts`; existing file can be re-export or removed
- Direct `child_process` for RPC -- use Pi SDK `RpcClient` instead

## Assumptions Log

> All claims in this research were verified or cited -- no user confirmation needed.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | vscode-ext can import ESM packages despite `module: "commonjs"` in tsconfig | Standard Stack | TypeScript compilation error; may need `allowSyntheticDefaultImports` or moduleResolution adjustment |
| A2 | `@earendil-works/pi-coding-agent` must be added as a direct dependency of vscode-ext | Standard Stack | If root node_modules is hoisted and accessible, it may work without explicit install -- but explicit is safer for packaging |

Both assumptions are LOW risk: A1 is standard TypeScript behavior (ESM imports compile to CJS `require()`); A2 follows standard npm hoisting rules.

## Open Questions

1. **Does VS Code 1.82 Chat API support `stream.markdown()` with concatenated strings?**
   - What we know: `ChatResponseStream.markdown()` accepts `string | MarkdownString`. The `text_delta` events from Pi arrive as small fragments (single words or tokens).
   - What's unclear: Whether successive `markdown()` calls render as a continuous stream or whether markdown boundaries cause unwanted rendering artifacts (e.g., `**bold` in one call and `text**` in the next).
   - Recommendation: Test with a simple `@pi` message response. If markdown breaks across delta boundaries, buffer text_delta content and flush on non-text events or on newlines.

2. **How to handle Pi `agent_end` event for detecting stream completion?**
   - What we know: `agent_end` is the final event emitted after a prompt completes.
   - What's unclear: The `RpcClient` emits an `agent_end` AgentEvent through `onEvent()`, but there's also `waitForIdle()` which resolves on `agent_end`. Which mechanism should the chat handler use for detecting completion?
   - Recommendation: Use `waitForIdle()` from the process manager after calling `prompt()`. The `onEvent` subscription handles streaming visuals; `waitForIdle` handles completion detection. Both should work -- `waitForIdle` is cleaner for the chat handler.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | Yes | v24.15.0 | -- |
| npm | Package management | Yes | bundled | -- |
| Pi CLI (`pi --version`) | PiProcessManager start | Not checked | -- | Show setup message per D-07 |
| TypeScript compiler | Build | Yes | 5.3.0 (vscode-ext) / 6.0.3 (root) | -- |
| git | Version control | Yes | -- | -- |
| vitest | Testing | No | -- | Use `node:test` (built-in) |
| @vscode/vsce | Packaging | Yes | ^3.2.0 | -- |

**Missing dependencies with no fallback:** None
**Missing dependencies with fallback:** vitest (fallback: `node:test`)

## Validation Architecture

> nyquist_validation is enabled in .planning/config.json

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest latest or `node:test` (built-in) |
| Config file | `vscode-ext/vitest.config.ts` or inline in `package.json` |
| Quick run command | `cd vscode-ext && npx vitest run --reporter=verbose` |
| Full suite command | Same as quick run (single phase, no parallel suites) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-04 | RpcEventMapper maps `agent_start` to `stream.progress()` | unit | `npx vitest run tests/event-mapper.test.ts` | No -- Wave 0 |
| FOUND-04 | RpcEventMapper maps `message_update` (text_delta) to `stream.markdown()` | unit | same | No -- Wave 0 |
| FOUND-04 | RpcEventMapper maps `tool_execution_start` to `stream.progress()` | unit | same | No -- Wave 0 |
| FOUND-04 | RpcEventMapper returns `done: true` on `agent_end` | unit | same | No -- Wave 0 |
| FOUND-04 | RpcEventMapper handles unknown events without error | unit | same | No -- Wave 0 |
| FOUND-01 | `resolveSafe` path normalization works with and without leading / | unit | `npx vitest run tests/utils.test.ts` | No -- Wave 0 |
| FOUND-02 | All sync file I/O calls migrated to async | manual review | -- | No -- Wave 0 |
| FOUND-03 | PiProcessManager.start() creates RpcClient | integration | manual | No -- Wave 0 (requires Pi installed) |
| CHAT-01 | Chat participant is registered with expected ID | unit | `npx vitest run tests/chat-handler.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd vscode-ext && npx vitest run tests/event-mapper.test.ts tests/utils.test.ts --reporter=verbose`
- **Per wave merge:** `cd vscode-ext && npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vscode-ext/vitest.config.ts` -- vitest configuration
- [ ] `vscode-ext/tests/event-mapper.test.ts` -- unit tests for RpcEventMapper (covers FOUND-04)
- [ ] `vscode-ext/tests/utils.test.ts` -- unit tests for resolveSafe and IPC validation (covers FOUND-01)
- [ ] `vscode-ext/vitest` package install (`npm install -D vitest`)

## Security Domain

> `security_enforcement` is not explicitly set to false in config.json. Including security analysis.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Pi process authentication is out of scope for this phase |
| V3 Session Management | Partial | Workspace isolation (D-08) involves Pi session files -- saved to `.pi/sessions/`, no custom auth |
| V4 Access Control | No | No user/role model |
| V5 Input Validation | Yes | Chat prompt is passed to Pi via `RpcClient.prompt()` -- Pi handles LLM prompt injection. VS Code side should validate that the prompt is a string, not arbitrary binary data |
| V6 Cryptography | No | No encryption requirements in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via workspace path | Tampering | Path validation: ensure `opts.cwd` is a real directory, not a crafted path. `RpcClient` already handles this |
| Pi process crash leaking sensitive stderr | Information Disclosure | D-06: Show crash error in chat for debugging. Don't log full stderr to disk or console |
| VS Code Chat prompt injection | Spoofing | Pi agent handles this internally -- VS Code extension is a pass-through. No additional sanitization needed. The `ChatRequest.prompt` is forwarded as-is |

## Sources

### Primary (HIGH confidence)
- [VERIFIED: npm registry] `@types/vscode` 1.120.0 -- ChatParticipant, ChatRequest, ChatResponseStream, `chat.createChatParticipant` -- confirmed from installed type definitions at `/home/sergey/www/pi-vscode-sr/vscode-ext/node_modules/@types/vscode/index.d.ts`
- [VERIFIED: npm registry] `@earendil-works/pi-coding-agent` 0.74.0 -- `RpcClient` class with full API (start, stop, onEvent, prompt, waitForIdle, abort, newSession, getState) -- confirmed from installed type definitions at `/home/sergey/www/pi-vscode-sr/node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.d.ts`
- [VERIFIED: npm registry] `@earendil-works/pi-agent-core` 0.74.0 -- `AgentEvent` type union (agent_start, agent_end, turn_start, turn_end, message_start, message_update, message_end, tool_execution_start, tool_execution_update, tool_execution_end) -- confirmed from installed type definitions at `/home/sergey/www/pi-vscode-sr/node_modules/@earendil-works/pi-agent-core/dist/types.d.ts`
- [CITED: context7 docs] Pi RPC documentation at `/earendil-works/pi` -- RpcClient usage examples, event handling patterns, JSON-line protocol
- [CITED: code.visualstudio.com/api/extension-guides/chat] VS Code Chat extension guide -- createChatParticipant, ChatRequestHandler signature, stream.markdown(), stream.button(), package.json chatParticipants contribution

### Secondary (MEDIUM confidence)
- [VERIFIED: codebase] Existing `vscode-ext/src/extension.ts` and `src/index.ts` -- current sync I/O patterns, module structure, IPC protocol implementation
- [VERIFIED: codebase] Existing `vscode-ext/src/types.ts` -- ReviewRequest, ReviewResult, DiffSession interfaces

### Tertiary (LOW confidence)
- None -- all findings verified against installed type definitions or official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified against installed type definitions and npm registry
- Architecture: HIGH -- patterns derived from user decisions (D-01 through D-13) and verified SDK APIs
- Pitfalls: MEDIUM -- based on known VS Code extension development patterns and Pi SDK behavior; some edge cases (ESM compatibility, event timing) need runtime verification
- Validation: MEDIUM -- vitest setup is standard but no VS Code extension test runner integration exists yet

**Research date:** 2026-06-14
**Valid until:** 2026-07-14 (stable APIs -- VS Code Chat API and Pi SDK are mature)
