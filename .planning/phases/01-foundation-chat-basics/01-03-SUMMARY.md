---
phase: 01-foundation-chat-basics
plan: 03
subsystem: pi-extension
tags: [refactoring, modularization, tool-overrides, review-lifecycle, path-utils]
requires:
  - provides: "src/index.ts (470-line monolithic entry point with tool overrides, review lifecycle, TUI, path utilities)"
provides:
  - "src/review-lifecycle.ts: review lifecycle functions, module-level session state, TUI selector, polling"
  - "src/tool-overrides.ts: write and edit tool registrations extracted from the old monolithic index.ts"
  - "src/index.ts: reduced to ~44-line entry point with lifecycle event registrations only"
affects: [02-chat-participant, 03-inline-completions]
tech-stack:
  added: []
  patterns:
    - "Domain module extraction: one concern per file (lifecycle, tool registration, entry point)"
    - "Setter functions for cross-module mutable state (ES module read-only let import constraint)"
    - "resolveSafe shared import replacing inline duplicates (FOUND-01 deduplication)"
key-files:
  created:
    - src/review-lifecycle.ts
    - src/tool-overrides.ts
  modified:
    - src/index.ts (470 lines -> 44 lines)
key-decisions:
  - "Module-level session state moved to review-lifecycle.ts (not index.ts) because createReviewAndWait is the primary consumer"
  - "setProjectCwd/setVscodeNotOpenWarned exported as setter functions because ES module let imports are read-only"
  - "No factory closure pattern for Pi extension (unlike vscode-ext) — Pi runs in CLI process, module-level state is acceptable"
  - "Inline resolveSafe replaced by shared/path-utils.ts import with path traversal guard (behavior change for absolute paths, more robust)"
patterns-established:
  - "src/index.ts is pure entry point with lifecycle event handlers only"
  - "tool-overrides.ts owns both write and edit tool registrations"
  - "review-lifecycle.ts owns all review lifecycle functions, TUI, polling, and module-level session state"
  - "Dependency direction: index.ts -> tool-overrides.ts -> review-lifecycle.ts (no cycles)"
requirements-completed: [FOUND-01]
duration: 8min
completed: 2026-06-14
---

# Phase 01 Plan 03: Pi Extension Modularization Summary

**Extracted the monolithic 470-line `src/index.ts` into three domain modules: review-lifecycle.ts (267 lines), tool-overrides.ts (182 lines), and an entry-point-only index.ts (44 lines) with shared/path-utils.ts imports replacing the inline resolveSafe duplicate.**

## Performance

- **Duration:** 8min
- **Started:** 2026-06-14T18:03:00Z
- **Completed:** 2026-06-14T18:11:22Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `src/review-lifecycle.ts` with all review lifecycle functions (createReviewAndWait, pollResultFile, showTuiSelector, writeSyncResult, sleep, applyEdits, cleanupPiDir), module-level session state (sessionReviewIds, sessionApproveAll, projectCwd, vscodeNotOpenWarned), and isVscodeReady helper
- Created `src/tool-overrides.ts` with registerWriteOverride and registerEditOverride, importing resolveSafe from shared/path-utils.js and lifecycle functions from review-lifecycle.js
- Reduced `src/index.ts` from 470 lines to 44 lines containing only the default export function with lifecycle event registrations
- Eliminated inline resolveSafe duplicate -- now imported from shared/path-utils.ts (with path traversal guard, a robustness improvement)
- No circular imports in the module dependency graph
- 4-space indent and double quotes maintained in all src/ files

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/review-lifecycle.ts with extracted lifecycle functions** -- `98e8233` (feat)
2. **Task 2: Create src/tool-overrides.ts and finalize src/index.ts entry point** -- `ebf3bfe` (feat)

## Files Created/Modified

- `src/review-lifecycle.ts` (created, 267 lines) -- Review lifecycle functions, session state, TUI selector, polling, path utilities
- `src/tool-overrides.ts` (created, 182 lines) -- registerWriteOverride and registerEditOverride with Typebox schemas
- `src/index.ts` (modified, 44 lines) -- Entry point with lifecycle event handlers only

## Decisions Made

- **Session state lives in review-lifecycle.ts**, not index.ts -- createReviewAndWait is the primary consumer and both tool overrides and entry point need access
- **Setter functions for mutable state**: `setProjectCwd` and `setVscodeNotOpenWarned` because ES module `import { let }` creates a read-only binding; cross-module reassignment requires a setter in the declaring module
- **Shared resolveSafe replaces inline**: The shared version has path traversal protection and handles absolute paths correctly, making the Pi extension more robust than the original inline version
- **No factory pattern for Pi extension** (unlike vscode-ext refactoring) -- module-level state is acceptable in a CLI process

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Cross-module state reassignment requires setter functions**
- **Found during:** Task 1 (review-lifecycle.ts creation)
- **Issue:** The plan's code assumes `projectCwd = ctx.cwd` and `vscodeNotOpenWarned = false` work when `projectCwd`/`vscodeNotOpenWarned` are imported from another module. ES module `let` imports are read-only bindings -- reassignment throws at runtime.
- **Fix:** Added `export function setProjectCwd(cwd)` and `export function setVscodeNotOpenWarned(value)` in review-lifecycle.ts. Both tool-overrides.ts and index.ts use these setters instead of direct assignment.
- **Files modified:** src/review-lifecycle.ts, src/index.ts, src/tool-overrides.ts
- **Verification:** TypeScript compilation passes (no `Cannot assign to imported variable` errors), tool overrides call `setProjectCwd(ctx.cwd)` instead of `projectCwd = ctx.cwd`
- **Committed in:** 98e8233 (Task 1), ebf3bfe (Task 2)

### Auth Gates

None -- no external services or authentication required.

---

**Total deviations:** 1 auto-fixed (1 correctness)
**Impact on plan:** Minor -- the architectural intent is preserved exactly. Setters are internal to the module API; callers use them transparently.

## Issues Encountered

None.

## Threat Flags

None. The threat model (T-01-07, T-01-08) accepts the existing behavior -- no new network endpoints, auth paths, or file access patterns introduced. The shared resolveSafe import adds a path traversal guard (security improvement).

## Stub Tracking

No stubs found. All three modules contain fully wired production code extracted from the existing working implementation.

## Next Phase Readiness

- Pi extension module structure is clean and ready for Phase 02 (chat participant integration)
- entry-point pattern (index.ts -> tool-overrides.ts -> review-lifecycle.ts) provides clear extension points for new modules
- The vscode-ext refactoring (01-02) and Pi extension refactoring (this plan, 01-03) both completed -- dual-package modular foundation ready

---
*Phase: 01-foundation-chat-basics*
*Completed: 2026-06-14*
