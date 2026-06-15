---
phase: 01-foundation-chat-basics
plan: GAP-FIX
type: gap_closure
wave: 4
subsystem: chat-integration
requirements:
  - CHAT-01
  - CHAT-04
  - CHAT-NEWSESSION
metrics:
  duration_seconds: 135
  completed_tasks: 3
  files_created: 0
  files_modified: 2
  test_count: 31
  test_passed: 31
  test_failed: 0
  commits:
    - cbf109f
    - 9bf2c34
    - 7c72e70
completed_date: "2026-06-15"
---

# Phase 01 Plan GAP-FIX: Gap Fix Summary

**One-liner:** Liveness check in PiProcessManager.start() throws on dead client for D-06 crash visibility; conditional "Starting Pi..." progress based on getState(); new VS Code Chat session detection restarts Pi for fresh context.

## Context

This plan closes two UAT-identified gaps and adds new chat session support to the `@pi` chat participant:

1. **Gap 1 (UAT Test 3):** "Starting Pi..." shown on every message instead of only on first lazy-start
2. **Gap 2 (UAT Test 4, D-06):** Pi crash silently restarts instead of showing crash error
3. **New Feature (CHAT-NEWSESSION):** New VS Code Chat sessions (New Chat button) should start a fresh Pi session

## Tasks Executed

### Task 1: Fix PiProcessManager.start() — liveness check with D-06 crash visibility

**File:** `vscode-ext/src/pi-process-manager.ts`

**Change:** Replaced the unconditional early return in `start()` when `state.client` exists with a try/catch that calls `state.client.getState()`. If `getState()` throws (child process killed, IPC broken), the dead reference is nulled out and an error is thrown with `pi -c` recovery guidance. This satisfies D-06 (No silent restarts) by surfacing the crash to the chat handler's catch block.

- `state.client` alive + `getState()` OK: returns immediately (fast path)
- `state.client` alive but `getState()` throws (dead): nulls out state, throws
- `state.client` null: falls through to initialization (first call)
- **Commit:** `cbf109f`

### Task 2: Make "Starting Pi..." conditional via getState() check

**File:** `vscode-ext/src/chat-handler.ts`

**Change:** Replaced the unconditional `stream.progress('Starting Pi...')` with a conditional check that calls `processManager.getState()`. Progress is only shown when `sessionId` is null (Pi not yet started). The `.catch()` on `getState()` handles the dead-client edge case.

- `getState()` returns `{ sessionId: string }` when alive: no progress shown
- `getState()` returns `{ sessionId: null }` when not started: shows "Starting Pi..."
- "Pi is working..." already correctly positioned after `await processManager.start()` (no change needed)
- **Commit:** `9bf2c34`

### Task 3: New VS Code Chat session detection

**File:** `vscode-ext/src/chat-handler.ts`

**Change:** Added `context.history.length === 0` check before the try block. When VS Code starts a new chat session (user clicks "New Chat"), the handler calls `processManager.restart()` to start a fresh Pi session with clean context. The `.catch()` prevents unhandled rejection when Pi hasn't been started yet (first-ever message).

- Renamed `_context` parameter to `context` for access
- `context.history.length === 0`: triggers `processManager.restart()` → fresh Pi session
- `context.history.length > 0`: continues in existing Pi session
- **Commit:** `7c72e70`

## Verification Results

| Check | Status |
|-------|--------|
| TypeScript compilation (`tsc --noEmit`) | Passed (0 errors) |
| Test suite (`npx vitest run`) | 31/31 passed (0 regressions) |
| `getState` in pi-process-manager.ts | Present (5 matches — method + calls) |
| `throw new Error` in pi-process-manager.ts | Present (3 matches) |
| `getState` in chat-handler.ts | Present (1 match) |
| `initialState.sessionId` in chat-handler.ts | Present (1 match) |
| `stream.progress('Pi is working...')` in chat-handler.ts | Present (1 match — after start()) |
| `stream.progress('Starting Pi...')` in chat-handler.ts | Present (1 match — conditional) |
| `context.history` in chat-handler.ts | Present (2 matches — code + comment) |
| `processManager.restart` in chat-handler.ts | Present (1 match) |

## Deviations from Plan

None. Plan executed exactly as written.

One observation: Change 2 from the plan description ("Move 'Pi is working...' after successful start()") was already correctly ordered in the existing code — the progress call was already positioned after `await processManager.start()`. No change was needed.

## Modified Files

| File | Change | Commit |
|------|--------|--------|
| `vscode-ext/src/pi-process-manager.ts` | Added liveness check + throw in start() | `cbf109f` |
| `vscode-ext/src/chat-handler.ts` | Conditional "Starting Pi...", new session detection | `9bf2c34` |
| `vscode-ext/src/chat-handler.ts` | New chat session restart | `7c72e70` |

## Success Criteria

- [x] Gap 1 closure (UAT Test 3): Subsequent @pi messages in same chat session do NOT show "Starting Pi..."
- [x] Gap 2 closure + D-06 compliance (UAT Test 4): Killing Pi process shows crash error with pi -c recovery guidance
- [x] New Chat Session (CHAT-NEWSESSION): Clicking "New Chat" triggers fresh Pi session
- [x] No behavioral regressions: All 31 existing tests pass, tsc --noEmit passes

## Self-Check: PASSED

- All commits verified in git log
- All modified files exist and are committed
- Tests pass: 31/31
- TypeScript compiles: 0 errors
