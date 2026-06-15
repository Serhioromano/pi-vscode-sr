---
phase: 02-rich-chat-experience
plan: 03
subsystem: chat
tags: [streaming, cancellation, handler, vs-code-chat, interruption]

# Dependency graph
requires:
  - phase: 01-foundation-chat-basics
    provides: chat-handler.ts, event-mapper.ts, pi-process-manager.ts
provides:
  - Progressive streaming chat handler with InterruptionBehavior type and ChatSettings interface
  - onEvent-before-prompt streaming pattern with agent_end completion detection
  - AbortController-based cancellation race with abort/followUp interruption behaviors
  - Prompt passthrough (D-07) — verbatim forwarding without parsing
affects:
  - 02-04 (extension.ts wiring will pass ChatSettings from VS Code configuration)
  - Phase 3 inline completions

# Tech tracking
tech-stack:
  added: []
  patterns:
    - onEvent subscription before prompt() call (Pitfall 1)
    - agent_end event detection via onEvent listener for completion
    - CancellationError class for distinguishing cancellation from process crashes
    - Two-level try/catch: inner for cancellation, outer for process crashes

key-files:
  created:
    - vscode-ext/tests/chat-handler.test.ts
  modified:
    - vscode-ext/src/chat-handler.ts

key-decisions:
  - "AbortController-based cancellation race with synchronous aborted-signal check (handles signals aborted before listener attachment)"
  - "followUp mode relies on VS Code handler re-invocation + Pi internal queue rather than calling RpcClient.followUp() directly"
  - "CancellationError is a private class (not exported) — cancellation is an internal implementation detail"

patterns-established:
  - "onEvent-before-prompt: Subscribe to Pi events before sending a prompt to guarantee no events are missed (Pitfall 1)"
  - "agent_end completion: Detect agent completion via event.type === 'agent_end' in the onEvent listener instead of waitForIdle()"
  - "Cancellation race: Use Promise.race between onComplete (agent_end) and rejectOnAbort (token cancellation) to handle both normal and interrupted flows"
  - "Crash isolation: Two-level try/catch separates user cancellation from process crashes, with different error UX for each"

requirements-completed: [CHAT-02, CHAT-03]

# Metrics
duration: 10min
completed: 2026-06-15
---

# Phase 2 Plan 3: Progressive Streaming Chat Handler Summary

**Replaced batch-mode promptAndWait() with progressive streaming using prompt() + onEvent() + agent_end completion detection. Added InterruptionBehavior type and ChatSettings interface. All 6 unit tests pass.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-06-15T10:50:00Z
- **Completed:** 2026-06-15T11:00:23Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Rewrote chat-handler.ts from batch-mode (promptAndWait + streamEvents) to progressive streaming (prompt + onEvent + agent_end completion detection)
- Added `InterruptionBehavior` type (`'abort' | 'followUp'`) and `ChatSettings` interface (`toolVisibility`, `interruptionBehavior`) as exported symbols
- Implemented AbortController-based cancellation race: cancellation fires abortController.abort(), rejectOnAbort promise rejects with CancellationError, caught and handled with abort (calls processManager.abort()) or followUp (unsubscribe and return, relying on VS Code handler re-invocation)
- D-07 passthrough: `request.prompt` sent verbatim to `processManager.prompt()` with no parsing or inspection
- Pitfall 1 compliance: onEvent subscription established BEFORE prompt() call
- agent_end detection in the onEvent listener replaces the old waitForIdle approach
- Crash visibility preserved from Phase 1: outer catch shows actionable error message for process crashes
- 6 unit tests covering: handler creation, prompt passthrough, text_delta streaming, agent_end completion, new session restart, and cancellation-triggered abort

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite chat-handler.ts with progressive streaming and interruption handling** - `a763226` (feat)
2. **Task 2: Create chat-handler.test.ts for streaming, cancellation, and passthrough** - `a5e849b` (test)

## Files Created/Modified
- `vscode-ext/src/chat-handler.ts` - **Modified**: Replaced batch-mode promptAndWait+streamEvents with progressive streaming prompt+onEvent setup. Added InterruptionBehavior type, ChatSettings interface, CancellationError class, optional settings parameter on createChatHandler. 81 insertions, 17 deletions.
- `vscode-ext/tests/chat-handler.test.ts` - **Created**: 6 unit tests with mocked PiProcessManager, mock CancellationToken, and controlled event emission via captured eventListeners. 161 lines.

## Decisions Made
- **AbortController with synchronous aborted check**: The implementation checks `abortController.signal.aborted` in the rejectOnAbort Promise constructor to handle the case where the token's onCancellationRequested callback fires synchronously (before rejectOnAbort is created). If already aborted, rejects immediately; otherwise, adds an 'abort' event listener.
- **followUp mode uses VS Code handler re-invocation**: Instead of calling processManager.abort() in followUp mode, the handler simply unsubscribes and returns. VS Code's Chat API fires a new handler invocation with the follow-up message, which calls processManager.prompt(newPrompt). Pi's internal queue processes the new message after the current turn completes (functionally identical to RpcClient.followUp()).
- **Tool visibility type duplication**: toolVisibility uses `'verbose' | 'quiet'` string literal type (duplicated from event-mapper.ts ToolVisibility) to avoid cross-module dependency on Plan 02-02 changes. Plan 02-04's extension.ts wiring will import ToolVisibility from event-mapper.ts.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- **Test timing with async handler**: The mock-based tests required `await new Promise(resolve => setTimeout(resolve, 0))` before accessing captured eventListeners and cancelCb, because the handler needs to progress through its initial awaits (getState, start) before reaching the sync setup code where onEvent subscription and token.onCancellationRequested are configured. The macrotask-based yield ensures all microtasks drain before test code proceeds.

## Verification Summary

- `cd vscode-ext && npx tsc --noEmit` — PASSES (0 errors)
- `cd vscode-ext && npx vitest run tests/chat-handler.test.ts` — 6/6 PASS
- Full test suite: `npx vitest run` — 37/37 PASS (no regressions)
- createChatHandler accepts optional settings parameter
- ChatSettings interface has toolVisibility and interruptionBehavior fields
- InterruptionBehavior type is exported
- onEvent() subscription is established BEFORE processManager.prompt() call
- request.prompt is passed verbatim to processManager.prompt()
- CancellationError is caught and returns {} without crashing
- On cancellation with abort behavior: processManager.abort() is called
- On cancellation with followUp behavior: processManager.abort() is NOT called
- resolveCompletion is called when event.type === 'agent_end' in the onEvent listener
- unsubscribe() is called in the finally block
- Outer catch block shows the Phase 1 error message format for process crashes

## Threat Surface Scan

No new threat surface introduced beyond what the plan's threat model covers:
- T-02-04 (prompt passthrough tampering) — accepted, Pi engine handles input validation
- T-02-05 (DoS via rapid cancel/resend) — accepted, abort() is idempotent
- T-02-SC (no new packages) — mitigated, no packages added

## Next Phase Readiness
- Progressive streaming handler ready for 02-04 (extension.ts wiring will configure ChatSettings from VS Code settings)
- event-mapper.ts from Plan 02-02 provides mapAgentEventToAction and applyStreamAction which the streaming handler uses
- Plan 02-04 will pass the settings parameter with VS Code configuration values for toolVisibility and interruptionBehavior

---
*Phase: 02-rich-chat-experience*
*Plan: 03*
*Completed: 2026-06-15*
