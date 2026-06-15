# Phase 2: Rich Chat Experience - Research

**Researched:** 2026-06-15
**Domain:** VS Code Chat API streaming, Pi SDK RPC protocol, markdown progressive rendering, extension UI protocol
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Tool Execution Visibility
- **D-01:** Tool execution visibility is a user-configurable VS Code setting — `pi.chat.toolVisibility` with values `"verbose"` (default) and `"quiet"`.
- **D-02:** Verbose mode renders each tool execution as a **collapsible section, collapsed by default**. The tool name is the summary; clicking expands to show partial results and completion status. Quiet mode shows only "Pi is working..." progress.
- **D-03:** Implementation should use HTML `<details>`/`<summary>` tags in streamed markdown if VS Code Chat's renderer supports them. Researcher to verify webview-backed markdown renderer compatibility.

#### Mid-Response Interruption
- **D-04:** Interruption behavior is a user-configurable VS Code setting — `pi.chat.interruptionBehavior` with values `"abort"` (default) and `"followUp"`.
- **D-05:** `"abort"` immediately kills the current Pi response via `RpcClient.abort()` and starts the new message as a fresh turn. `"followUp"` queues the new message via `RpcClient.followUp()` and processes it after the current response completes.
- **D-06:** `steer()` is excluded — simpler surface area, fewer edge cases around mid-stream redirection.

#### Slash Command UX
- **D-07:** Slash commands are **pure passthrough** to Pi — the extension sends user text as-is, Pi interprets `/` commands natively. No command parsing or validation in the extension.
- **D-08:** The extension fetches available commands via `RpcClient.getCommands()` and registers them so VS Code Chat shows **autocomplete suggestions** when the user types `/`. This enhances discoverability without interpreting commands.
- **D-09:** Commands are **fetched on each `/` keystroke** (not cached for the session). `getCommands()` is local RPC over stdin/stdout JSON-line protocol, not a network call — expected to be fast. Researcher to verify performance.
- **D-10:** All command sources appear in autocomplete: extensions, prompt templates, skills, and custom agents — everything `getCommands()` returns.

#### Terminal TUI Coexistence
- **D-11:** Pi's `RpcExtensionUIRequest` events (`select`, `confirm`, `input`, `notify`) are handled using **VS Code's native UI API**, not markdown buttons or custom webviews. `window.showQuickPick()` for selections, `window.showInputBox()` for text input, `window.showInformationMessage()` for notifications.
- **D-12:** The RPC UI request handling pipeline should be established in Phase 2. Phase 3 builds on this infrastructure for review-specific controls (approve/reject/rethink buttons in chat).
- **D-13:** Terminal TUI remains the fallback when VS Code is not connected — both paths must be verified working. The extension must not break the existing `.pi/` file-based review protocol.

### Claude's Discretion
No areas were delegated — all decisions were user-confirmed.

### Deferred Ideas (OUT OF SCOPE)
- **`steer()` interruption mechanism** — Excluded from interruption options for simplicity.
- **Per-category tool visibility toggles** — Chose simple two-level verbose/quiet.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAT-02 | All Pi slash commands (`/model`, `/help`, `/plan`, `/handoff`, custom skills and agents) work through `@pi` chat — Pi engine handles them, VS Code extension passes through | See Sections: Slash Command Passthrough Pattern, API Limitation on Autocomplete, Code Example 2 (Slash Command Passthrough) |
| CHAT-03 | Pi responses stream progressively in chat (token-by-token markdown) via `stream.markdown()` | See Sections: Streaming Architecture Pattern, Code Example 1 (Progressive Streaming Handler), Verification — Progressive Rendering in RpcClient |
| CHAT-05 | Terminal TUI remains operational as a parallel review path — chat features must not break the existing terminal workflow | See Sections: Terminal TUI Coexistence, Common Pitfall 2 (DO NOT modify file-based IPC), Verification Instructions |
</phase_requirements>

## Summary

Phase 2 transforms the batch-mode `@pi` chat (Phase 1) into a rich streaming experience. The core architectural change is replacing `RpcClient.promptAndWait()` (which collects all events before returning) with `RpcClient.prompt()` + `RpcClient.onEvent()` (which streams events progressively). Each AgentEvent is mapped to a `ChatResponseStream` action as it arrives, giving users token-by-token markdown visibility into Pi's responses.

Three major subsystems are introduced:

1. **Progressive streaming handler** — A per-event processing loop that subscribes to `onEvent()`, maps each `AgentEvent` through `mapAgentEventToAction()`, applies it to `stream.markdown()`, and handles mid-stream interruption via `CancellationToken`. This is the central change for CHAT-03.

2. **Slash command passthrough** — No command parsing in the extension. The user's prompt (including `/model`, `/help` etc.) is sent as-is to Pi via `RpcClient.prompt()`. A critical finding: **VS Code Chat API 1.82 does NOT provide a mechanism for third-party chat participants to register slash commands for autocomplete** — the `ChatCommand` type is referenced in JSDoc but is not a concrete API. The `ChatRequest.command` field (`string | undefined`) may be populated by VS Code for built-in commands but cannot be registered by extensions. D-08/D-09 (dynamic autocomplete) is NOT achievable with the current API. The planner must adapt the approach: either accept a simpler auto-trigger mechanism or use an indirect approach.

3. **RPC UI request handler** — A new factory module that listens for `RpcExtensionUIRequest` events from the Pi RPC stream and translates them to VS Code native UI dialogs (`showQuickPick`, `showInputBox`, `showInformationMessage`). This establishes the infrastructure Phase 3 builds on for review controls.

**Primary recommendation:** Adopt progressive streaming via `prompt()` + `onEvent()` + `waitForIdle()` in `chat-handler.ts`. Add `getCommands()` and `followUp()` to the `PiProcessManager` interface. Create a new `rpc-ui-handler.ts` factory for extension UI requests. For slash command autocomplete, accept the API limitation and use a practical fallback (see Code Example 3).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Content streaming (CHAT-03) | Frontend Server (chat-handler) | — | `ChatRequestHandler` runs in VS Code extension host; it calls `RpcClient.prompt()` then feeds events to `ChatResponseStream` |
| Slash command rendering | Client (VS Code Chat panel) | — | The chat panel renders user input and response; autocomplete is controlled by VS Code, not the extension |
| Slash command passthrough (CHAT-02) | Frontend Server (chat-handler) | — | Handler sends `request.prompt` as-is to Pi via `RpcClient.prompt()`; no server-side interpretation |
| Tool visibility (verbose/quiet) | Frontend Server (event-mapper) | — | Event mapper renders tool events; the setting controls whether verbose HTML or quiet markdown is emitted |
| Mid-response interruption | Frontend Server (chat-handler) | — | Handler monitors `CancellationToken` and calls `RpcClient.abort()` or `RpcClient.followUp()` depending on setting |
| RPC UI requests (D-11) | Frontend Server (rpc-ui-handler) | Client (VS Code dialogs) | Handler calls VS Code native APIs (`showQuickPick`, etc.) which render in the VS Code window |
| Terminal TUI fallback (CHAT-05) | Client (terminal) | — | File-based IPC via `.pi/review-requests/` is preserved; Pi's native TUI selector remains the fallback path |

## Standard Stack

### Core

No new libraries needed. All implementation uses existing dependencies:

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@types/vscode` | ^1.82.0 | VS Code Chat API types (`ChatResponseStream`, `ChatRequest`, `CancellationToken`, `window.showQuickPick`, etc.) | Required — extension API surface |
| `@earendil-works/pi-coding-agent` | ^0.74.0 | `RpcClient.prompt()`, `onEvent()`, `abort()`, `followUp()`, `getCommands()`, `waitForIdle()` | Pi SDK — all Pi interaction goes through RpcClient |
| `@earendil-works/pi-agent-core` | (bundled) | `AgentEvent` types for streaming event handling | Type-only — imported for `mapAgentEventToAction` |
| `vitest` | ^4.1.8 | Test runner for pure function tests | Established in Phase 1 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `RpcClient.onEvent()` for streaming | `RpcClient.promptAndWait()` (Phase 1 batch mode) | `promptAndWait()` collects all events and returns an array — no progressive rendering. `onEvent()` is the only path to token-by-token streaming. |
| VS Code native UI (`showQuickPick`, `showInputBox`) | Custom Webview panel | Custom webview breaks VS Code theming, accessibility, and keyboard navigation. Native APIs are the correct approach per D-11 and the project out-of-scope list. |
| HTML `<details>`/`<summary>` for collapsible sections | `stream.button()` with state toggling | `<details>`/`<summary>` gives native HTML collapse behavior with zero code. `stream.button()` requires command registration and state management. Both are viable if `<details>` works. |

## Package Legitimacy Audit

> No new external packages are installed in Phase 2. All dependencies are already established in Phase 1 and the project root. The only package in `vscode-ext/package.json` devDependencies is `vitest` (already added in Phase 1).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@types/vscode` ^1.82.0 | npm | 3+ years | 30M+/wk | `github.com/microsoft/vscode` | OK | Approved — already in use |
| `@earendil-works/pi-coding-agent` ^0.74.0 | npm | ~1 year | via npm | `github.com/earendil-works/pi-coding-agent` | OK | Approved — already in use |
| `vitest` ^4.1.8 | npm | 4+ years | 10M+/wk | `github.com/vitest-dev/vitest` | OK | Approved — already in use |

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious SUS:** none

## Architecture Patterns

### System Architecture Diagram

```
User types @pi <message> in VS Code Chat panel
         |
         v
  ChatRequestHandler (chat-handler.ts)
         |
    +--------+---------+
    |        |          |
    v        v          v
prompt()  onEvent()  CancellationToken
    |        |          |
    v        v          v
RpcClient.send()  AgentEvent stream  User cancels/sends new msg
    |        |               |
    v        v               v
Pi agent  mapAgentEventToAction()  RpcClient.abort() or
process   (event-mapper.ts)        RpcClient.followUp()
    |        |               (depending on setting)
    |        v
    |   applyStreamAction()
    |        |
    |        v
    |   ChatResponseStream
    |   (progressive markdown)
    |
    +--- RpcExtensionUIRequest events
              |
              v
         rpc-ui-handler.ts
              |
              v
         window.showQuickPick()   (select)
         window.showInputBox()     (input)
         window.showInformationMessage()  (notify)
```

Two parallel paths coexist:
- **VS Code path (new for Phase 2):** Events streamed to `ChatResponseStream` + native UI dialogs
- **Terminal TUI path (unchanged):** File-based IPC through `.pi/review-requests/` continues working

### Recommended Project Structure

Phase 2 adds or modifies these files within the existing structure:

```
vscode-ext/src/
├── chat-handler.ts          # MODIFIED: progressive streaming replaces batch mode
├── event-mapper.ts          # MODIFIED: tool_execution_start fix + verbose/quiet support
├── pi-process-manager.ts    # MODIFIED: add getCommands(), followUp() to interface
├── extension.ts             # MODIFIED: add settings, RPC UI handler registration
├── rpc-ui-handler.ts        # ADDED: factory for handling RpcExtensionUIRequest events
├── review-coordinator.ts    # UNCHANGED
├── utils.ts                 # UNCHANGED (may add getCommands() wrapper if needed)
├── types.ts                 # UNCHANGED (re-exports from shared/)
└── shared/
    └── types.ts             # UNCHANGED (may extend with RPC UI types if needed)
vscode-ext/package.json      # MODIFIED: add contributes.configuration
```

### Pattern 1: Progressive Streaming Handler

**What:** Replace batch-mode `promptAndWait()` with per-event streaming via `onEvent()`.

**When to use:** For the chat handler's request handler function. This is the central architectural change for CHAT-03.

**Example:**

```typescript
// chat-handler.ts — progressive streaming pattern
export function createChatHandler(processManager: PiProcessManager): vscode.ChatRequestHandler {
  return async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> => {
    // Restart Pi for new sessions (same as Phase 1)
    if (context.history.length === 0) {
      await processManager.restart().catch(() => {});
    }

    try {
      // Lazy start
      const initialState = await processManager.getState().catch(() => ({ sessionId: null }));
      if (!initialState.sessionId) {
        stream.progress('Starting Pi...');
      }
      await processManager.start();

      stream.progress('Pi is working...');

      // KEY CHANGE FOR PHASE 2: Subscribe to events before sending prompt
      // so we don't miss events that arrive between prompt() and onEvent() setup
      // (RpcClient buffers events; onEvent() gets all future events)
      const unsubscribe = processManager.onEvent((event: AgentEvent) => {
        const action = mapAgentEventToAction(event, settings.toolVisibility);
        applyStreamAction(stream, action);
      });

      try {
        // Send prompt — returns immediately (non-blocking)
        // The prompt is sent as-is — including slash commands like /model, /help
        // Pi handles interpretation natively (D-07)
        await processManager.prompt(request.prompt);

        // Wait for completion, race against cancellation
        await Promise.race([
          processManager.waitForIdle(),
          new Promise<void>((_, reject) => {
            token.onCancellationRequested(() => {
              reject(new CancellationError());
            });
          }),
        ]);
      } catch (err) {
        if (err instanceof CancellationError) {
          // Handle interruption (D-04/D-05)
          // The cancellation token has already been cancelled by VS Code
          // This means user sent a new message — decide behavior
          // Note: actual abort/followUp logic is wired in extension.ts
          // See Code Example 4 for the full pattern
          return {};
        }
        throw err; // Re-throw non-cancellation errors for outer handler
      } finally {
        unsubscribe();
      }

      return {};
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      stream.markdown(
        '**Pi process exited unexpectedly.**\n\n```\n' + errorMsg + '\n```\n\n' +
        'Send another message to restart.'
      );
      return {};
    }
  };
}
```

### Pattern 2: Slash Command Passthrough

**What:** The extension does NOT interpret slash commands. The user's prompt (including `/model`, `/help`, etc.) is sent as-is to Pi. Pi's engine handles all command parsing.

**When to use:** Always — this is the fundamental design decision (D-07).

**Example:**

```typescript
// Inside chat-handler.ts — command passthrough
// request.prompt already excludes the "@pi" participant prefix
// If user typed "@pi /model", request.prompt is "/model"
// If user typed "@pi write a function", request.prompt is "write a function"

// The prompt field from ChatRequest already strips the participant name
// and any slash command prefix (if VS Code recognizes it)
// Just pass through verbatim:
await processManager.prompt(request.prompt);
```

**Critical finding:** `ChatRequest.command` (string | undefined) reports the command name if VS Code recognized it. But since third-party participants CANNOT register slash commands in API 1.82, `command` will always be `undefined` for Pi commands. The user's prompt text (e.g., `/model claude-sonnet-4-20250514`) appears in `request.prompt` with the `/` prefix intact.

### Pattern 3: Slash Command Autocomplete (Limited API Support)

**What:** VS Code Chat API 1.82 does NOT provide a `ChatParticipant.slashCommands` property or any mechanism to register slash commands for autocomplete. The `ChatCommand` type referenced in JSDoc is not a concrete API in `@types/vscode` 1.120.0 (which covers VS Code 1.120, March 2026).

**Recommended fallback approach:**

Since the API doesn't support dynamic slash command registration, two options exist:

**Option A (Recommended): "No autocomplete, pure passthrough"** — Remove the autocomplete requirement. Users type `/commands` manually. The handler sends `request.prompt` (which includes `/command`) as-is to Pi. Pi interprets it. This is simple and reliable. D-08/D-09/D-10 are documented as API-limited.

**Option B (Workaround): "Use button-based discovery"** — Add a `@pi /help` suggestion button or followup that shows available commands. When the user clicks it, Pi returns the command list in chat. This provides discoverability without API access to the autocomplete system.

```typescript
// Option A: Pure passthrough — no autocomplete needed
// In extension.ts or chat-handler.ts:
participant.followupProvider = {
  provideFollowups(result, _context, _token) {
    // Provide a /help followup button so users can discover commands
    return [
      { prompt: '/help', label: '$(question) Show available commands', kind: vscode.ChatFollowupKind.reply },
    ];
  },
};
```

**Note on D-09 performance (getCommands):** `RpcClient.getCommands()` is a local RPC call over stdin/stdout JSON-line protocol. It sends a JSON command and waits for a JSON response — expected to complete in <5ms. The concern in D-09 (fetching on every keystroke) is moot since autocomplete isn't API-available, but the method remains useful for internal command list retrieval (e.g., for the `/help` followup button).

### Anti-Patterns to Avoid

- **Parsing slash commands in the extension:** The extension must NOT attempt to interpret `/model`, `/help`, etc. Send the prompt as-is. Pi handles all command logic. Parsing creates a coupling that breaks when Pi adds/changes commands.
- **Caching command list:** The user decided commands are fetched fresh each time (D-09). Even though autocomplete isn't available, if you cache `getCommands()`, stale results won't reflect newly installed extensions/skills.
- **Blocking the event stream for UI dialogs:** When `showQuickPick()` is called in response to an `RpcExtensionUIRequest`, the dialog blocks until the user responds. The event stream from RpcClient continues to accumulate events in the buffer. The implementation must NOT block event processing — either process events in parallel (unlikely needed since dialog pauses the agent) or use `waitForIdle()` only after dialog resolves.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collapsible sections in chat | Custom expand/collapse with `stream.button()` state machine | HTML `<details>`/`<summary>` with `MarkdownString.supportHtml = true` | VS Code markdown renderer allows `<details>` and `<summary>` via DOMPurify sanitizer. Native HTML collapse behavior with zero code. |
| Extension UI dialogs (select, confirm, input, notify) | Custom webview or markdown-based input collection | `window.showQuickPick()`, `window.showInputBox()`, `window.showInformationMessage()` | VS Code native APIs respect theme, accessibility, and keyboard navigation. Per D-11 and the project's out-of-scope list. |
| Markdown rendering | Custom markdown-to-HTML transformation | `stream.markdown()` with `MarkdownString` | VS Code's renderer handles progressive markdown, theme-aware styling, command links, file tree anchors. |

**Key insight:** Phase 2 has zero "hand-roll a library" risks. All capabilities use VS Code native APIs, Pi SDK methods, or standard HTML-in-markdown. The only non-trivial engineering is orchestrating the event streaming lifecycle correctly.

## Common Pitfalls

### Pitfall 1: Event Missed Between `prompt()` and `onEvent()` Subscription

**What goes wrong:** If you call `prompt()` then set up `onEvent()`, events that arrive between those two calls are dropped. The chat shows a partial or empty response.

**Why it happens:** `prompt()` returns immediately after sending the message, but the Pi agent may emit `agent_start` or `message_update` events within microseconds. The `onEvent()` subscription hasn't been established yet.

**How to avoid:** Subscribe to `onEvent()` BEFORE calling `prompt()`. The Pi SDK's `RpcClient` subscribes listeners internally before sending; calling `client.onEvent()` before `client.prompt()` guarantees all events are captured.

```typescript
// CORRECT:
const unsubscribe = processManager.onEvent(handler);
await processManager.prompt(message);

// WRONG — events may be lost:
await processManager.prompt(message);
const unsubscribe = processManager.onEvent(handler);
```

**Warning signs:** First few tokens of Pi responses are consistently missing from the chat. The first `agent_start` progress indicator never appears.

### Pitfall 2: DO NOT Modify File-Based IPC

**What goes wrong:** Phase 2 introduces new RPC communication channels. If the implementation modifies the `.pi/review-requests/` or `.pi/review-results/` protocol, terminal TUI review breaks silently.

**Why it happens:** Chat responses and review responses are separate concerns. Chat goes through VS Code Chat API. Reviews go through `.pi/` JSON files. The RPC UI request protocol (extension_ui_request/response) is also separate — it uses the RPC stdin/stdout JSON-line channel, NOT the file-based IPC.

**How to avoid:** Establish a clear separation:
- Chat content: VS Code Chat API only (`ChatResponseStream.markdown()`)
- Review requests/results: `.pi/review-requests/` and `.pi/review-results/` JSON files only (unchanged)
- Extension UI requests: RPC stdin/stdout JSON-line protocol only (new in Phase 2)
- Never mix these channels

**Warning signs:** Terminal TUI stops showing review prompts after chat is used. Results written to `.pi/review-results/` are no longer consumed correctly.

### Pitfall 3: HTML `<details>` Tags Split Across Streaming Chunks

**What goes wrong:** If `<details><summary>Tool: bash</summary>...content...</details>` is split across multiple `stream.markdown()` calls, VS Code's progressive renderer renders malformed HTML — the details block may not render at all, or content may be visible without the collapse control.

**Why it happens:** `stream.markdown()` renders each chunk independently. If an opening `<details>` tag lands in chunk N and `</details>` in chunk N+1, the renderer sees two incomplete HTML fragments.

**How to avoid:** Send each collapsible tool section as a SINGLE `stream.markdown()` call. Buffer tool execution events until the tool completes (`tool_execution_end`), then emit the complete `<details>` block at once.

```typescript
// CORRECT: Buffer tool events, emit complete block at tool_execution_end
// Use a StreamAction variant like { type: 'toolSection', toolName, content, status }

// WRONG: Stream tool events as they arrive
// <details>...</ from tool_execution_start
// partial result text from tool_execution_update
// </details> from tool_execution_end
```

**Warning signs:** Tool execution sections appear as broken HTML, or the expand/collapse arrow doesn't render. Content is shown without the collapse wrapper.

### Pitfall 4: CancellationToken Not Wired to RpcClient Abort

**What goes wrong:** User sends a new message while Pi is still streaming. The old handler continues running because the CancellationToken fires but nothing calls `RpcClient.abort()`. Pi processes both streams simultaneously, and the old response keeps appearing in the chat.

**Why it happens:** VS Code's `CancellationToken` signals cancellation but does NOT automatically abort Pi's RPC stream. The handler must explicitly call `processManager.abort()` when cancellation fires.

**How to avoid:** Race `processManager.waitForIdle()` against a Promise that rejects on token cancellation. In the cancellation handler, call `processManager.abort()` (for "abort" mode) or `processManager.followUp()` (for "followUp" mode).

```typescript
token.onCancellationRequested(async () => {
  if (interruptionBehavior === 'abort') {
    await processManager.abort();
  } else {
    // followUp mode: queue the user's next message
    // (VS Code will create a new handler invocation with the new prompt)
    // The followUp is called on the OLD RPC client before it terminates
  }
});
```

**Warning signs:** Stale responses appearing in chat after user sends a new message. Pi agent shows signs of processing two prompts simultaneously.

## Code Examples

### Code Example 1: Progressive Streaming Handler (chat-handler.ts)

```typescript
// Source: Context7 query of @earendil-works/pi-coding-agent RpcClient API
// + VS Code @types/vscode 1.82 ChatResponseStream API
// Purpose: Replace batch-mode promptAndWait with progressive streaming

import * as vscode from 'vscode';
import type { PiProcessManager } from './pi-process-manager';
import { mapAgentEventToAction, applyStreamAction } from './event-mapper';
import type { AgentEvent } from '@earendil-works/pi-agent-core';

class CancellationError extends Error {
  constructor() { super('Chat request cancelled by user'); this.name = 'CancellationError'; }
}

export type ToolVisibility = 'verbose' | 'quiet';
export type InterruptionBehavior = 'abort' | 'followUp';

export function createChatHandler(
  processManager: PiProcessManager,
  settings: { toolVisibility: ToolVisibility; interruptionBehavior: InterruptionBehavior }
): vscode.ChatRequestHandler {
  return async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> => {
    if (context.history.length === 0) {
      await processManager.restart().catch(() => {});
    }

    try {
      const initialState = await processManager.getState().catch(() => ({ sessionId: null }));
      if (!initialState.sessionId) {
        stream.progress('Starting Pi...');
      }
      await processManager.start();
      stream.progress('Pi is working...');

      // Subscribe BEFORE prompt() to avoid missed events (Pitfall 1)
      const unsubscribe = processManager.onEvent((event: AgentEvent) => {
        const action = mapAgentEventToAction(event, settings.toolVisibility);
        applyStreamAction(stream, action);
      });

      try {
        // Send prompt — returns immediately, events arrive via onEvent()
        await processManager.prompt(request.prompt);

        // Race completion against cancellation
        // Use AbortController for clean cancellation (Pitfall 4)
        const abortController = new AbortController();
        token.onCancellationRequested(() => {
          abortController.abort();
        });

        await Promise.race([
          processManager.waitForIdle(),
          new Promise<void>((_, reject) => {
            abortController.signal.addEventListener('abort', () => {
              reject(new CancellationError());
            });
          }),
        ]);
      } catch (err) {
        if (err instanceof CancellationError) {
          // User interrupted — handle per setting
          if (settings.interruptionBehavior === 'abort') {
            await processManager.abort();
          }
          // followUp mode: do nothing — the next prompt is already queued
          return {};
        }
        throw err;
      } finally {
        unsubscribe();
      }

      return {};
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      stream.markdown(
        '**Pi process exited unexpectedly.**\n\n```\n' + errorMsg + '\n```\n\n' +
        'Send another message to restart.'
      );
      return {};
    }
  };
}
```

### Code Example 2: Tool Visibility with Collapsible Sections (event-mapper.ts additions)

```typescript
// Source: Verification — VS Code markdown renderer allows <details>/<summary> via DOMPurify
// Source: MarkdownString.supportHtml = true enables raw HTML rendering
// Purpose: Render tool execution as collapsible sections (D-02, D-03)

import { MarkdownString } from 'vscode';
import type { AgentEvent } from '@earendil-works/pi-agent-core';
import type { ChatResponseStream } from 'vscode';
import type { ToolVisibility } from './chat-handler';

// Additional StreamAction types for Phase 2
export type StreamAction =
  | { type: 'progress'; value: string }
  | { type: 'markdown'; value: string | MarkdownString }
  | { type: 'toolSection'; toolName: string; content: string; isError: boolean }
  | { type: 'done' }
  | { type: 'error'; value: string };

// Module-level buffer: accumulate tool execution events until end
let toolBuffer: { toolName: string; args: string; partialResults: string[]; isError: boolean } | null = null;

export function mapAgentEventToAction(
  event: AgentEvent,
  toolVisibility: ToolVisibility = 'verbose'
): StreamAction {
  switch (event.type) {
    case 'agent_start':
      return { type: 'progress', value: 'Pi is working...' };

    case 'turn_start':
      return { type: 'markdown', value: '---' };

    case 'message_update': {
      const msg = event.assistantMessageEvent;
      if (msg.type === 'text_delta') {
        return { type: 'markdown', value: msg.delta };
      }
      return { type: 'markdown', value: '' };
    }

    case 'tool_execution_start':
      if (toolVisibility === 'quiet') {
        return { type: 'markdown', value: '' }; // Silent in quiet mode
      }
      // Buffer start — don't emit anything yet, wait for complete tool result
      toolBuffer = {
        toolName: event.toolName,
        args: JSON.stringify(event.args ?? {}),
        partialResults: [],
        isError: false,
      };
      // Show progress indicator immediately
      return { type: 'progress', value: `Tool: ${event.toolName}` };

    case 'tool_execution_update':
      if (toolVisibility === 'quiet' || !toolBuffer) {
        return { type: 'markdown', value: '' };
      }
      // Accumulate partial results
      if (typeof event.partialResult === 'string') {
        toolBuffer.partialResults.push(event.partialResult);
      }
      return { type: 'markdown', value: '' }; // No per-update output

    case 'tool_execution_end':
      if (toolVisibility === 'quiet' || !toolBuffer) {
        toolBuffer = null;
        return { type: 'markdown', value: '' };
      }
      toolBuffer.isError = event.isError;
      // Emit complete collapsible section as a single MarkdownString
      const md = buildToolSection(toolBuffer);
      toolBuffer = null;
      return { type: 'markdown', value: md }; // value is MarkdownString here

    case 'message_end':
      return { type: 'markdown', value: '' };

    case 'agent_end':
      return { type: 'done' };

    default:
      return { type: 'markdown', value: '' };
  }
}

function buildToolSection(buf: {
  toolName: string;
  args: string;
  partialResults: string[];
  isError: boolean;
}): MarkdownString {
  const status = buf.isError ? '$⚠️ Failed' : '$✅ Completed';
  const resultContent = buf.partialResults.join('\n') || '(no output)';
  const html = `<details>
<summary><strong>Tool: ${escapeHtml(buf.toolName)}</strong> — ${status}</summary>

\`\`\`
${escapeHtml(resultContent)}
\`\`\`

</details>`;

  const ms = new MarkdownString(html);
  ms.supportHtml = true;  // Critical — enables raw HTML rendering
  ms.isTrusted = true;     // Allow command: links if needed later
  return ms;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

### Code Example 3: RPC UI Request Handler (rpc-ui-handler.ts)

```typescript
// Source: Pi SDK docs/rpc.md Extension UI Protocol section
// Source: @types/vscode 1.82 — window.showQuickPick, showInputBox, showInformationMessage
// Purpose: Handle Pi extension UI requests via VS Code native dialogs (D-11, D-12)

import * as vscode from 'vscode';

// Subset of RpcExtensionUIRequest type from Pi SDK
// (the full type is in @earendil-works/pi-coding-agent/dist/modes/rpc/rpc-types.d.ts)
export interface RpcExtensionUIRequest {
  type: 'extension_ui_request';
  id: string;
  method: string;
  title?: string;
  options?: string[];
  message?: string;
  placeholder?: string;
  prefill?: string;
  notifyType?: 'info' | 'warning' | 'error';
  timeout?: number;
}

export interface ExtensionUIResponse {
  type: 'extension_ui_response';
  id: string;
  value?: string;
  confirmed?: boolean;
  cancelled?: true;
}

export interface RpcUiHandler {
  sendResponse(response: ExtensionUIResponse): void;
}

export function createRpcUiHandler(
  sendResponse: (response: ExtensionUIResponse) => void
): (request: RpcExtensionUIRequest) => void {
  return async (request: RpcExtensionUIRequest) => {
    const { id, method } = request;

    switch (method) {
      case 'select': {
        const selected = await vscode.window.showQuickPick(
          request.options ?? [],
          {
            title: request.title,
            placeHolder: 'Select an option',
            ignoreFocusOut: true,
          }
        );
        if (selected) {
          sendResponse({ type: 'extension_ui_response', id, value: selected });
        } else {
          sendResponse({ type: 'extension_ui_response', id, cancelled: true });
        }
        break;
      }

      case 'confirm': {
        const result = await vscode.window.showInformationMessage(
          `${request.title}: ${request.message ?? ''}`,
          { modal: true },
          'Yes',
          'No'
        );
        sendResponse({
          type: 'extension_ui_response',
          id,
          confirmed: result === 'Yes',
        });
        break;
      }

      case 'input': {
        const input = await vscode.window.showInputBox({
          title: request.title,
          placeHolder: request.placeholder,
          ignoreFocusOut: true,
        });
        if (input !== undefined) {
          sendResponse({ type: 'extension_ui_response', id, value: input });
        } else {
          sendResponse({ type: 'extension_ui_response', id, cancelled: true });
        }
        break;
      }

      case 'notify': {
        const message = request.message ?? '';
        switch (request.notifyType) {
          case 'error':
            vscode.window.showErrorMessage(message);
            break;
          case 'warning':
            vscode.window.showWarningMessage(message);
            break;
          default:
            vscode.window.showInformationMessage(message);
        }
        // Fire-and-forget: no response expected
        break;
      }

      case 'editor': {
        // Use showInputBox for simple editor (full editor dialog is complex)
        // Phase 3 may add a proper multi-line editor
        const input = await vscode.window.showInputBox({
          title: request.title,
          value: request.prefill,
          ignoreFocusOut: true,
        });
        if (input !== undefined) {
          sendResponse({ type: 'extension_ui_response', id, value: input });
        } else {
          sendResponse({ type: 'extension_ui_response', id, cancelled: true });
        }
        break;
      }

      default:
        // Unknown method — log and ignore
        console.warn(`Unknown extension UI request method: ${method}`);
    }
  };
}
```

### Code Example 4: Wiring RPC UI Handler in extension.ts

```typescript
// Source: Integrates RPC UI handler with PiProcessManager event stream
// Purpose: Establish the RPC UI request pipeline (D-12)

// In extension.ts deferred init block, after processManager.start():

const sendRpcResponse = (response: ExtensionUIResponse) => {
  // The PiProcessManager wraps RpcClient which handles stdin communication
  // This requires access to the underlying RpcClient's send() method
  // Approach: Add a sendRpcMessage() method to PiProcessManager interface
  processManager.sendRpcMessage(response);
};

const handleUiRequest = createRpcUiHandler(sendRpcResponse);

// Pi extension UI requests arrive as separate JSON-Line messages,
// NOT as AgentEvents. They need a dedicated listener.
// The RpcClient internally handles extension_ui_request events
// via a separate mechanism. Implementation detail:
// Either subscribe to a 'ui_request' event on PiProcessManager,
// or the RpcClient emits these as distinct events alongside AgentEvents.
//
// ACTUAL IMPLEMENTATION: RpcClient.onEvent() callback receives ALL
// parsed JSON lines including extension_ui_request. The listener
// must check event.type:
processManager.onEvent((event: any) => {
  if (event?.type === 'extension_ui_request') {
    handleUiRequest(event as RpcExtensionUIRequest);
    return; // Don't process as AgentEvent
  }
  // Process as AgentEvent:
  const action = mapAgentEventToAction(event, settings.toolVisibility);
  applyStreamAction(stream, action);
});
```

[ASSUMED: The precise mechanism for intercepting `extension_ui_request` events from the RPC stream needs verification against the actual Pi SDK `RpcClient` implementation. The RpcClient's `onEvent()` callback may or may not pass through non-AgentEvent JSON lines. Reference: `node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.js` — the planner should verify whether the `handleLine` private method emits ALL JSON lines to listeners or only AgentEvent-typed ones.]

## State of the Art

| Old Approach (Phase 1) | Current Approach (Phase 2) | When Changed | Impact |
|------------------------|---------------------------|--------------|--------|
| `promptAndWait()` — batch event collection | `prompt()` + `onEvent()` — progressive streaming | Phase 2 | Token-by-token rendering vs. single block delivery |
| Single `streamEvents(events[], stream)` call | Per-event `mapAgentEventToAction` / `applyStreamAction` | Phase 2 | Progressive markdown rendering, cancellable mid-stream |
| No tool visibility | Verbose (collapsible `<details>`) / Quiet modes | Phase 2 | User configurable tool execution display |
| No interruption handling | `CancellationToken` -> `abort()` or `followUp()` | Phase 2 | Mid-response new message handled cleanly |
| No slash command support | Passthrough model — Pi interprets all commands | Phase 2 | Pi maintains command authority |
| No RPC UI request handling | `showQuickPick()` / `showInputBox()` for Pi extension UI | Phase 2 | Blocking dialogs for Pi extension interactions |

**Deprecated/outdated:**
- `promptAndWait()`: Still available on `RpcClient` but no longer used by chat-handler. The batch pattern is replaced by progressive streaming. May still be used for internal/sync operations.
- `tool_execution_start` mapping "error executing ...": The old placeholder mapping (event-mapper.ts line 35) must be replaced with proper tool visibility rendering.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pi SDK `RpcClient.onEvent()` forwards ALL JSON lines from stdout, including `extension_ui_request` events, to registered listeners | RPC UI Handler | Medium — If `onEvent()` only forwards `AgentEvent`-typed lines, a separate RPC line reader is needed for extension UI requests. Planner must verify against actual `RpcClient` implementation. |
| A2 | `RpcClient.prompt()` with `/`-prefixed text works identically to typing the command in the Pi terminal | Slash Command Passthrough | Low — The RPC protocol docs state: "If the message is an extension command (e.g., `/mycommand`), it executes immediately even during streaming" and "Skill commands and prompt templates are expanded before sending/queueing." |
| A3 | `CancellationToken.onCancellationRequested` fires when the user sends a new message while a previous `@pi` request is still streaming | Interruption | Medium — If VS Code only fires cancellation on explicit abort (not on new message), the `followUp` behavior may not trigger as expected. Planner should test this interaction. |
| A4 | HTML `<details>`/`<summary>` tags render correctly in VS Code Chat's webview-based markdown renderer when `MarkdownString.supportHtml = true` | Collapsible Tool Sections | Low — Tags are confirmed in VS Code's allowed list (PR 156216). The renderer uses DOMPurify with these tags allowed. |
| A5 | There is no VS Code Chat API for third-party participants to register slash commands with autocomplete | Slash Command Autocomplete | LOW (by design) — Confirmed by examining `@types/vscode` 1.120.0 which lacks `ChatCommand` interface and `ChatParticipant.slashCommands` property. API version 1.82 is the floor. |

## Open Questions

1. **Does `RpcClient.onEvent()` forward `extension_ui_request` events alongside `AgentEvent`?**
   - **What we know:** The Pi RPC protocol (docs/rpc.md) shows that extension_ui_request events are JSON lines on stdout, same channel as agent events. The `RpcClient` class has a `handleLine` private method that parses JSON lines.
   - **What's unclear:** Whether `handleLine` filters events before notifying listeners or passes everything through. The `RpcClient` implementation in the `.js` file needs inspection.
   - **Recommendation:** Planner must read `node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.js` to verify. If `onEvent()` only passes AgentEvent types, add a second listener mechanism for raw JSON lines.

2. **What is the exact behavior of VS Code `CancellationToken` on new chat message?**
   - **What we know:** `CancellationToken.onCancellationRequested` fires when the user aborts the request or when the extension host decides the request is no longer valid.
   - **What's unclear:** Does sending a new `@pi` message while one is still in progress fire cancellation on the previous handler's token? Or does the previous handler run to completion with both responses appearing?
   - **Recommendation:** This must be tested in VS Code Extension Host debug mode. The pattern in Code Example 1 assumes cancellation fires. If it doesn't, the interruption behavior (D-04/D-05) needs redesign.

3. **Does `RpcClient.followUp()` work correctly when the agent is already streaming?**
   - **What we know:** RPC protocol docs state `followUp` queues a message to be delivered when the agent finishes. The `streamingBehavior: "followUp"` field on the `prompt` command accomplishes this.
   - **What's unclear:** Whether `RpcClient.prompt()` with `streamingBehavior: "followUp"` is exposed in the typed API, or whether `RpcClient.followUp()` should be called separately.
   - **Recommendation:** Planner must verify the `RpcClient.prompt()` signature (rpc-client.d.ts line 63) — it takes `(message, images?)` and does NOT include a `streamingBehavior` option. `RpcClient.followUp()` (line 71) is a separate method. The interruption handler should call `processManager.followUp(message)` directly.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Pi RPC child process | yes | v24.15.0 | — |
| npm | Package management | yes | (bundled) | — |
| VS Code Extension Host | Chat API, native UI, streaming | yes | ^1.82.0+ | — |
| Pi CLI (`pi`) | Pi agent RPC child process | yes | (via `@earendil-works/pi-coding-agent`) | Error message shown in chat (D-07) |

**Missing dependencies with no fallback:** None — all dependencies are already established in Phase 1.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.8 |
| Config file | `vscode-ext/vitest.config.ts` (from Phase 1) |
| Quick run command | `cd vscode-ext && npx vitest run --changed` |
| Full suite command | `cd vscode-ext && npx vitest run --reporter verbose` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-02 | Slash command passthrough — prompt sent as-is without parsing | unit | `npx vitest run tests/chat-handler.test.ts` | ❌ Wave 0 |
| CHAT-03 | `mapAgentEventToAction` handles `text_delta` progressively | unit | `npx vitest run tests/event-mapper.test.ts` | ❌ Wave 0 (extend existing) |
| CHAT-03 | `StreamAction` correctly renders markdown fragments | unit | `npx vitest run tests/event-mapper.test.ts` | ❌ Wave 0 |
| CHAT-03 | Tool visibility: verbose mode emits `<details>` HTML, quiet mode silences | unit | `npx vitest run tests/event-mapper.test.ts` | ❌ Wave 0 |
| CHAT-05 | File-based IPC unchanged — `.pi/` protocol not modified | manual | `grep -r "\.pi/" vscode-ext/src/ -- exclude existing review-coordinator` | N/A |
| D-04/D-05 | Interruption: abort kills stream, followUp queues | unit mock | `npx vitest run tests/chat-handler.test.ts` | ❌ Wave 0 |
| D-11 | `RpcUiHandler` maps select/confirm/input/notify to correct VS Code API | unit | `npx vitest run tests/rpc-ui-handler.test.ts` | ❌ Wave 0 |
| D-07 | `request.prompt` sent verbatim to `processManager.prompt()` | unit | `npx vitest run tests/chat-handler.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd vscode-ext && npx vitest run --changed`
- **Per wave merge:** `cd vscode-ext && npx vitest run --reporter verbose`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `vscode-ext/tests/chat-handler.test.ts` — covers CHAT-02 passthrough, CHAT-03 progressive streaming, D-04/D-05 interruption
- [ ] `vscode-ext/tests/rpc-ui-handler.test.ts` — covers D-11 mapping of select/confirm/input/notify
- [ ] `vscode-ext/tests/event-mapper.test.ts` extension — add tests for tool visibility modes (verbose HTML output, quiet mode silence)

## Security Domain

No new security enforcement mechanisms are introduced in Phase 2. This phase relies entirely on:
- VS Code's existing `window.showQuickPick()` / `showInputBox()` dialog sandbox (user interaction required, no programmatic bypass)
- VS Code's DOMPurify-based markdown HTML sanitizer (when `supportHtml = true`, only allowed tags survive)
- Pi's own command authorization (the extension passes through commands without interpretation, but Pi's engine enforces its own security model)

State: `security_enforcement: implicit` — no new authentication, authorization, or input validation is added.

## Sources

### Primary (HIGH confidence)
- [VERIFIED: @types/vscode 1.120.0] — `ChatResponseStream`, `ChatRequest`, `ChatParticipant`, `CancellationToken`, `MarkdownString`, `window.showQuickPick`, etc. types verified from node_modules.
- [VERIFIED: Pi SDK node_modules] — `RpcClient.prompt()`, `onEvent()`, `abort()`, `followUp()`, `getCommands()`, `waitForIdle()` verified from rpc-client.d.ts.
- [VERIFIED: Pi SDK docs/rpc.md] — Complete RPC protocol documentation including extension UI request/response sub-protocol and event types.
- [VERIFIED: VS Code PR #156216] — Confirmed `<details>` and `<summary>` in allowed HTML tags list for DOMPurify sanitizer.

### Secondary (MEDIUM confidence)
- [CITED: code.visualstudio.com/api] — VS Code Chat Extension API documentation (general patterns, not version-specific).
- [CITED: Pi SDK examples/rpc-extension-ui.ts] — Complete example of handling extension UI requests in a custom TUI client.

### Tertiary (LOW confidence)
- [ASSUMED] A3 — CancellationToken behavior on new chat message (needs VS Code Extension Host testing).
- [ASSUMED] A1 — RpcClient.onEvent() forwarding of extension_ui_request events (needs RpcClient.js source inspection).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries are already installed and verified in Phase 1
- Architecture: HIGH — Streaming pattern, RPC UI handler pattern, and passthrough pattern are directly derived from confirmed API surfaces
- Pitfalls: HIGH — Event ordering, IPC separation, HTML splitting, and cancellation wiring are well-documented failure modes
- API limitation: HIGH — Confirmable by reading `@types/vscode` source
- CancellationToken behavior: MEDIUM — Precision of VS Code's cancellation timing needs empirical verification

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (stable — VS Code Chat API, Pi SDK RPC protocol, markdown renderer behavior are not fast-moving targets)
