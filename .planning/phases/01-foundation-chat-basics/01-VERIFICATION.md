---
phase: 01-foundation-chat-basics
verified: 2026-06-15T14:30:00Z
status: human_needed
score: 9/9 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "Subsequent messages to @pi skip 'Starting Pi...' -- only shown when Pi is not already running"
    - "Killing Pi process shows crash error with pi -c guidance (D-06: No silent restarts)"
    - "'Pi is working...' only appears after start() confirms the process is alive"
    - "New VS Code chat session (context.history empty) triggers fresh Pi session via restart()"
  gaps_remaining:
    - "Event mapping copy does not match UI-SPEC design contract (turn_start shows '---' instead of 'Processing...' progress; tool_execution_start shows 'error executing {toolName}...' instead of 'Tool: {toolName}')"
  regressions: []
gaps:
  - truth: "Event mapping copy matches UI-SPEC design contract (turn_start shows 'Processing...' progress, tool_execution_start shows 'Tool: {toolName}' progress)"
    status: warning
    reason: "UI-SPEC specifies progress messages for turn_start and tool_execution_start, but implementation uses markdown with different copy. turn_start shows '---' instead of 'Processing...'; tool_execution_start shows '```\\nerror executing {toolName}...\\n```\\n' instead of 'Tool: {toolName}'. These are plan-level decisions baked into test cases but not documented as deviations from UI-SPEC. Not addressed in Phase 2 roadmap SCs either."
    artifacts:
      - path: vscode-ext/src/event-mapper.ts
        issue: "turn_start returns markdown '---' vs UI-SPEC progress 'Processing...'; tool_execution_start returns markdown 'error executing {toolName}...' vs UI-SPEC progress 'Tool: {toolName}'"
    missing:
      - "Document UI-SPEC deviations in plan summaries"
      - "Align event-mapper.ts copy with UI-SPEC: turn_start should be stream.progress('Processing...'), tool_execution_start should be stream.progress('Tool: {toolName}')"
human_verification:
  - test: "Verify @pi participant appears in VS Code Chat panel"
    expected: 'After loading the extension in VS Code, typing @ in the Chat panel shows participant "pi" with fullName "Pi Agent"'
    why_human: "Requires running VS Code extension host with extension loaded. Cannot verify programmatically without VS Code runtime."
  - test: "Verify @pi sends and receives messages"
    expected: 'Sending a message to @pi shows "Starting Pi..." progress (only on first message in session), then "Pi is working...", then a response from Pi agent. Subsequent messages skip the lazy start progress. New Chat button triggers fresh Pi session.'
    why_human: "Requires running Pi CLI and VS Code extension host. Pi must be installed and the extension must be loaded."
  - test: "Verify Pi crash recovery flow"
    expected: "Crashing the Pi process during a chat shows error in chat with recovery instructions and 'pi -c' guidance. No silent restart -- next message triggers fresh start."
    why_human: "Requires running VS Code extension host and a Pi process that can be terminated."
---

# Phase 01: Foundation + Chat Basics Verification Report

**Phase Goal:** User can invoke @pi in VS Code Chat and send/receive messages routed through a properly managed Pi child process
**Verified:** 2026-06-15T14:30:00Z
**Status:** human_needed
**Re-verification:** Yes -- after GAP-FIX gap closure

## Goal Achievement

### Observable Truths

#### ROADMAP Success Criteria (5/5 verified, unchanged from initial verification)

| #   | Truth (ROADMAP SC) | Status | Evidence |
| --- | ------------------ | ------ | -------- |
| 1 | User can type @pi in VS Code Chat panel and send a message -- participant registered via createChatParticipant | VERIFIED | package.json contributes.chatParticipants with id "pi-sr.chat" (line 23). extension.ts registers `vscode.chat.createChatParticipant('pi-sr.chat', chatHandler)` in sync activation phase (line 33). Participant ID "pi-sr.chat" matches in both files. chat-handler.ts exports createChatHandler factory (line 6). |
| 2 | Pi responds to chat messages routed through PiProcessManager (RPC child process via RpcClient) | VERIFIED | chat-handler.ts calls processManager.start() (line 29) and processManager.promptAndWait() (line 37). pi-process-manager.ts wraps RpcClient with start/stop/restart/prompt/promptAndWait/abort/onEvent/getState methods (lines 23-117). streamEvents() maps AgentEvents to ChatResponseStream actions (event-mapper.ts line 40). End-to-end wiring confirmed. Runtime behavior requires human verification. |
| 3 | Extension activates without VS Code "extension is slow" warnings -- all I/O migrated to async fs.promises, activation returns <1ms with deferred init | VERIFIED | Zero sync fs.*Sync calls in vscode-ext/src/ (grep confirmed no matches). extension.ts has sync phase returning immediately (lines 9-36) with fire-and-forget IIFE async init (lines 37-86). 12 console.error calls in review-coordinator.ts ensure no empty catch blocks. Deferred init pattern matches FOUND-05 spec. |
| 4 | Extension code organized into separate domain files -- no monolithic extension.ts | VERIFIED | vscode-ext/src/: chat-handler.ts, event-mapper.ts, pi-process-manager.ts, review-coordinator.ts (401 lines), utils.ts (53 lines), types.ts (re-export shim, 8 lines), extension.ts (97 lines). src/: index.ts (44 lines), tool-overrides.ts (182 lines), review-lifecycle.ts (267 lines). shared/: types.ts, ipc.ts, path-utils.ts. All files substantive, no stubs. |
| 5 | RpcEventMapper transforms Pi AgentEvent types to ChatResponseStream actions as pure, testable functions | VERIFIED | event-mapper.ts exports StreamAction type and 3 pure functions: mapAgentEventToAction (lines 18-62), applyStreamAction (lines 68-85), streamEvents (lines 91-98). Zero runtime dependencies beyond type imports. All 10 AgentEvent variants handled. 16 passing tests. Functions have no I/O, no side effects, no VS Code API imports. |

#### GAP-FIX Must-Haves (4/4 verified, new in re-verification)

| # | Truth (GAP-FIX must-have) | Status | Evidence |
|---|---------------------------|--------|----------|
| 6 | Subsequent messages to @pi skip "Starting Pi..." -- only shown when Pi is not already running | VERIFIED | chat-handler.ts lines 23-27: `getState().catch(...)` checks `initialState.sessionId`. Only shows `stream.progress('Starting Pi...')` when `sessionId` is null (not started). When Pi is alive, getState() returns `{ sessionId: string }` and the progress is skipped. |
| 7 | Killing Pi process shows crash error with pi -c guidance (D-06: No silent restarts) | VERIFIED | pi-process-manager.ts lines 40-53: liveness check in start() calls `state.client.getState()` in try/catch. Dead client detection nulls out state and throws with 'Pi process exited unexpectedly...' including pi -c guidance. chat-handler.ts lines 43-53 catch block renders the error as markdown with pi -c recovery instructions. |
| 8 | "Pi is working..." only appears after start() confirms the process is alive | VERIFIED | chat-handler.ts line 29-32: `await processManager.start()` completes BEFORE `stream.progress('Pi is working...')`. If start() throws (dead client detected), execution jumps to catch block and "Pi is working..." is never shown. |
| 9 | New VS Code chat session (context.history empty) triggers fresh Pi session via restart() | VERIFIED | chat-handler.ts lines 16-20: `if (context.history.length === 0)` checks for new VS Code Chat session (New Chat button). Triggers `processManager.restart()` which calls stop() then start(). `.catch()` handles the case where Pi hasn't been started yet. |

**Score:** 9/9 must-haves verified

### Deferred Items

No deferred items. The remaining warning (UI-SPEC copy deviations in event-mapper.ts) is not addressed in any later phase's success criteria.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| shared/types.ts | IPC type definitions (6 exports) | VERIFIED | 36 lines, exports ReviewFile, ReviewRequest, ReviewResult, ReviewResultFile, FileStatus, DiffSession |
| shared/ipc.ts | IPC path constants + ipcPath | VERIFIED | 12 lines, exports 5 constants + ipcPath helper |
| shared/path-utils.ts | resolveSafe path normalization | VERIFIED | 30 lines, includes path traversal guard (result.startsWith(cwd)) |
| shared/tsconfig.json | Shared module tsconfig | VERIFIED | ES2022, NodeNext, strict, declaration, includes shared/**/*.ts |
| vscode-ext/vitest.config.ts | Vitest configuration | VERIFIED | 9 lines, node environment, globals enabled, tests/**/*.test.ts pattern |
| vscode-ext/tests/path-utils.test.ts | 6 resolveSafe test cases | VERIFIED | 29 lines, covers absolute, relative, LLM-mangled, trailing-slash, empty, exact-match |
| vscode-ext/tests/ipc.test.ts | 6 IPC + 1 traversal test cases | VERIFIED | 44 lines, covers all 5 constants, ipcPath, and path-traversal guard |
| vscode-ext/src/review-coordinator.ts | Factory with 8 methods | VERIFIED | 401 lines, exports createReviewCoordinator with async I/O, all methods implemented |
| vscode-ext/src/utils.ts | 3 utility functions | VERIFIED | 53 lines, exports startHeartbeat, ensurePiDirs, checkPiInstalled (plus getPiPath added during execution) |
| vscode-ext/src/types.ts | Re-export from shared/ | VERIFIED | 8 lines, re-exports all 6 types from ../../shared/types |
| vscode-ext/src/event-mapper.ts | Pure event mapping functions | VERIFIED | 100 lines, exports StreamAction, mapAgentEventToAction, applyStreamAction, streamEvents |
| vscode-ext/src/pi-process-manager.ts | Factory wrapping RpcClient (with liveness check) | VERIFIED | 117 lines, exports createPiProcessManager with 8 methods, lazy allocation, liveness check in start() |
| vscode-ext/tests/event-mapper.test.ts | 16 test cases | VERIFIED | 142 lines, covers all AgentEvent variants + applyStreamAction edge cases |
| vscode-ext/tests/pi-process-manager.test.ts | 2 shape tests | VERIFIED | 25 lines, verifies factory API contract |
| vscode-ext/src/chat-handler.ts | ChatRequestHandler factory | VERIFIED | 55 lines, exports createChatHandler with lazy start, conditional progress, crash visibility, new session restart, batch event mapping |
| vscode-ext/src/extension.ts | Deferred activation with chat participant | VERIFIED | 97 lines, sync activation + deferred async init + participant registration + workspace isolation |
| vscode-ext/package.json | chatParticipants contribution | VERIFIED | chatParticipants array with id "pi-sr.chat", isSticky: true |
| src/review-lifecycle.ts | Review lifecycle functions | VERIFIED | 267 lines, all extracted functions + session state + setter functions |
| src/tool-overrides.ts | Write/edit tool registrations | VERIFIED | 182 lines, registerWriteOverride + registerEditOverride |
| src/index.ts | Reduced entry point | VERIFIED | 44 lines, default export with lifecycle event registrations only |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| shared/types.ts | vscode-ext/src/types.ts | re-export from ../../shared/types | WIRED | types.ts line 8: `export { ... } from '../../shared/types'` |
| shared/ipc.ts | vscode-ext/src/utils.ts | IPC constants import | WIRED | utils.ts line 3: `import { IPC_HEARTBEAT, IPC_REVIEW_REQUESTS, IPC_REVIEW_RESULTS } from '../../shared/ipc'` |
| shared/ipc.ts | vscode-ext/src/review-coordinator.ts | IPC constants import | WIRED | review-coordinator.ts line 7: `import { IPC_REVIEW_REQUESTS, IPC_REVIEW_RESULTS, IPC_TMP } from '../../shared/ipc'` |
| shared/path-utils.ts | src/review-lifecycle.ts | resolveSafe import replacing inline | WIRED | review-lifecycle.ts line 5: `import { resolveSafe } from "../shared/path-utils.js"` |
| shared/path-utils.ts | src/tool-overrides.ts | resolveSafe import | WIRED | tool-overrides.ts line 6: `import { resolveSafe } from "../shared/path-utils.js"` |
| shared/path-utils.ts | vscode-ext/src/review-coordinator.ts | resolveSafe import | WIRED | review-coordinator.ts line 6: `import { resolveSafe } from '../../shared/path-utils'` |
| vscode-ext/src/extension.ts | vscode-ext/src/review-coordinator.ts | createReviewCoordinator() factory | WIRED | extension.ts line 4, 18 |
| vscode-ext/src/extension.ts | vscode-ext/src/pi-process-manager.ts | createPiProcessManager() factory | WIRED | extension.ts line 5, 22 |
| vscode-ext/src/extension.ts | vscode-ext/src/chat-handler.ts | createChatHandler() factory | WIRED | extension.ts line 6, 32 |
| vscode-ext/src/extension.ts | vscode-ext/package.json | participant ID 'pi-sr.chat' matches | WIRED | Both files use identical ID string -- confirmed via grep |
| vscode-ext/src/chat-handler.ts | vscode-ext/src/event-mapper.ts | streamEvents() call | WIRED | chat-handler.ts line 3, 40 |
| vscode-ext/src/chat-handler.ts | vscode-ext/src/pi-process-manager.ts | processManager.start() and promptAndWait() | WIRED | chat-handler.ts line 2, 29, 37 |
| vscode-ext/src/chat-handler.ts | vscode-ext/src/pi-process-manager.ts | getState() called before start() for conditional progress | WIRED | chat-handler.ts line 24: `processManager.getState()` |
| vscode-ext/src/chat-handler.ts | vscode-ext/src/pi-process-manager.ts | restart() called when context.history is empty | WIRED | chat-handler.ts line 17: `processManager.restart()` |
| src/index.ts | src/tool-overrides.ts | registerWrite/EditOverride() calls | WIRED | index.ts lines 2-3, 42-43 |
| src/index.ts | src/review-lifecycle.ts | lifecycle event handlers | WIRED | index.ts lines 5-10, 15-40 |
| src/tool-overrides.ts | src/review-lifecycle.ts | createReviewAndWait, setProjectCwd | WIRED | tool-overrides.ts line 7 |
| vscode-ext/src/extension.ts | vscode.workspace.onDidChangeWorkspaceFolders | workspace isolation (D-08) | WIRED | extension.ts lines 70-81 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| chat-handler.ts | events (AgentEvent[]) | processManager.promptAndWait() | Yes - from RpcClient.promptAndWait() | FLOWING |
| event-mapper.ts streamEvents | events array | iterates passed array | N/A - pure transformation | FLOWING |
| pi-process-manager.ts | state.client (RpcClient) | dynamic import inside start() | Yes - lazy-created from Pi SDK | FLOWING |
| review-coordinator.ts | sessions, reviewFiles | fs.readdir recovery + watch events | Yes - reads from .pi/ filesystem IPC | FLOWING |
| pi-process-manager.ts (GAP-FIX) | state.client liveness | state.client.getState() in try/catch | Yes - real RPC call checks if child process alive | FLOWING |
| chat-handler.ts (GAP-FIX) | initialState.sessionId | processManager.getState() | Yes - reflects actual RpcClient state | FLOWING |
| chat-handler.ts (GAP-FIX) | context.history.length | VS Code ChatContext | Yes - VS Code runtime provides real history array | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Tests pass: path-utils, ipc, event-mapper, pi-process-manager | `npx vitest run` | 31/31 tests, 4/4 files pass | PASS |
| TypeScript compilation | `npx tsc --noEmit` in vscode-ext/ | 0 errors | PASS |
| Git branch exists | `git branch --list \| grep gsd/phase-01` | gsd/phase-01-foundation-chat-basics found | PASS |
| GAP-FIX commits exist | `git log --oneline cbf109f 9bf2c34 7c72e70` | All 3 found | PASS |
| No inline resolveSafe in src/ | grep 'function resolveSafe' src/ | No matches | PASS |
| No sync I/O in vscode-ext/src/ | grep for Sync calls | No matches | PASS |
| No blocker debt markers | grep for TBD/FIXME/XXX in GAP-FIX files | No matches | PASS |
| Participant ID match | grep 'pi-sr.chat' in both files | Matches exactly | PASS |
| Root tsconfig includes shared/ | grep 'shared' tsconfig.json | Found: `"shared/**/*.ts"` in include array | PASS |
| getState() in pi-process-manager.ts (liveness check) | grep -c 'getState' | 5 matches (method + calls) | PASS |
| throw on dead client in pi-process-manager.ts | grep -c 'throw new Error' | 3 matches (inc. pi -c error) | PASS |
| getState() in chat-handler.ts (conditional progress) | grep -c 'getState' | 1 match | PASS |
| initialState.sessionId in chat-handler.ts | grep -c 'initialState.sessionId' | 1 match | PASS |
| "Pi is working..." after start() | grep -c "progress('Pi is working...')" | 1 match (after await start()) | PASS |
| "Starting Pi..." conditional | grep -c "progress('Starting Pi...')" | 1 match (inside if block) | PASS |
| context.history check for new session | grep -c 'context.history' | 2 matches (code + comment) | PASS |
| processManager.restart() for new session | grep -c 'processManager.restart' | 1 match | PASS |

### Probe Execution

No probes declared in any Phase 1 plan. SKIPPED.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| FOUND-01 | 01-01, 01-02, 01-03 | Modular file organization | SATISFIED | Monolithic extension.ts (368 lines) split into 7 domain files. Pi src/index.ts (470 lines) split into 3 files. shared/ module created. All verified. |
| FOUND-02 | 01-02 | Sync I/O migrated to async fs.promises | SATISFIED | Zero sync I/O calls in vscode-ext/src/ (grep verified). All fs.*Sync replaced with fs.promises in review-coordinator.ts, utils.ts, extension.ts. Empty catches remediated with console.error. |
| FOUND-03 | 01-04 | PiProcessManager lifecycle management | SATISFIED | pi-process-manager.ts exports createPiProcessManager factory with 8 methods: start, stop, restart, prompt, promptAndWait, abort, onEvent, getState. Wraps RpcClient with lazy allocation. Liveness check in start() added by GAP-FIX. |
| FOUND-04 | 01-04 | RpcEventMapper pure functions | SATISFIED | event-mapper.ts exports StreamAction type + 3 pure functions. No I/O, no side effects, no VS Code API. 16 tests cover all 10 AgentEvent variants. |
| FOUND-05 | 01-02, 01-05 | Phased activation pattern | SATISFIED | extension.ts activate() has sync phase (workspace check, factory creation, command + participant registration) returning immediately. Deferred async init in IIFE. Verified <1ms sync return pattern. |
| CHAT-01 | 01-05, GAP-FIX | User can invoke @pi in Chat | SATISFIED | package.json contributes.chatParticipants with id "pi-sr.chat". extension.ts calls createChatParticipant(). chat-handler.ts provides ChatRequestHandler. GAP-FIX adds conditional progress, crash visibility, new session support. (Runtime appearance requires human verification.) |
| CHAT-04 | 01-05, GAP-FIX | Messages route via PiProcessManager | SATISFIED | chat-handler.ts calls processManager.start() and processManager.promptAndWait(). pi-process-manager.ts wraps RpcClient. streamEvents() maps events to ChatResponseStream. End-to-end wiring proven. GAP-FIX adds liveness check on existing client. |
| CHAT-NEWSESSION | GAP-FIX | New VS Code Chat session triggers fresh Pi session | SATISFIED | chat-handler.ts lines 16-20: `context.history.length === 0` triggers `processManager.restart()`. |
| D-06 (crash visibility) | GAP-FIX | No silent restarts -- crash surfaced to user with pi -c guidance | SATISFIED | pi-process-manager.ts lines 40-53: liveness check throws on dead client. chat-handler.ts lines 43-53 catch block renders crash error. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| vscode-ext/src/event-mapper.ts | 23-24 | turn_start maps to markdown '---' instead of progress 'Processing...' (deviates from UI-SPEC) | WARNING | User sees '---' separator instead of 'Processing...' progress message on turn_start |
| vscode-ext/src/event-mapper.ts | 35 | tool_execution_start maps to markdown '```\nerror executing {toolName}...\n```\n' with misleading 'error' prefix (deviates from UI-SPEC which specifies progress 'Tool: {toolName}') | WARNING | User sees misleading 'error executing write...' when a tool starts executing |
| vscode-ext/src/pi-process-manager.ts | 39 | `start()` returns early if client already exists but skips re-registering event forwarding | INFO | onEvent listeners added to the set before start() would never fire since event forwarding is only set up on first start(). Not an issue for Phase 1 batch mode (promptAndWait collects events directly). |
| vscode-ext/src/pi-process-manager.ts | 56-58 | `new Function` workaround for ESM dynamic import bypasses tsc CJS rewriting | INFO | Necessary workaround documented in 01-05-SUMMARY. The @earendil-works/pi-coding-agent package is ESM-only. |
| vscode-ext/src/review-coordinator.ts | 74, 85 | `.catch(() => {})` on fs.stat calls in watch handlers | INFO | Intentional -- race condition guard for file-existence checks where no action is needed on failure. Same pattern as heartbeat catches. |
| src/review-lifecycle.ts | 11-12 | `export let` mutable module-level state violates D-02 factory-closure principle | INFO | Documented in 01-03-SUMMARY as intentional: Pi extension uses module-level state (not factory closures) because it runs in a CLI process. Setter functions provided for cross-module writes. |

### GAP-FIX Gap Closure Summary

The GAP-FIX plan (01-GAP-FIX-PLAN.md) was executed on 2026-06-15 with 3 tasks, all completed and verified:

1. **Task 1** (cbf109f): Liveness check in PiProcessManager.start() -- dead RpcClient detection throws with pi -c guidance instead of silent restart. Verified: pi-process-manager.ts lines 40-53 show the try/catch liveness check.

2. **Task 2** (9bf2c34): Conditional "Starting Pi..." progress -- only shown when Pi is not already running. Verified: chat-handler.ts lines 23-27 check `initialState.sessionId` before showing progress.

3. **Task 3** (7c72e70): New VS Code Chat session detection -- `context.history.length === 0` triggers `processManager.restart()`. Verified: chat-handler.ts lines 16-20.

**Gap 1 (UAT Test 3):** CLOSED. Subsequent @pi messages in same chat session no longer show "Starting Pi...".
**Gap 2 (UAT Test 4, D-06):** CLOSED. Killing Pi process shows crash error with pi -c guidance. No silent restart.
**CHAT-NEWSESSION:** SATISFIED. New Chat button triggers fresh Pi session via restart().

All 31 existing tests pass (no regressions). tsc --noEmit passes with 0 errors.

### Human Verification Required

#### 1. @pi participant visibility in VS Code Chat

**Test:** Open VS Code with the vscode-pi-sr extension loaded. Open the Chat panel (Ctrl+Shift+I or View > Chat). Type `@` and verify "pi" appears in the participant list with fullName "Pi Agent".

**Expected:** @pi participant appears in the Chat participant selector with `isSticky: true` so it remains selected.

**Why human:** Requires running VS Code extension host with the extension loaded. Cannot verify programmatically without VS Code runtime.

#### 2. @pi message send and receive

**Test:** Select @pi and send a message (e.g., "hello"). Observe the interaction sequence.

**Expected per UI-SPEC:**
- First message: Shows "Starting Pi..." progress, then "Pi is working...", then response from Pi
- Subsequent messages: Skip "Starting Pi..." -- instant response
- New Chat button: Triggers fresh Pi session (shows "Starting Pi..." again on next message)
- Pi process crash shows error in chat with `pi -c` recovery instructions

**Why human:** Requires running VS Code with Pi CLI installed. Pi must be properly configured for this to work end-to-end.

#### 3. Workspace switch behavior

**Test:** Switch VS Code workspace while @pi is active.

**Expected per D-08 (partial):** Pi process stops on workspace switch. Next @pi message in the new workspace lazy-starts a fresh Pi process.

**Why human:** Requires VS Code extension host with multiple workspaces available.

### Gaps Summary

**No BLOCKER gaps found.** All five ROADMAP Success Criteria are met by the codebase implementation. All four GAP-FIX must-haves are VERIFIED. All requirements (FOUND-01 through FOUND-05, CHAT-01, CHAT-04, CHAT-NEWSESSION) are satisfied by code evidence.

**WARNING - UI-SPEC copywriting deviations (2 items):**
1. `turn_start` shows `---` as markdown instead of `Processing...` as progress per UI-SPEC
2. `tool_execution_start` shows misleading `"error executing {toolName}..."` as markdown instead of `"Tool: {toolName}"` as progress per UI-SPEC

These were baked into the plan's test cases (01-04-PLAN.md) and the implementation faithfully matches the tests. However, the deviation from the approved UI-SPEC was not documented in plan summaries. These do not block the phase goal (user can invoke @pi and send/receive messages), but should be corrected or formally accepted. Not addressed by Phase 2 roadmap SCs.

**Human verification required:** The @pi end-to-end interaction (participant visibility, message send/receive, crash recovery, new session) requires running VS Code extension host and cannot be verified programmatically.

---

_Verified: 2026-06-15T14:30:00Z_
_Verifier: Claude (gsd-verifier)_
