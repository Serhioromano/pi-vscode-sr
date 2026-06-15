---
phase: 02-rich-chat-experience
plan: 02
subsystem: ui
tags: event-mapper, tool-visibility, collapsible-sections, html-markdown
requires:
  - phase: 01-foundation-chat-basics
    provides: event-mapper with StreamAction type, mapAgentEventToAction, applyStreamAction, streamEvents
provides:
  - ToolVisibility type for user-configurable tool output ('verbose' | 'quiet')
  - Per-execution tool buffering via module-level toolBuffer
  - Collapsible <details>/<summary> HTML sections for verbose tool rendering
  - Quiet mode that suppresses all tool execution output
affects:
  - chat-handler streaming (Plan 02-03) — consumes ToolVisibility and MarkdownString actions
  - settings wiring (Plan 02-04) — consumes ToolVisibility type for configuration
tech-stack:
  added: []
  patterns:
    - Event buffering between tool_execution_start and tool_execution_end for single-block emission
    - HTML-in-MarkdownString with supportHtml=true for collapsible sections
    - Module-level mutable state (toolBuffer) following existing project pattern
    - vi.mock('vscode') for testing code that imports vscode module at value level
key-files:
  created: []
  modified:
    - vscode-ext/src/event-mapper.ts
    - vscode-ext/tests/event-mapper.test.ts
key-decisions:
  - "Tool events are buffered per-execution and emitted as a single <details>/<summary> block at tool_execution_end, avoiding per-update partial output (Pitfall 3 mitigation)"
  - "MarkdownString with supportHtml=true is used to render HTML collapsible sections through VS Code's DOMPurify sanitizer"
  - "Quiet mode suppresses all tool output including the initial progress indicator, showing only 'Pi is working...'"
  - "ToolVisibility defaults to 'verbose' for backward compatibility with 1-arg callers"
  - "vscode module is mocked in tests via vi.mock() since vscode is only available in the extension host"
patterns-established:
  - "Tool execution buffering: module-level variable accumulates partial results, reset on tool_execution_end, message_end, and agent_end"
  - "HTML sanitization: HTML content is controlled (tool name, partial results from Pi agent), passed through escapeHtml for safe embedding"
  - "Test mocking pattern: vi.mock('vscode') provides minimal MarkdownString stand-in for unit tests"
requirements-completed:
  - CHAT-03
duration: 6min
completed: 2026-06-15
---

# Phase 02 Plan 02: Tool Visibility and Collapsible Sections

**Event-mapper upgraded with ToolVisibility type, per-execution tool buffering, and <details>/<summary> collapsible HTML sections replacing the old error placeholder text**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-15T16:48:00Z
- **Completed:** 2026-06-15T16:54:00Z
- **Tasks:** 2 (feat, test)
- **Files modified:** 2

## Accomplishments

- Exported `ToolVisibility` type (`'verbose' | 'quiet'`) for user-configurable tool output
- Added module-level `toolBuffer` that accumulates partial results between `tool_execution_start` and `tool_execution_end`, emitting a single complete MarkdownString `<details>`/`<summary>` block
- Quiet mode (`toolVisibility: 'quiet'`) suppresses all tool execution output entirely
- Backward-compatible signature: `mapAgentEventToAction(event)` with 1 arg defaults to verbose mode
- All 24 tests pass covering verbose HTML output, quiet mode silence, backward-compatible 1-arg calls, and buffer reset on `message_end`/`agent_end`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ToolVisibility type, tool buffering, and collapsible HTML sections to event-mapper.ts** - `100a753` (feat)
2. **Task 2: Update event-mapper tests for tool visibility and buffering** - `1967250` (test)

## Files Created/Modified

- `vscode-ext/src/event-mapper.ts` - ToolVisibility type, toolBuffer, escapeHtml, buildToolSection helpers; updated mapAgentEventToAction signature with toolVisibility parameter; event handlers rewritten for buffering
- `vscode-ext/tests/event-mapper.test.ts` - 8 new tool visibility tests (verbose/quiet/backward-compat), 2 buffer reset tests, 1 MarkdownString applyStreamAction test; vi.mock('vscode') for test isolation; updated old tests to match new action shapes

## Decisions Made

- Tool buffer is module-level (following project convention for mutable state: `let toolBuffer = null`) rather than passed through function args, keeping the public API clean
- `buildToolSection` and `escapeHtml` are private (not exported) — pure helpers for the module
- Quiet mode suppresses even the initial "Tool: {name}" progress indicator, showing only the general "Pi is working..." progress from `agent_start`
- `vi.mock('vscode')` in the test file provides a minimal MockMarkdownString class, avoiding dynamic imports or conditional require patterns in the source

## Deviations from Plan

None - plan executed as written.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vscode module not available in test runtime**
- **Found during:** Task 2 (test execution)
- **Issue:** Event-mapper.ts imports `MarkdownString` as a value from `vscode`, but the module is unavailable outside the VS Code extension host. Test runner failed with `ERR_MODULE_NOT_FOUND`.
- **Fix:** Added `vi.mock('vscode', () => { MarkdownString: class MockMarkdownString { ... } })` at the top of the test file, providing the minimal class shape needed for construction and property access.
- **Files modified:** vscode-ext/tests/event-mapper.test.ts
- **Verification:** All 24 tests pass with mocked vscode module
- **Committed in:** `1967250` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The `vi.mock` pattern is necessary for testing code that value-imports from vscode. No scope creep.

## Issues Encountered

- The `vscode` module is only available inside the VS Code extension host. Testing code that value-imports from `vscode` (like `MarkdownString`) requires `vi.mock('vscode', ...)` in the test file. This pattern is now established and can be reused for other test files that import vscode values.
- The test file must import from `vitest` (not `@jest/globals`) for `vi.mock` to work.

## Known Stubs

None - all tool execution content renders from actual event data with no hardcoded placeholders.

## Threat Flags

None - no new security surface introduced beyond the accepted T-02-03 (HTML output through DOMPurify).

## Next Phase Readiness

- Plan 02-03 (chat-handler streaming) can consume `ToolVisibility` type and the updated `mapAgentEventToAction` with MarkdownString-returning tool sections
- Plan 02-04 (settings wiring) can consume `ToolVisibility` for user configuration
- The `streamEvents` function retains full backward compatibility (uses default verbose mode)

---
*Phase: 02-rich-chat-experience*
*Completed: 2026-06-15*
