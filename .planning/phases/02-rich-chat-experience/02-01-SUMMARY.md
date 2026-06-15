---
phase: 02-rich-chat-experience
plan: 01
subsystem: vs-code-extension
tags:
  - pi-sdk
  - rpc
  - settings
  - contributes-configuration

# Dependency graph
requires:
  - phase: 01-foundation-chat-basics
    provides: chat-handler, event-mapper, pi-process-manager, @pi chat participant

provides:
  - PiProcessManager interface extended with getCommands, followUp, sendRpcMessage methods
  - contributes.configuration with pi.chat.toolVisibility and pi.chat.interruptionBehavior
  - RPC UI handler factory (createRpcUiHandler) for extension_ui_request events

affects:
  - 02-02-wave2-streaming
  - 02-03-wave2-interrupt
  - 02-04-wave2-followup

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Factory pattern for RPC UI handler: createRpcUiHandler(sendResponse) returning async RpcUiHandler"
    - "Local interface declarations to avoid Pi SDK subpath import complications"
    - "Fire-and-forget vs Promise-wrapped stdin write patterns for RPC response types"

key-files:
  created:
    - vscode-ext/src/rpc-ui-handler.ts
  modified:
    - vscode-ext/src/pi-process-manager.ts
    - vscode-ext/package.json

key-decisions:
  - "Used local RpcSlashCommand interface with sourceInfo: any instead of importing from SDK subpath (not exported from main entrypoint, subpath not in package exports map)"
  - "Stdin capture via (state.client as any).process?.stdin — the RpcClient class stores the child process reference in a private field; cast-to-any is the pragmatic access pattern"
  - "followUp wraps SDK call in try/catch with console.warn — best-effort by design (non-critical for chat UX)"
  - "sendRpcMessage uses Promise-wrapped write() for select/confirm/input/editor; notify is fire-and-forget with no promise"

requirements-completed: [CHAT-05]

# Metrics
duration: 8min
completed: 2026-06-15
---

# Phase 02 Plan 01: Infrastructure Layer Summary

**PiProcessManager interface extended with getCommands/followUp/sendRpcMessage, pi.chat.* VS Code settings contributed, createRpcUiHandler factory module for VS Code native dialog mapping of Pi extension_ui_request events**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-15T10:47:00Z
- **Completed:** 2026-06-15T10:55:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Extended PiProcessManager interface and factory implementation with getCommands(), followUp(), and sendRpcMessage() — delegates to underlying RpcClient methods and adds child process stdin capture for extension UI response writes
- Added contributes.configuration section to package.json with pi.chat.toolVisibility (verbose/quiet) and pi.chat.interruptionBehavior (abort/followUp) — the first VS Code settings for the extension
- Created rpc-ui-handler.ts module with createRpcUiHandler factory that maps Pi extension_ui_request methods (select, confirm, input, editor, notify) to corresponding VS Code native dialog APIs (showQuickPick, showInformationMessage, showInputBox)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend PiProcessManager interface** - `550cf38` (feat)
2. **Task 2: Contribute VS Code settings** - `5dada8d` (feat)
3. **Task 3: Create RPC UI handler factory module** - `b1e5e62` (feat)

## Files Created/Modified

- `vscode-ext/src/pi-process-manager.ts` - Added RpcSlashCommand/RpcExtensionUIResponse local interfaces, stdin field to state, getCommands/followUp/sendRpcMessage to interface and factory return object
- `vscode-ext/package.json` - Added contributes.configuration with pi.chat.toolVisibility and pi.chat.interruptionBehavior
- `vscode-ext/src/rpc-ui-handler.ts` - New module exporting createRpcUiHandler factory mapping RPC extension_ui_request methods to VS Code native dialog APIs

## Decisions Made

- Used local interface for RpcSlashCommand with `sourceInfo: any` — the Pi SDK type is exported from a subpath module not in the package exports map; local interface avoids import resolution failure in CommonJS
- sendRpcMessage blocks on stdin write completion for select/confirm/input/editor (must wait before Pi continues); notify is fire-and-forget (no response expected)
- ignoreFocusOut: true on all dialogs — prevents accidental dismissal when VS Code loses focus
- editor method uses single-line showInputBox per UI-SPEC Phase 2 limitation; Phase 3 may upgrade to multi-line

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- RpcSlashCommand.sourceInfo type mismatch: The local interface initially used `{ name: string; displayName?: string; }` which didn't match the Pi SDK's SourceInfo type (`{ path, source, scope, origin, baseDir? }`). Fixed by using `any` for structural compatibility with the unimportable SDK type
- Subpath import `@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-types` failed to resolve in vscode-ext's CommonJS module resolution — confirmed the package exports map only exposes `.` and `./hooks`

## Next Phase Readiness

- Wave 2 plans (02-02, 02-03, 02-04) can import rpc-ui-handler.ts and use the updated PiProcessManager interface
- getCommands() enables slash command autocomplete in chat (when VS Code Chat API supports it)
- followUp() enables the "followUp" interruption behavior mode
- sendRpcMessage() enables VS Code to respond to Pi extension_ui_request events
- pi.chat.* settings are available for end-user configuration

## Self-Check: PASSED

- All 4 claimed files exist
- All 3 commits exist (550cf38, 5dada8d, b1e5e62)

---
*Phase: 02-rich-chat-experience*
*Completed: 2026-06-15*
