# Phase 1: Foundation + Chat Basics - Pattern Map

**Mapped:** 2026-06-14
**Files analyzed:** 17 (13 new, 4 modified)
**Analogs found:** 7 / 17

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `shared/types.ts` | model | — | `vscode-ext/src/types.ts` | exact |
| `shared/ipc.ts` | config | — | (inline constants in `src/index.ts`, `vscode-ext/src/extension.ts`) | partial |
| `shared/path-utils.ts` | utility | — | `resolveSafe()` in `src/index.ts:233-242` + `vscode-ext/src/extension.ts:82-91` | exact |
| `vscode-ext/src/pi-process-manager.ts` | service | event-driven | `src/index.ts` export default function (Pi extension lifecycle) | partial |
| `vscode-ext/src/event-mapper.ts` | utility | transform | (none — new pure-function pattern) | none |
| `vscode-ext/src/chat-handler.ts` | controller | request-response | `src/index.ts:37-128` async createReviewAndWait flow | partial |
| `vscode-ext/src/review-coordinator.ts` | service | event-driven + CRUD | `vscode-ext/src/extension.ts:79-368` review logic | exact |
| `vscode-ext/src/utils.ts` | utility | — | `vscode-ext/src/extension.ts:34-38` heartbeat + dir setup | exact |
| `vscode-ext/tests/event-mapper.test.ts` | test | — | (none — no existing tests) | none |
| `vscode-ext/tests/path-utils.test.ts` | test | — | (none — no existing tests) | none |
| `vscode-ext/tests/ipc.test.ts` | test | — | (none — no existing tests) | none |
| `vscode-ext/tests/pi-process-manager.test.ts` | test | — | (none — no existing tests) | none |
| `vscode-ext/vitest.config.ts` | config | — | (none — no existing vitest config) | none |
| `vscode-ext/src/extension.ts` (modified) | controller | request-response + event-driven | self — current `extension.ts` | self-refactor |
| `vscode-ext/src/types.ts` (modified) | model | — | self — will migrate to shared/ | self-refactor |
| `vscode-ext/package.json` (modified) | config | — | self — current `package.json` | self-refactor |
| `src/index.ts` (modified) | controller | event-driven | self — current `src/index.ts` | self-refactor |

## Pattern Assignments

### `shared/types.ts` (model)

**Analog:** `vscode-ext/src/types.ts` (lines 1-36) — EXACT match, migrating as-is.

**Imports pattern:** None needed — pure interface/type file with no imports.

**Core pattern** (lines 1-36):
```typescript
export interface ReviewFile {
  path: string;
  original: string;
  proposed: string;
  description?: string;
  language?: string;
}

export interface ReviewRequest {
  id: string;
  title: string;
  files: ReviewFile[];
}

export type FileStatus = 'pending' | 'approved' | 'rejected';

export interface ReviewResultFile {
  path: string;
  status: 'approved' | 'rejected';
  final: string;
}

export interface ReviewResult {
  id: string;
  status: 'approved' | 'rejected';
  files: ReviewResultFile[];
}

export interface DiffSession {
  reviewId: string;
  filePath: string;
  originalFsPath: string;
  tmpFsPath: string;
  status: FileStatus;
}
```

**Action:** Move these 5 types as-is to `shared/types.ts`. Re-export from original location or update imports.

---

### `shared/ipc.ts` (config)

**Analog:** No existing config file for IPC paths. Constants are inline in `src/index.ts` and `vscode-ext/src/extension.ts`.

**Pattern to extract from source** (src/index.ts lines 47, 66-67, 78, 116, 459-460):
```typescript
// Inline constants currently duplicated:
const resultsDir = join(ctx.cwd, ".pi", "review-results");    // src/index.ts:47
const requestsDir = join(ctx.cwd, ".pi", "review-requests");   // src/index.ts:66-67
const resultPath = join(resultsDir, `${uuid}.json`);           // src/index.ts:78
const tmpDir = path.join(workspaceRoot, '.pi', 'tmp', req.id); // extension.ts:116
```

**Action:** Define all IPC path constants in `shared/ipc.ts` as named exports:
```typescript
export const IPC_BASE = '.pi';
export const IPC_REVIEW_REQUESTS = '.pi/review-requests';
export const IPC_REVIEW_RESULTS = '.pi/review-results';
export const IPC_TMP = '.pi/tmp';
export const IPC_HEARTBEAT = '.pi/.vscode-ready';
```

---

### `shared/path-utils.ts` (utility)

**Analog:** `resolveSafe()` in `src/index.ts:233-242` AND `vscode-ext/src/extension.ts:82-91` — exact match, extracting duplicated function.

**Core pattern** (extension.ts lines 82-91):
```typescript
/** Normalize a file path from review request, handling LLM paths without leading /. */
function resolveSafe(filePath: string): string {
  if (filePath.startsWith('/')) return filePath; // Already absolute
  const cwdClean = workspaceRoot.replace(/\/+$/, '').replace(/^\//, '');
  if (filePath.startsWith(cwdClean + '/')) {
    filePath = filePath.substring(cwdClean.length + 1);
  }
  return path.join(workspaceRoot, filePath);
}
```

**Corresponding version with cwd param** (src/index.ts lines 233-242):
```typescript
function resolveSafe(cwd: string, filePath: string): string {
    const cwdClean = cwd.replace(/\/+$/, "").replace(/^\//, "");
    if (filePath.startsWith(cwdClean + "/")) {
        filePath = filePath.substring(cwdClean.length + 1);
    }
    return resolve(cwd, filePath);
}
```

**Action:** Extract to `shared/path-utils.ts` with the `(cwd, filePath)` signature (more portable), making both callers consistent.

---

### `vscode-ext/src/pi-process-manager.ts` (service, event-driven)

**Analog:** `src/index.ts` default export (lines 421-453) — partial match for lifecycle management pattern. Also `RpcClient` type definitions (rpc-client.d.ts lines 33-223) — this wraps that API.

**Imports pattern** (from src/index.ts lines 1-4):
```typescript
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
```

**For pi-process-manager.ts (adapted from research example + RpcClient types):**
```typescript
import { RpcClient } from '@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.js';
import type { AgentEvent } from '@earendil-works/pi-agent-core';
```

**Factory pattern** (research.md lines 240-273 — new pattern for this codebase, no existing analog):
```typescript
export function createPiProcessManager(opts: {
  cwd: string;
  model?: string;
  provider?: string;
}): PiProcessManager {
  const state: PiProcessManagerState = {
    client: null,
    cwd: opts.cwd,
    sessionId: null,
  };
  const listeners = new Set<(event: AgentEvent) => void>();

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
    // ...
  };
}
```

**Error handling pattern** — adopt from existing tool override pattern in `src/index.ts` (lines 308-310): return error objects, do not throw:
```typescript
// From src/index.ts tool execute catch blocks
return {
  isError: true,
  content: [{ type: "text", text: `Error message` }],
  details: { status: "error" },
};
```

**Key methods on RpcClient to wrap** (rpc-client.d.ts lines 45-219):
- `start(): Promise<void>` — spawns agent in RPC mode
- `stop(): Promise<void>` — stops the process
- `prompt(message: string, images?: ImageContent[]): Promise<void>` — non-blocking send
- `promptAndWait(message, images?, timeout?): Promise<AgentEvent[]>` — send and collect all events
- `abort(): Promise<void>` — abort current operation
- `onEvent(listener: RpcEventListener): () => void` — subscribe to events; returns unsubscribe fn
- `getState(): Promise<RpcSessionState>` — get current session state
- `newSession(parentSession?): Promise<{ cancelled: boolean }>` — start new session
- `switchSession(sessionPath: string): Promise<{ cancelled: boolean }>` — switch workspace sessions
- `waitForIdle(timeout?: number): Promise<void>` — wait for agent_end
- `collectEvents(timeout?: number): Promise<AgentEvent[]>` — collect events until idle

---

### `vscode-ext/src/event-mapper.ts` (utility/transform)

**Analog:** No existing pure-function utility in codebase. This is a brand new pattern. Use research examples as reference.

**Imports pattern:**
```typescript
import type { AgentEvent } from '@earendil-works/pi-agent-core';
import type { ChatResponseStream } from 'vscode';
```

**Core pure function pattern** (research.md lines 388-468):
```typescript
export type StreamAction =
  | { type: 'progress'; value: string }
  | { type: 'markdown'; value: string }
  | { type: 'done' }
  | { type: 'error'; value: string };

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
      return { type: 'markdown', value: '```\nerror executing tool...\n```\n' };
    case 'tool_execution_end':
      if (event.isError) {
        return { type: 'markdown', value: 'Tool ' + event.toolName + ' failed' };
      }
      return { type: 'markdown', value: 'Tool ' + event.toolName + ' completed' };
    case 'message_end':
      return { type: 'markdown', value: '' };
    case 'agent_end':
      return { type: 'done' };
    default:
      return { type: 'markdown', value: '' };
  }
}

export function applyStreamAction(
  stream: ChatResponseStream,
  action: StreamAction
): void {
  switch (action.type) {
    case 'progress': stream.progress(action.value); break;
    case 'markdown': if (action.value) stream.markdown(action.value); break;
    case 'error': stream.markdown('- ' + action.value); break;
    case 'done': break;
  }
}

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

**AgentEvent type reference** (from types.d.ts lines 330-368):
```typescript
export type AgentEvent = {
  type: "agent_start";
} | {
  type: "agent_end";
  messages: AgentMessage[];
} | {
  type: "turn_start";
} | {
  type: "turn_end";
  message: AgentMessage;
  toolResults: ToolResultMessage[];
} | {
  type: "message_start";
  message: AgentMessage;
} | {
  type: "message_update";
  message: AgentMessage;
  assistantMessageEvent: AssistantMessageEvent;
} | {
  type: "message_end";
  message: AgentMessage;
} | {
  type: "tool_execution_start";
  toolCallId: string;
  toolName: string;
  args: any;
} | {
  type: "tool_execution_update";
  toolCallId: string;
  toolName: string;
  args: any;
  partialResult: any;
} | {
  type: "tool_execution_end";
  toolCallId: string;
  toolName: string;
  result: any;
  isError: boolean;
};
```

---

### `vscode-ext/src/chat-handler.ts` (controller, request-response)

**Analog:** `src/index.ts` `createReviewAndWait` async handler pattern (lines 37-128) — partial match for async handler with blocking lifecycle.

**Imports pattern:**
```typescript
import * as vscode from 'vscode';
import type { PiProcessManager } from './pi-process-manager';
import { streamEvents } from './event-mapper';
```

**Core ChatRequestHandler pattern** (research.md lines 495-521):
```typescript
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
        '- Pi process encountered an error:\n```\n' + err + '\n```\n' +
        'Run `pi -c` in terminal to resume the session. Send another message to restart.'
      );
    }
  };
}
```

**Error handling pattern** (from existing tool override pattern, src/index.ts lines 308-310):
Display errors in the chat stream for visibility, never throw from the handler. Match D-06 crash visibility requirements.

---

### `vscode-ext/src/review-coordinator.ts` (service, event-driven + CRUD)

**Analog:** `vscode-ext/src/extension.ts` lines 79-368 — EXACT match, this is extracted code.

**Imports pattern:**
```typescript
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ReviewRequest, ReviewResult, ReviewResultFile, DiffSession } from '../shared/types';
import { resolveSafe } from '../shared/path-utils';
// Note: IPC path constants imported from shared/ipc
```

**Factory pattern** (new — no classes, closure-based state per D-02):
```typescript
export function createReviewCoordinator(opts: {
  workspaceRoot: string;
  requestsDir: string;
  resultsDir: string;
}): ReviewCoordinator {
  // State in closure
  const sessions = new Map<string, DiffSession>();
  const reviewFiles = new Map<string, Set<string>>();
  let watcher: fs.FSWatcher | null = null;
  let resultsWatcher: fs.FSWatcher | null = null;

  return {
    start() { /* Create watchers, start dir polling */ },
    stop() { /* Close watchers */ },
    handleRequest(requestPath: string) { /* extracted from extension.ts:93-148 */ },
    approveCurrent() { /* extracted from extension.ts:175-201 */ },
    rejectCurrent() { /* extracted from extension.ts:203-223 */ },
    handleResult(resultPath: string) { /* extracted from extension.ts:227-259 */ },
    checkReviewComplete(reviewId: string) { /* extracted from extension.ts:292-367 */ },
  };
}
```

**Key extracted functions with existing patterns:**

- `handleRequest` (extension.ts:93-148) — reads JSON, creates tmp files, opens diff editors
- `getCurrentSession` (extension.ts:152-172) — 3-tier session lookup (active editor, visible editors, pending fallback)
- `approveCurrent` (extension.ts:175-201) — reads tmp, writes to original, unlinks tmp, closes diff
- `rejectCurrent` (extension.ts:203-223) — unlinks tmp, closes diff
- `handleResult` (extension.ts:227-259) — processes terminal-TUI-written results, closes tabs, cleans up
- `closeReviewTabs` (extension.ts:263-288) — iterates all tab groups to close diff tabs by reviewId
- `checkReviewComplete` (extension.ts:292-367) — aggregates per-file results, writes final result JSON

**Migration note:** ALL `fs.*Sync` calls in the extracted code must be migrated to `fs.promises`:
```typescript
// OLD (sync):
const req = JSON.parse(fs.readFileSync(requestPath, 'utf-8'));

// NEW (async):
const raw = await fs.promises.readFile(requestPath, 'utf-8');
const req = JSON.parse(raw);
```

---

### `vscode-ext/src/utils.ts` (utility)

**Analog:** Heartbeat in `extension.ts:34-38` — exact match for heartbeat and PI detection.

**Core patterns to extract:**

**Heartbeat** (extension.ts lines 34-39):
```typescript
// Signal to Pi that VS Code is open with this project (heartbeat: timestamp)
const readyFile = path.join(workspaceRoot, '.pi', '.vscode-ready');
fs.writeFileSync(readyFile, Date.now().toString(), 'utf-8');
const heartbeatTimer = setInterval(() => {
  try { fs.writeFileSync(readyFile, Date.now().toString(), 'utf-8'); } catch {}
}, 15_000);
context.subscriptions.push({ dispose: () => clearInterval(heartbeatTimer) });
```

**Pi version check** (from research.md lines 556-565):
```typescript
async function checkPiInstalled(): Promise<boolean> {
  const { execSync } = await import('child_process');
  try {
    execSync('pi --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
```

**Dir creation** (extension.ts lines 30-31):
```typescript
fs.mkdirSync(requestsDir, { recursive: true });
fs.mkdirSync(resultsDir, { recursive: true });
```

**Implement as:**
```typescript
export function startHeartbeat(workspaceRoot: string): { dispose: () => void } { ... }
export async function ensurePiDirs(workspaceRoot: string): Promise<void> { ... }
export async function checkPiInstalled(): Promise<boolean> { ... }
```

---

### Test files (no existing analogs — new patterns)

**No existing tests or test patterns exist in the codebase.** These will be new patterns.

**`vscode-ext/vitest.config.ts`** (research.md — standard vitest config):
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

**`vscode-ext/tests/event-mapper.test.ts`** — test the pure function with input/output pairs:
```typescript
import { describe, it, expect } from 'vitest';
import { mapAgentEventToAction, StreamAction } from '../src/event-mapper';
// Test each AgentEvent variant -> expected StreamAction
```

**`vscode-ext/tests/path-utils.test.ts`** — test resolveSafe with absolute, relative, and LLM-oops paths.

**`vscode-ext/tests/ipc.test.ts`** — test IPC message validation (JSON.parse + schema checks).

**`vscode-ext/tests/pi-process-manager.test.ts`** — test factory returns expected API shape.

---

### `vscode-ext/src/extension.ts` (modified — self-refactor)

**Current pattern** (lines 19-66) — will be refactored to:
1. Synchronous phase: workspace check, factory instantiation, command registration
2. Deferred phase: Pi version check, dir creation, watchers, heartbeat, chat participant

**Target pattern** (from research.md lines 535-585 — FOUND-05 deferred init):
```typescript
export function activate(context: vscode.ExtensionContext) {
  // Phase 1: Sync -- must return in <1ms
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage('Pi Companion: open a workspace first');
    return;
  }

  // Create factories immediately (synchronous, no I/O)
  const processManager = createPiProcessManager({ cwd: root });
  const reviewCoordinator = createReviewCoordinator({
    workspaceRoot: root,
    requestsDir: path.join(root, '.pi', 'review-requests'),
    resultsDir: path.join(root, '.pi', 'review-results'),
  });

  // Register sync commands immediately
  context.subscriptions.push(
    vscode.commands.registerCommand('pi-sr.approveCurrent', () => reviewCoordinator.approveCurrent()),
    vscode.commands.registerCommand('pi-sr.rejectCurrent', () => reviewCoordinator.rejectCurrent()),
  );

  // Phase 2: Deferred async initialization (fire-and-forget)
  void (async () => {
    try {
      const piFound = await checkPiInstalled();
      if (!piFound) {
        vscode.window.showInformationMessage(
          'Pi Companion: Pi CLI not found. Install: npm install -g @earendil-works/pi-tui'
        );
        return;
      }

      await ensurePiDirs(root);
      reviewCoordinator.start();

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
  // Teardown through factory APIs
}
```

**Imports pattern** (updated):
```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import { createPiProcessManager } from './pi-process-manager';
import { createChatHandler } from './chat-handler';
import { createReviewCoordinator } from './review-coordinator';
import { checkPiInstalled, ensurePiDirs } from './utils';
```

---

### `vscode-ext/package.json` (modified)

**Current contributes** (lines 21-47):
```json
"contributes": {
  "commands": [ /* approveCurrent, rejectCurrent */ ],
  "menus": { "editor/title": [ /* approve, reject buttons */ ] }
}
```

**Add chatParticipants contribution** (from research.md lines 597-611):
```json
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
  "commands": [
    {
      "command": "pi-sr.approveCurrent",
      "title": "Pi SR: Accept",
      "icon": "$(check)"
    },
    {
      "command": "pi-sr.rejectCurrent",
      "title": "Pi SR: Reject",
      "icon": "$(close)"
    }
  ],
  "menus": {
    "editor/title": [
      {
        "command": "pi-sr.approveCurrent",
        "when": "piSr.isActive",
        "group": "navigation@1"
      },
      {
        "command": "pi-sr.rejectCurrent",
        "when": "piSr.isActive",
        "group": "navigation@2"
      }
    ]
  }
}
```

---

### `src/index.ts` (modified — refactored)

**Current pattern** (lines 1-470) — monolithic single default export. Refactoring specifics not fully defined in CONTEXT.md but D-12 requires deep restructuring similar to vscode-ext.

**Current architecture:**
- Tool overrides: `registerWriteOverride` (lines 246-320), `registerEditOverride` (lines 324-417)
- Lifecycle handlers: `session_start`, `before_agent_start`, `message_end` (lines 424-449)
- Review lifecycle: `createReviewAndWait` (lines 37-128)
- TUI selector: `showTuiSelector` (lines 170-202)
- Path utilities: `resolveSafe` (lines 233-242)
- File polling: `pollResultFile` (lines 145-168)

**Action:** Extract to domain modules matching vscode-ext structure where feasible. Keep tool registration in a separate file. Use `shared/` imports for types and utilities.

---

## Shared Patterns

### Factory Pattern with Closure State (D-02)

**Source:** Research.md lines 212-273 (new pattern for codebase — no existing analog)
**Apply to:** `pi-process-manager.ts`, `chat-handler.ts`, `review-coordinator.ts`

```typescript
export function createXxx(opts: XxxOptions): XxxApi {
  // State in closure, NOT at module level
  const state = { /* ... */ };

  return {
    method1() { /* uses state via closure */ },
    method2() { /* uses state via closure */ },
  };
}
```

**Key rule:** No module-level `let`/`const` for mutable state. The current pattern in `extension.ts` (lines 7-17) uses module-level `let` — this is being replaced.

### Deferred Async Initialization (FOUND-05)

**Source:** Research.md lines 283-327 + extension.ts structure
**Apply to:** `extension.ts` activate function

```typescript
export function activate(context: vscode.ExtensionContext) {
  // Phase 1: Sync — return immediately (<1ms)
  //   - Check workspace
  //   - Create factories (synchronous, no I/O)
  //   - Register sync commands

  // Phase 2: Deferred async init (fire-and-forget)
  void (async () => {
    try {
      // pi --version check
      // dir creation
      // watchers
      // heartbeat
      // chat participant registration
    } catch (err) {
      console.error('deferred init failed:', err);
    }
  })();
}
```

### Async File I/O Migration

**Current pattern (being replaced):** `fs.readFileSync`, `fs.writeFileSync`, `fs.mkdirSync`, `fs.unlinkSync`, `fs.rmSync`, `fs.readdirSync` — found throughout `extension.ts` (~15 sync calls) and `src/index.ts`.

**New pattern (all vscode-ext code):**
```typescript
import * as fs from 'fs/promises';
// or:
import { readFile, writeFile, mkdir, unlink, rm, readdir } from 'fs/promises';

await mkdir(requestsDir, { recursive: true });
await writeFile(readyFile, Date.now().toString(), 'utf-8');
const raw = await readFile(requestPath, 'utf-8');
```

**Note:** `src/index.ts` (Pi extension) may keep sync I/O — it runs in a CLI process, not VS Code extension host. The `fs.*Sync` migration requirement (D-11) applies mainly to vscode-ext which runs in the extension host.

### Error Handling

**Current pattern** (extension.ts lines 198-200, 221-223 — local try/catch with user-facing errors):
```typescript
try {
  // operation
} catch (err) {
  vscode.window.showErrorMessage(`Pi Companion: operation failed -- ${err}`);
}
```

**Current pattern** (src/index.ts lines 308-310 — tool result error objects):
```typescript
return {
  isError: true,
  content: [{ type: "text", text: `Error description` }],
  details: { path: params.path, status: "error" },
};
```

**Apply to:**
- Chat handler: errors displayed in chat stream via `stream.markdown()` (D-06 crash visibility)
- Review coordinator: `showErrorMessage()` for user-facing errors, `console.error` for internal errors
- Process manager: error objects, not thrown exceptions

### Import Organization

**vscode-ext pattern** (2-space indent, namespace imports for vscode):
```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ReviewRequest, ReviewResult } from './types';
```

**Pi extension pattern** (4-space indent, named imports):
```typescript
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
```

**New convention (all Phase 1 files):**
- vscode-ext files: 2-space indent, keep `import * as vscode` for VS Code API
- Shared files: 2-space indent (matched to vscode-ext consumer)
- Pi extension files: 4-space indent (maintain existing convention)
- Always use ESM `import`/`export` syntax (per D-10)

### VS Code Chat API

**Source:** Research.md lines 488-521, 597-611 (new pattern)
**Apply to:** `extension.ts` + `chat-handler.ts` + `package.json`

Three points of integration:
1. `package.json` — `contributes.chatParticipants` with id `"pi-sr.chat"`
2. `extension.ts` — `vscode.chat.createChatParticipant('pi-sr.chat', handler)` in deferred init
3. `chat-handler.ts` — `ChatRequestHandler` implementation

### Guard Clause Flow

**Source:** `extension.ts` lines 93-100, `src/index.ts` lines 288-317
**Apply to:** All handler functions

```typescript
// Current pattern — heavy use of early returns:
function handleRequest(requestPath: string) {
  if (!filename?.endsWith('.json')) return;
  let req;
  try { req = JSON.parse(read(...)); } catch { showError(...); return; }
  if (!req.id || !req.files?.length) return;
  if (reviewFiles.has(req.id)) return;
  // ... main logic
}
```

Continue this guard-clause pattern in all new code.

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `vscode-ext/src/event-mapper.ts` | utility | transform | No existing pure function mapper — brand new pattern for this codebase |
| `vscode-ext/tests/event-mapper.test.ts` | test | — | No existing test files anywhere in the project |
| `vscode-ext/tests/path-utils.test.ts` | test | — | No existing test files anywhere in the project |
| `vscode-ext/tests/ipc.test.ts` | test | — | No existing test files anywhere in the project |
| `vscode-ext/tests/pi-process-manager.test.ts` | test | — | No existing test files anywhere in the project |
| `vscode-ext/vitest.config.ts` | config | — | No existing vitest config in the project |
| `shared/ipc.ts` | config | — | IPC path constants currently inline; no existing constants file |

## Metadata

**Analog search scope:** `src/` and `vscode-ext/src/` directories, Pi SDK type definitions
**Files scanned:** 5 (src/index.ts, vscode-ext/src/extension.ts, vscode-ext/src/types.ts, vscode-ext/package.json, Pi SDK RpcClient types)
**Pattern extraction date:** 2026-06-14
**Key constraint notes:**
- All new vscode-ext files: 2-space indent, ESM imports, factory closures, async I/O only
- All new shared files: 2-space indent, ESM exports only, consumed by both packages
- No classes anywhere per D-01
- No module-level mutable state per D-02
- All `fs.*Sync` replaced with `fs.promises` in vscode-ext code per D-11
