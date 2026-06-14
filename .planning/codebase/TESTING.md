# Testing Patterns

**Analysis Date:** 2026-06-14

## Overview

**No test framework is configured.** There are no test files, no test runner configuration, and no test scripts in any `package.json`.

## Test Framework

**None detected:**
- No Jest configuration (`jest.config.*`)
- No Vitest configuration (`vitest.config.*`)
- No Mocha configuration
- No Playwright/Cypress configuration
- No test runner dependency in any `package.json` (`devDependencies` or `dependencies`)

**Result:** The project has zero automated testing infrastructure.

## Test File Organization

**Not applicable.** No test directories or test files exist outside `node_modules`.

The project source tree is:

```
src/
  index.ts              # Pi extension entry point (471 lines)
vscode-ext/src/
  extension.ts          # VSCode extension entry point (369 lines)
  types.ts              # Shared type definitions (~36 lines)
```

There are no `*.test.*`, `*.spec.*` files, no `__tests__/` directories, no `tests/` directory.

## How to Run Tests

**The `Makefile` has a `test` target:**

```makefile
test:
    @echo "Running tests..."
    cd /tmp && pi -e ~/www/pi-vscode-sr/src/index.ts --no-extensions
```

This is an **integration smoke test** that runs the Pi extension in a temporary directory with `--no-extensions`. It validates that the extension loads without errors. This is not a unit test.

There is no `npm test` script in either `package.json`.

## Testing Methodology

**Manual testing only.** Documented in `PROMPT.md`:

1. Launch VSCode extension in debug mode (F5 from VSCode).
2. Test window opens with workspace at `/home/sergey/www/vscode-st`.
3. Run `pi -e ~/www/pi-vscode-sr/src/index.ts --no-extensions` inside the test window.
4. Send a prompt to the Pi agent.
5. Observe behavior in diff editor and approve/reject.
6. Verify file was modified or left unchanged.

This is purely exploratory manual testing with no assertions, expected outputs, or test cases.

## Test Types Present

| Type | Present | Details |
|------|---------|---------|
| Unit tests | None | No test files |
| Integration tests | None | No test files |
| E2E tests | None | No test files |
| Manual smoke test | Partial | `make test` loads extension, `PROMPT.md` describes manual workflow |

## Coverage

**No coverage tool configured.** No Istanbul (nyc), c8, or any coverage tool in `devDependencies`. No coverage thresholds.

## Mocking

**Not applicable.** No test framework exists to mock with. No test doubles.

## Fixtures and Factories

**Not applicable.** No test fixtures or factories exist.

## Test Quality Assessment

**Zero automated tests exist.**

**What should be tested:**

1. **`src/index.ts`:**
   - `isVscodeReady()` - timestamp validation logic (file exists, within 30s, NaN)
   - `resolveSafe()` - path normalization with/without leading slash
   - `createReviewAndWait()` - state machine transitions (approved, rejected, timeout, rethink, abort, approve-all)
   - `applyEdits()` - text replacement, uniqueness check, error on duplicate
   - `writeSyncResult()` - result file format
   - `pollResultFile()` - polling loop, deadline enforcement, partial file handling
   - `showTuiSelector()` - each menu choice leads to correct outcome
   - `registerWriteOverride()` / `registerEditOverride()` - tool registration
   - `cleanupPiDir()` - directory cleanup logic
   - Event handlers: `session_start`, `before_agent_start`, `message_end`

2. **`vscode-ext/src/extension.ts`:**
   - `resolveSafe()` - path normalization in VSCode context
   - `handleRequest()` - JSON parsing error handling, fileSet dedup, diff opening
   - `getCurrentSession()` - tiered session lookup (active, visible editors, pending)
   - `approveCurrent()` / `rejectCurrent()` - file read/write, status, close tab
   - `checkReviewComplete()` - result formation, status aggregation, cleanup
   - `closeReviewTabs()` - tab group iteration, diff detection

3. **`vscode-ext/src/types.ts`:**
   - Type correctness - compile-time only, no runtime tests needed

## CI Configuration

**No CI configuration detected.** No `.github/workflows/`, `.gitlab-ci.yml`, or `Jenkinsfile`.

The Makefile-based publishing pipeline (`make publish`) is designed for local manual execution, not CI automation.

## Recommendations

1. **Add a test runner.** Vitest is recommended for ESM/CommonJS compatibility with the dual-module setup.

2. **Start with unit tests for pure functions.** The most testable modules:
   - `src/index.ts`: `isVscodeReady()`, `resolveSafe()`, `applyEdits()`, `writeSyncResult()`, `sleep()`
   - These have no VSCode or Pi-API dependencies.

3. **Mock VSCode API.** For `vscode-ext/src/extension.ts`, use `vi.mock('vscode', ...)` or the `vscode-uri` package as a stub.

4. **Test the review protocol.** The file-based protocol (write request JSON, poll for result JSON) is ideal for integration tests.

5. **Add `npm test` script.** Both `package.json` files should have a `"test"` script.

6. **Add CI for PRs.** GitHub Actions workflow to run tests on push/PR would catch regressions.

---

*Testing analysis: 2026-06-14*
