---
phase: 01-foundation-chat-basics
plan: 01
subsystem: foundation
tags: [typescript, vitest, shared-module, ipc, path-utils]

requires: []
provides:
  - shared/ module with IPC type definitions, path constants, and path utilities
  - Vitest test infrastructure with 12 passing unit tests
  - Phase 1 git branch for isolated development

affects: ["01-02", "01-03", "01-04", "01-05"]

tech-stack:
  added: [vitest ^4.1.8]
  patterns:
    - Factory closures over classes (D-02)
    - Defensive path traversal guards
    - ESM shared module consumed by CommonJS consumer

key-files:
  created:
    - shared/types.ts - IPC type definitions (ReviewFile, ReviewRequest, ReviewResult, etc.)
    - shared/ipc.ts - IPC path constants (IPC_BASE, IPC_REVIEW_REQUESTS, etc.)
    - shared/path-utils.ts - resolveSafe() path normalization with traversal guard
    - shared/tsconfig.json - separate tsconfig for shared/ compilation
    - vscode-ext/vitest.config.ts - vitest test framework configuration
    - vscode-ext/tests/path-utils.test.ts - 6 test cases for resolveSafe
    - vscode-ext/tests/ipc.test.ts - 6 test cases for IPC constants
  modified:
    - tsconfig.json (root) - added shared/ to include array
    - vscode-ext/package.json - added vitest devDependency
    - vscode-ext/package-lock.json - updated with vitest dependencies

key-decisions:
  - "resolveSafe uses (cwd, filePath) signature matching src/index.ts, more portable than the extension.ts workspaceRoot-only version"
  - "resolveSafe includes path-traversal guard (result.startsWith(cwd)) per threat model T-01-01"
  - "shared/ files use 2-space indent (vscode-ext convention) and ESM export syntax"
  - "shared/tsconfig.json targets ES2022 with NodeNext module resolution, compatible with both packages"

patterns-established:
  - "Shared module pattern: ESM exports consumed by both Pi extension (root/NodeNext) and VS Code extension (vscode-ext/CommonJS)"
  - "Defensive path normalization: resolveSafe handles absolute, relative, LLM-mangled, and traversal paths"
  - "Centralized IPC constants: single source of truth for .pi/ directory subpaths"

requirements-completed:
  - FOUND-01

duration: 8min
completed: 2026-06-15
---

# Phase 01 Plan 01: Shared Foundation Module Summary

**Shared types, IPC path constants, path utilities with traversal guard, and vitest test infrastructure for Phase 1**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-15T00:00:00Z (approx)
- **Completed:** 2026-06-15T00:08:00Z (approx)
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Created shared/ module with IPC type definitions (ReviewFile, ReviewRequest, ReviewResult, ReviewResultFile, FileStatus, DiffSession), path constants (IPC_BASE, IPC_REVIEW_REQUESTS, IPC_REVIEW_RESULTS, IPC_TMP, IPC_HEARTBEAT), and resolveSafe path normalization
- resolveSafe includes path-traversal guard (result.startsWith(cwd)) to prevent directory escape
- Root tsconfig.json now includes shared/ in compilation scope
- Vitest v4.1.8 installed and configured in vscode-ext with 12 passing tests
- Six resolveSafe test cases covering absolute, relative, LLM-mangled, trailing-slash, empty, and exact-cwd-match paths
- Six IPC constant test cases verifying all 5 constants and the ipcPath helper
- git branch gsd/phase-01-foundation-chat-basics created at HEAD

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared/ module** - `126c4fd` (feat)
2. **Task 2: Set up vitest, write tests, create git branch** - `929644f` (test)

## Files Created/Modified

- `shared/types.ts` - IPC type definitions (5 interfaces/types) migrated from vscode-ext/src/types.ts
- `shared/ipc.ts` - IPC path constants (5 string consts + ipcPath helper)
- `shared/path-utils.ts` - resolveSafe with absolute/relative/LLM-mangled/traversal-guard handling
- `shared/tsconfig.json` - ES2022, NodeNext, strict, declaration
- `tsconfig.json` (root) - added shared/**/*.ts to include array
- `vscode-ext/vitest.config.ts` - vitest config with globals, node environment, tests/ pattern
- `vscode-ext/tests/path-utils.test.ts` - 6 test cases for resolveSafe
- `vscode-ext/tests/ipc.test.ts` - 6 test cases for IPC constants and ipcPath
- `vscode-ext/package.json` - added vitest ^4.1.8 devDependency
- `vscode-ext/package-lock.json` - updated with vitest dependency tree

## Decisions Made

- resolveSafe uses `(cwd, filePath)` two-parameter signature (matching src/index.ts) rather than single-parameter workspaceRoot version from extension.ts
- Path-traversal guard added per threat model T-01-01: resolved path must be within the cwd
- shared/ files use 2-space indent (matching vscode-ext convention) and ESM export syntax (matching D-10)
- When filePath equals the cleaned cwd exactly (e.g., `resolveSafe('/home/user/project', 'home/user/project')`), the function returns cwd directly to avoid path doubling

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] resolveSafe exact-cwd-match returned doubled path**
- **Found during:** Task 2 (Test execution)
- **Issue:** Test 6 expected `resolveSafe('/home/user/project', 'home/user/project')` to return `/home/user/project`, but the implementation didn't handle the case where filePath equals cwdClean exactly (no trailing slash). The LLM-mangled check (`startsWith(cwdClean + '/')`) failed since no trailing `/` follows, and `resolve()` doubled the path.
- **Fix:** Added explicit check: if `filePath === cwdClean`, return cwd directly.
- **Files modified:** shared/path-utils.ts
- **Verification:** All 12 tests pass after fix
- **Committed in:** 929644f (Task 2 commit, amended implementation before staging)

**2. [Rule 2 - Missing Critical] Added path-traversal guard to resolveSafe**
- **Found during:** Task 1 (Implementation)
- **Issue:** Threat model T-01-01 specifies resolveSafe must validate resolved path stays within workspace directory. The source implementations (src/index.ts and extension.ts) lack this guard. Without it, a crafted path like `../../etc/passwd` could escape the workspace.
- **Fix:** Added `result.startsWith(cwd)` check after resolving. If traversal is detected, falls back to cwd.
- **Files modified:** shared/path-utils.ts
- **Verification:** resolveSafe no longer resolves paths starting with `../` outside the cwd
- **Committed in:** 126c4fd (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes necessary for correctness and security. No scope creep.

## Issues Encountered

- One test case (exact cwd match) revealed an edge case not handled by the plan's described logic; fixed with an additional equality check. All 6 plan-specified test cases pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- shared/ module ready for consumption by Plan 02 (refactor) and Plan 03 (chat participant)
- Vitest test infrastructure ready for all subsequent test writing
- resolveSafe path-traversal guard protects against directory escape
- git branch gsd/phase-01-foundation-chat-basics available for isolated Phase 1 development

## Self-Check: PASSED

All artifacts verified:
- shared/types.ts exports ReviewRequest, ReviewFile, ReviewResult, ReviewResultFile, FileStatus, DiffSession
- shared/ipc.ts exports IPC_BASE, IPC_REVIEW_REQUESTS, IPC_REVIEW_RESULTS, IPC_TMP, IPC_HEARTBEAT, ipcPath
- shared/path-utils.ts exports resolveSafe(cwd, filePath)
- shared/tsconfig.json: target ES2022, module NodeNext, strict true
- Root tsconfig.json includes shared/**/*.ts
- All shared/ files use 2-space indent and ESM export syntax
- No Russian comments in shared/types.ts
- Vitest installed in vscode-ext/package.json
- `npx vitest run` passes all 12 tests
- git branch gsd/phase-01-foundation-chat-basics exists

---
*Phase: 01-foundation-chat-basics*
*Plan: 01*
*Completed: 2026-06-15*
