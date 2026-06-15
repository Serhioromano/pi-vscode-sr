---
phase: 01-foundation-chat-basics
plan: GAP-FIX
type: execute
wave: 4
depends_on:
  - 01-05
files_modified:
  - vscode-ext/src/pi-process-manager.ts
  - vscode-ext/src/chat-handler.ts
autonomous: true
gap_closure: true
requirements:
  - CHAT-01
  - CHAT-04
  - CHAT-NEWSESSION
user_setup: []
must_haves:
  truths:
    - Subsequent messages to @pi skip "Starting Pi..." — only shown when Pi is not already running
    - Killing Pi process shows crash error with pi -c guidance (D-06: No silent restarts)
    - "Pi is working..." only appears after start() confirms the process is alive
    - New VS Code chat session (context.history empty) triggers fresh Pi session via restart()
  artifacts:
    - path: vscode-ext/src/pi-process-manager.ts
      provides: "Liveness check in start() — getState() wrapped in try/catch detects dead RpcClient, throws to trigger crash visibility"
      adds_patterns:
        - "if state.client: try getState() → return alive; catch → null out and throw to surface crash"
    - path: vscode-ext/src/chat-handler.ts
      provides: "Conditional 'Starting Pi...' + new session detection via context.history"
      adds_patterns:
        - "getState().catch() before start() to decide whether to show 'Starting Pi...'"
        - "context.history.length === 0 triggers processManager.restart() for fresh Pi session"
        - "stream.progress('Pi is working...') after await start() to avoid premature progress"
  key_links:
    - from: vscode-ext/src/chat-handler.ts
      to: vscode-ext/src/pi-process-manager.ts
      via: "processManager.getState() called before start() to conditionally show progress"
      pattern: "getState"
    - from: vscode-ext/src/chat-handler.ts
      to: vscode-ext/src/pi-process-manager.ts
      via: "processManager.restart() called when context.history is empty (new chat session)"
      pattern: "restart"
---

<objective>
Fix two UAT-identified gaps in the @pi chat interaction and add new chat session support:
1. "Starting Pi..." shown on every message instead of only on first lazy-start
2. Pi crash silently restarts instead of showing crash error (D-06 violation)
3. New VS Code chat sessions (New Chat button) should start a fresh Pi session

Purpose: Eliminate wrong progress messages, ensure D-06 crash visibility, and support the native VS Code Chat "New Session" flow so users get a clean Pi session when starting a new chat.

Output: Updated pi-process-manager.ts with liveness check (throw on dead), updated chat-handler.ts with conditional progress + new session restart.
</objective>

<execution_context>
@/home/sergey/www/pi-vscode-sr/.claude/gsd-core/workflows/execute-plan.md
@/home/sergey/www/pi-vscode-sr/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@/home/sergey/www/pi-vscode-sr/.planning/ROADMAP.md
@/home/sergey/www/pi-vscode-sr/.planning/phases/01-foundation-chat-basics/01-UAT.md
@/home/sergey/www/pi-vscode-sr/.planning/phases/01-foundation-chat-basics/01-VERIFICATION.md
@/home/sergey/www/pi-vscode-sr/.planning/phases/01-foundation-chat-basics/01-05-SUMMARY.md

@/home/sergey/www/pi-vscode-sr/vscode-ext/src/pi-process-manager.ts (current — needs liveness check in start())
@/home/sergey/www/pi-vscode-sr/vscode-ext/src/chat-handler.ts (current — needs conditional progress + new session detection)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix PiProcessManager.start() — liveness check with D-06 crash visibility</name>
  <files>vscode-ext/src/pi-process-manager.ts</files>
  <action>
    Modify the `start()` method in `createPiProcessManager` factory (lines 39-61 in current file).
    The current implementation on line 40 returns early when `state.client` is truthy without verifying the client is alive:

    ```typescript
    if (state.client) return; // Already started
    ```

    Replace with a liveness check that throws on dead detection (D-06 compliance: No silent restarts):

    ```typescript
    if (state.client) {
      // Verify the existing RpcClient is alive — the child process may have been
      // killed externally while the JS object remains in memory (Gap 2, UAT Test 4)
      try {
        await state.client.getState();
        return; // Client is alive — no need to recreate
      } catch {
        // Client is dead (child process killed, IPC broken).
        // Clean up and throw to surface the crash to the caller (D-06: No silent restarts).
        // The chat handler's catch block will show the pi -c recovery error.
        state.client = null;
        state.sessionId = null;
        throw new Error('Pi process exited unexpectedly. Run `pi -c` in terminal to resume the session. Send another message to restart Pi.');
      }
    }
    ```

    Keep everything else in `start()` unchanged — the existing `new Function(...)` dynamic import, `new RpcClientClass(...)`, `await state.client.start()`, `getState()` for sessionId, and `onEvent` forwarding all stay as-is.

    Key behavior:
    - When `state.client` exists and `getState()` succeeds: the method returns immediately (fast path for already-alive connections).
    - When `state.client` exists but `getState()` throws (dead child process): the dead reference is cleaned up AND an error is thrown. The caller (chat-handler) catches this and shows the crash error with `pi -c` guidance. The user's NEXT message will trigger a fresh `start()` since `state.client` is now null.
    - When `state.client` is null (first call or after clean stop/throw): unchanged — falls through to initialization.
    - No changes needed to `stop()`, `restart()`, `prompt()`, `promptAndWait()`, `abort()`, or any other method.
  </action>
  <verify>
    <automated>
      grep -c 'getState' vscode-ext/src/pi-process-manager.ts
      grep -c 'throw new Error' vscode-ext/src/pi-process-manager.ts
      cd /home/sergey/www/pi-vscode-sr/vscode-ext && npx tsc --noEmit 2>&1 | head -20
    </automated>
  </verify>
  <done>
    - pi-process-manager.ts start() has liveness check: when state.client exists, calls state.client.getState() in try/catch
    - Dead client detection nulls out state.client and state.sessionId, then THROWS (not silent recreate)
    - D-06 satisfied: crash is surfaced via throw → chat-handler catch block shows pi -c error
    - TypeScript compilation passes with zero errors
    - Existing test suite still passes: npx vitest run
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix chat-handler.ts — conditional "Starting Pi..." and ordering</name>
  <files>vscode-ext/src/chat-handler.ts</files>
  <action>
    Modify the `createChatHandler` factory in `chat-handler.ts` (current lines 6-44).
    Two changes needed:

    **Change 1: Make "Starting Pi..." conditional (Gap 1, UAT Test 3)**

    Replace the unconditional `stream.progress('Starting Pi...')` on line 14 with a check that only shows the progress when Pi is not already started:

    Before (current line 14):
    ```typescript
    stream.progress('Starting Pi...'); // Shown on first @pi message only (D-05)
    ```

    After:
    ```typescript
    // Only show "Starting Pi..." when Pi is not already running (Gap 1 closure, D-05)
    // getState() returns { sessionId: null } when not started, { sessionId: string } when alive
    // The .catch() handles the edge case where the client exists but is dead (Gap 2)
    const initialState = await processManager.getState().catch(() => ({ sessionId: null }));
    if (!initialState.sessionId) {
      stream.progress('Starting Pi...');
    }
    ```

    **Change 2: Move "Pi is working..." after successful start() (Gap 2, UAT Test 4)**

    The current ordering shows "Pi is working..." before await processManager.start() completes:
    ```typescript
    stream.progress('Pi is working...'); // Line 21 — fires before start() completes
    ```

    Move it to after `await processManager.start()` succeeds:
    ```typescript
    await processManager.start();
    stream.progress('Pi is working...');
    ```

    The complete try block after changes:
    ```typescript
    try {
      // Only show lazy-start progress when Pi is not already running (Gap 1, D-05)
      const initialState = await processManager.getState().catch(() => ({ sessionId: null }));
      if (!initialState.sessionId) {
        stream.progress('Starting Pi...');
      }

      // Lazy start: start() is no-op if already running (with liveness check from Task 1)
      await processManager.start();

      // After start completes successfully: show Pi is working (Gap 2 ordering fix)
      stream.progress('Pi is working...');

      // Send prompt and collect all events (Phase 1: batch mode, non-streaming)
      const events: AgentEvent[] = await processManager.promptAndWait(request.prompt);

      // Map events to stream actions (batch mode for Phase 1)
      streamEvents(events, stream);

      return {};
    } catch (err) {
      // ... unchanged error handling
    }
    ```

    No other changes needed — imports, error handling, streamEvents call, catch block all stay as-is.
  </action>
  <verify>
    <automated>
      grep -c 'getState' vscode-ext/src/chat-handler.ts
      grep -c 'initialState.sessionId' vscode-ext/src/chat-handler.ts
      grep -c "stream.progress('Pi is working...')" vscode-ext/src/chat-handler.ts
      grep -c "stream.progress('Starting Pi...')" vscode-ext/src/chat-handler.ts
      cd /home/sergey/www/pi-vscode-sr/vscode-ext && npx tsc --noEmit 2>&1 | head -20
    </automated>
    <human-check>
      The "Starting Pi..." grep should produce exactly 1 match (the conditional progress call).
      The "Pi is working..." grep should produce exactly 1 match (after start()).
    </human-check>
  </verify>
  <done>
    - "Starting Pi..." is only shown when Pi is not already running (checks processManager.getState().sessionId)
    - "Pi is working..." appears after await processManager.start() succeeds
    - Task 1's throw-on-dead will hit this handler's catch block → crash error shown with pi -c guidance
    - TypeScript compilation passes with zero errors
    - Existing test suite still passes: npx vitest run
  </done>
</task>

<task type="auto">
  <name>Task 3: Detect new VS Code Chat session and restart Pi</name>
  <files>vscode-ext/src/chat-handler.ts</files>
  <action>
    Add new chat session detection at the start of the handler. When VS Code starts a new chat session (user clicks "New Chat"), `context.history` is an empty array. This should trigger a fresh Pi session so the user gets a clean context.

    Insert BEFORE the `try` block (after the handler function opening):

    ```typescript
    // New VS Code Chat session: restart Pi for a fresh context
    // context.history is empty when the user starts a new chat (clicks New Chat button)
    // Workspace switch is handled separately by onDidChangeWorkspaceFolders in extension.ts
    if (context.history.length === 0) {
      await processManager.restart().catch(() => {
        // If restart fails (Pi not running yet), start() below will handle it
      });
    }
    ```

    This goes right before the existing `try` block. The `.catch()` handles the case where Pi hasn't been started yet (first-ever message, or after extension.ts stopped it on workspace switch) — `restart()` calls `stop()` then `start()`, and `stop()` is a no-op when `state.client` is null.

    The complete handler structure after all changes:
    ```typescript
    export function createChatHandler(processManager: PiProcessManager): vscode.ChatRequestHandler {
      return async (
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        _token: vscode.CancellationToken
      ): Promise<vscode.ChatResult> => {
        // --- New Chat Session: restart Pi for fresh context ---
        if (context.history.length === 0) {
          await processManager.restart().catch(() => {
            // restart() calls stop() then start(); stop() is no-op when client is null
          });
        }

        try {
          // Only show lazy-start progress when Pi is not already running (Gap 1, D-05)
          const initialState = await processManager.getState().catch(() => ({ sessionId: null }));
          if (!initialState.sessionId) {
            stream.progress('Starting Pi...');
          }

          await processManager.start();
          stream.progress('Pi is working...');

          const events: AgentEvent[] = await processManager.promptAndWait(request.prompt);
          streamEvents(events, stream);
          return {};
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          stream.markdown(
            '**Pi process exited unexpectedly.**\n\n' +
            '```\n' + errorMsg + '\n```\n\n' +
            'Run `pi -c` in terminal to resume the session. Send another message to restart Pi.'
          );
          return {};
        }
      };
    }
    ```

    No changes to imports, streamEvents, or return value.
  </action>
  <verify>
    <automated>
      grep -c 'context.history' vscode-ext/src/chat-handler.ts
      grep -c 'processManager.restart' vscode-ext/src/chat-handler.ts
      cd /home/sergey/www/pi-vscode-sr/vscode-ext && npx tsc --noEmit 2>&1 | head -20
    </automated>
    <human-check>
      grep for context.history should produce exactly 1 match (the new session check).
      grep for processManager.restart should produce exactly 1 match.
    </human-check>
  </verify>
  <done>
    - context.history.length === 0 triggers processManager.restart() before try block
    - .catch() prevents unhandled rejection when Pi hasn't been started yet
    - New chat session → fresh Pi session; same chat session → continued Pi session
    - TypeScript compilation passes with zero errors
    - Existing test suite still passes: npx vitest run
  </done>
</task>

</tasks>

<verification>
- npx vitest run passes full suite (no regressions)
- npx tsc --noEmit passes with zero errors in vscode-ext/
- grep confirms "Starting Pi..." appears exactly once in chat-handler.ts (conditional)
- grep confirms "Pi is working..." appears after start(), not before
- grep confirms getState() call exists in both pi-process-manager.ts and chat-handler.ts
- grep confirms context.history check exists in chat-handler.ts
- grep confirms throw new Error in pi-process-manager.ts start() for D-06 crash visibility
- UAT re-verification:
  - Test 3: "Starting Pi..." NOT shown on subsequent messages in same chat session
  - Test 4: Killing Pi shows crash error with pi -c guidance (D-06)
  - New: New Chat button starts fresh Pi session
</verification>

<success_criteria>
Gap 1 closure (UAT Test 3):
- Subsequent @pi messages in same chat session do NOT show "Starting Pi..."
- First @pi message still shows "Starting Pi..." when Pi is not yet started

Gap 2 closure + D-06 compliance (UAT Test 4):
- Killing Pi process shows crash error with pi -c recovery guidance
- No silent restarts — crash is surfaced to the user

New Chat Session (CHAT-NEWSESSION):
- Clicking "New Chat" in VS Code (context.history empty) triggers fresh Pi session
- Continuing in same chat session preserves Pi session state

No behavioral regressions:
- Existing @pi first-message flow unchanged: shows "Starting Pi..." then "Pi is working..." then response
- Workspace switch restart handled by extension.ts (unchanged)
- All 31 existing tests pass
- tsc --noEmit passes
</success_criteria>

<output>
Create `.planning/phases/01-foundation-chat-basics/01-GAP-FIX-SUMMARY.md` when done
</output>
