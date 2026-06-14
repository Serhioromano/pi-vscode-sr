---
phase: 01-foundation-chat-basics
plan: 04
subsystem: chat
tags:
  - event-mapper
  - pi-process-manager
  - rpcclient
  - tdd
  - vitest

# Dependency graph
requires:
  - phase: 01-01
    provides: shared foundation types, vitest infrastructure
provides:
  - event-mapper.ts (AgentEvent -> StreamAction pure functions)
  - pi-process-manager.ts (RpcClient wrapper factory)
affects:
  - 01-05-chat-handler (uses streamEvents and PiProcessManager)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Factory with closure state (pi-process-manager)
    - Pure event mapping function (event-mapper)
    - TDD with RED/GREEN commit sequence

key-files:
  created:
    - vscode-ext/src/event-mapper.ts
    - vscode-ext/src/pi-process-manager.ts
    - vscode-ext/tests/event-mapper.test.ts
    - vscode-ext/tests/pi-process-manager.test.ts
  modified: []

key-decisions:
  - "RpcClient imported from `@earendil-works/pi-coding-agent` main entry, not deep import path -- the package exports field blocks subpath imports"
  - "No emoji in progress or tool messages -- follows UI-SPEC copywriting contract"
  - "agent_end.messages fallback extraction deferred to Phase 2 streaming"
  - "pi-process-manager creates RpcClient lazily inside start(), not in factory constructor"

patterns-established:
  - "TDD with atomic RED (test) and GREEN (implementation) commits"
  - "Factory function with closure-scoped state (no classes, no module-level state)"
  - "Pure functions separated from side-effectful stream operations"

requirements-completed:
  - FOUND-03
  - FOUND-04

# Metrics
duration: 10min
completed: 2026-06-15
---

# Phase 01 Plan 04: Event Mapper and Pi Process Manager Summary

**Pure event mapping functions (AgentEvent -> ChatResponseStream actions) and PiProcessManager factory wrapping RpcClient, both with TDD-based unit test coverage**

## Performance

- **Duration:** 10 min
- **Started:** 2026-06-15T00:08:00Z (approx)
- **Completed:** 2026-06-15T00:15:00Z (approx)
- **Tasks:** 2
- **Files modified:** 4 (all new)

## Accomplishments

- Created event-mapper.ts with 3 pure functions (mapAgentEventToAction, applyStreamAction, streamEvents) and StreamAction type, handling all 10 AgentEvent variants
- Created pi-process-manager.ts with createPiProcessManager factory implementing 8 methods wrapping RpcClient
- Wrote 16 test cases for event-mapper covering all AgentEvent types, applyStreamAction edge cases, and Open Question 3 (agent_end fallback)
- Wrote 2 shape tests for pi-process-manager verifying factory API contract
- Full suite of 30 tests passes across all 4 test files (event-mapper, pi-process-manager, path-utils, ipc)
- Zero classes, zero sync I/O, zero module-level mutable state

## Task Commits

Each task was committed atomically with TDD RED/GREEN sequence:

1. **Task 1a: Add failing tests for event-mapper (RED)** - `289a324` (test)
2. **Task 1b: Implement event-mapper pure functions (GREEN)** - `d8326df` (feat)
3. **Task 2a: Add shape tests for pi-process-manager (RED)** - `e061e9d` (test)
4. **Task 2b: Implement pi-process-manager factory (GREEN)** - `6340826` (feat)

## Files Created/Modified

- `vscode-ext/src/event-mapper.ts` - Exports StreamAction type, mapAgentEventToAction (pure), applyStreamAction (side-effectful), streamEvents (batch processor). Zero runtime dependencies beyond type imports. Handles agent_start, turn_start, message_update, tool_execution_start, tool_execution_update, tool_execution_end, message_end, agent_end, turn_end, message_start.
- `vscode-ext/src/pi-process-manager.ts` - Exports createPiProcessManager factory, PiProcessManager interface, PiProcessManagerState interface. Wraps RpcClient with lazy allocation inside start(). Methods: start, stop, restart, prompt, promptAndWait, abort, onEvent (with unsubscribe), getState.
- `vscode-ext/tests/event-mapper.test.ts` - 16 test cases: 13 for mapAgentEventToAction (all event type variants, unknown events, Open Question 3 fallback), 3 for applyStreamAction (progress, markdown, empty markdown skip).
- `vscode-ext/tests/pi-process-manager.test.ts` - 2 test cases: shape verification (all 8 methods are functions), factory construction does not throw.

## Decisions Made

- **RpcClient import from main entry**: The plan specified `@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.js` but the package's `exports` field blocks deep subpath imports. Changed to `@earendil-works/pi-coding-agent` which exports `RpcClient` publicly. Fix applied via Rule 3 (blocking issue).
- **No emoji in progress/tool messages**: Research examples included emoji (checkmark, cross mark) in tool_execution_end messages and "Pi agent started..." for agent_start. UI-SPEC mandates plain text ("Pi is working...") with no emoji. Implementation matches UI-SPEC.
- **agent_end.messages fallback deferred to Phase 2**: Per RESOLVED Open Question 3, mapAgentEventToAction returns `{ type: 'done' }` for agent_end. Extraction of final response from agent_end.messages is deferred to Phase 2 progressive streaming.
- **Lazy RpcClient allocation**: RpcClient is created inside start(), not in the factory constructor, enabling lazy initialization per D-05.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RpcClient import path not accessible due to package exports field**
- **Found during:** Task 2 (pi-process-manager implementation)
- **Issue:** Import from `@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.js` fails because the package.json `exports` field only exports the main entry (`.`). The `require` condition is absent; the `import` condition does not include the deep subpath. Node.js v24 enforces exports restriction strictly, blocking the import with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- **Fix:** Changed import to `@earendil-works/pi-coding-agent` which exports `RpcClient` from its main entry. The deep import path was documented in research (Pitfall 2) but the actual issue is the `exports` field restriction, not the `.js` extension.
- **Files modified:** `vscode-ext/src/pi-process-manager.ts` (import line)
- **Verification:** `npx vitest run tests/pi-process-manager.test.ts` passes, ESM import resolves correctly
- **Committed in:** `6340826` (Task 2b GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for build to work. No scope creep.

## Issues Encountered

- None. Both tasks completed within a single execution session with no unexpected blockers beyond the documented import path issue.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- All 4 created files exist on disk: event-mapper.ts, pi-process-manager.ts, event-mapper.test.ts, pi-process-manager.test.ts
- All 4 commits exist in git log: 289a324, d8326df, e061e9d, 6340826
- Full test suite passes: 30/30 tests, 4/4 test files
- Zero fs.*Sync calls in source files
- Zero classes in source files
- RpcClient import resolves correctly from main entry

## Next Phase Readiness

- Plan 05 (chat-handler.ts) can import streamEvents and PiProcessManager from these modules
- Pure event-mapper functions enable easy testing of chat handler streaming logic
- PiProcessManager provides the RpcClient wrapper needed for ChatRequestHandler to communicate with Pi

---
*Phase: 01-foundation-chat-basics*
*Completed: 2026-06-15*
