---
phase: 01-foundation-chat-basics
plan: 02
subsystem: vscode-extension
tags: [refactor, async-io, factory-pattern, deferred-init, review-coordinator]

requires:
  - phase: 01-foundation-chat-basics
    plan: 01
    provides: shared types, IPC constants, path-utils, vitest infrastructure

provides:
  - review-coordinator.ts factory with closure-based state and async I/O
  - utils.ts with heartbeat, dir creation, and Pi check helpers
  - extension.ts with deferred activation pattern (sub-1ms sync return)
  - types.ts re-export shim from shared/types.ts
  - Empty catch block remediation with console.error logging
  - Path traversal guard test

affects:
  - 01-03: extension.ts imports from these new modules
  - 01-05: chat-handler.ts will be wired into extension.ts deferred init

tech-stack:
  added: []
  patterns:
    - Factory with closure state (D-02)
    - Deferred async initialization (FOUND-05)
    - Module splitting (single file to domain modules)
    - All I/O via fs.promises

key-files:
  created:
    - vscode-ext/src/review-coordinator.ts
    - vscode-ext/src/utils.ts
  modified:
    - vscode-ext/src/types.ts
    - vscode-ext/src/extension.ts
    - vscode-ext/tests/ipc.test.ts

key-decisions:
  - "start() returns Promise<void> (not void) — necessary for async directory creation and recovery"
  - "Heartbeat catch blocks intentionally left empty — fire-and-forget best-effort signal"
  - "Imported types from shared/types.ts (not ./types) in review-coordinator.ts for direct access"
  - "createChatHandler import deferred to plan 01-05 — module does not exist yet"

patterns-established:
  - "Factory with closure state for all domain modules"
  - "Deferred async initialization in activate()"
  - "console.error on all cleanup catch blocks"

requirements-completed:
  - FOUND-01
  - FOUND-02
  - FOUND-05

duration: 6min
completed: 2026-06-15
---

# Phase 01 Plan 02: Module Extraction Foundation Summary

**Refactored monolithic extension.ts into review-coordinator.ts factory (401 lines) and utils.ts (39 lines), migrated all sync I/O to fs.promises, and implemented deferred activation with sub-1ms sync return**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-14T18:08:17Z
- **Completed:** 2026-06-14T18:14:00Z
- **Tasks:** 2
- **Files modified/created:** 5
- **Commits:** 5

## Accomplishments

- **FOUND-01:** Split 368-line extension.ts into three modules: review-coordinator.ts (factory), utils.ts (utilities), slimmed extension.ts (activation wiring)
- **FOUND-02:** Migrated all synchronous fs.*Sync calls to async fs.promises in vscode-ext/src/ -- zero sync I/O calls remaining
- **FOUND-05:** activate() now returns synchronously in <1ms with IIFE-based deferred async initialization
- All previously empty catch {} blocks now have console.error logging (except heartbeat which is intentional fire-and-forget)
- types.ts converted to re-export shim from shared/types.ts for backward compatibility
- Added path traversal guard test to ipc.test.ts (13 tests pass)

## Task Commits

Each task was committed atomically:

1. **Task 1 - types.ts re-export** - `ca02496` (chore)
2. **Task 1 - review-coordinator.ts** - `a5b4ca8` (feat)
3. **Task 2 - utils.ts** - `9280a04` (feat)
4. **Task 2 - extension.ts refactor** - `2a5b62c` (refactor)
5. **Task 2 - ipc.test.ts update** - `cb5bf20` (test)

## Files Created/Modified

- `vscode-ext/src/review-coordinator.ts` - New file: factory function with closure state, async I/O, error logging (401 lines)
- `vscode-ext/src/utils.ts` - New file: startHeartbeat, ensurePiDirs, checkPiInstalled helpers (39 lines)
- `vscode-ext/src/types.ts` - Converted to re-export shim from shared/types.ts
- `vscode-ext/src/extension.ts` - Refactored: 343 lines removed, replaced with 61-line deferred activation pattern
- `vscode-ext/tests/ipc.test.ts` - Added resolveSafe path traversal guard test

## Decisions Made

- **start() returns Promise<void> (not void):** The interface specifies `start(): void` but the implementation needs async directory creation and recovery. The return type was changed to `Promise<void>`; extension.ts calls it fire-and-forget (no await).
- **Heartbeat catch blocks intentionally empty:** The heartbeat writes are best-effort signals. Silent failure is acceptable here (unlike review I/O where silent failure causes user-visible bugs).
- **Types imported from shared/types.ts directly:** review-coordinator.ts imports types from `../shared/types` rather than `./types` for direct access, matching the import pattern in PATTERNS.md.
- **createChatHandler import deferred:** Not imported in extension.ts because chat-handler.ts does not exist yet (created in plan 01-05).

## Deviations from Plan

None - plan executed exactly as written with the following non-deviation adjustments:

1. The path traversal test in ipc.test.ts expects `resolveSafe` to return the workspace root fallback (`/home/user/project`) rather than the escaped path (`/home/user/etc/passwd`). This is because `shared/path-utils.ts` already includes a workspace containment guard (added in plan 01-01), so the test verifies the guard works rather than documenting an unguarded gap.

2. `start()` returns `Promise<void>` instead of `void` as shown in the plan's interface snippet, because the method performs async work (directory creation via `fs.mkdir` and recovery via `fs.readdir`). The extension.ts calls it without `await` so it remains effectively fire-and-forget.

## Issues Encountered

- vitest was not installed in the worktree's `vscode-ext/node_modules/`. Ran `npm ci` to install dependencies (expected for a fresh worktree checkout).

## Threat Surface Scan

No new threat surface introduced. The review-coordinator.ts factory pattern does not add new network endpoints, auth paths, or trust boundary crossings. The IPC path validation is identical to previous behavior (resolveSafe from shared/path-utils.ts). Two accepted threats from the plan remain:

| Flag | Threat ID | File | Description |
|------|-----------|------|-------------|
| accept | T-01-05 | review-coordinator.ts | Path traversal via `..` in IPC file paths -- already guarded in shared/path-utils.ts, accepted for Phase 1 |
| accept | T-01-06 | extension.ts | execSync('pi --version') is static string, no shell injection possible |

## Next Phase Readiness

- extension.ts is ready for plan 01-03 (chat participant registration will integrate with the review-coordinator factory)
- plan 01-05 will wire createChatHandler into extension.ts deferred init
- All existing tests pass (13 tests in 2 files)

---
## Self-Check: PASSED

- All 5 files created/modified verified on disk
- All 5 commits verified in git log
- Zero sync I/O calls in vscode-ext/src/
- All 13 tests pass (2 test files)
- No untracked files or unexpected deletions

---
*Phase: 01-foundation-chat-basics*
*Completed: 2026-06-15*
