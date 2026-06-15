---
status: complete
phase: 02-rich-chat-experience
source:
  - 02-01-SUMMARY.md
  - 02-02-SUMMARY.md
  - 02-03-SUMMARY.md
  - 02-04-SUMMARY.md
started: 2026-06-15T11:30:00Z
updated: 2026-06-15T11:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start: Extension Activates Clean
expected: |
  TypeScript compiles (0 errors), all 45 tests pass, extension packages without errors.
result: pass

### 2. Streaming Token-by-Token Responses
expected: |
  Open VS Code with the extension installed. Type `@pi` in Chat panel and send any prompt.
  Response text appears progressively (token-by-token) rather than arriving as a single block.
  The progress indicator "Pi is working..." appears while Pi processes.
result: pass

### 3. Slash Command Passthrough
expected: |
  In @pi chat, type `/help` and send. Pi receives the command verbatim and responds with
  available commands list. Try `/model` — Pi responds with current model info.
  The extension does not parse or intercept the slash command — it's sent as-is.
result: pass

### 4. Tool Visibility: Verbose Mode (Collapsible Sections)
expected: |
  Set `pi.chat.toolVisibility` to `"verbose"` in VS Code settings.
  Send a prompt that causes Pi to use tools (e.g., "read the README.md file").
  In the streaming response, tool executions appear as collapsed `<details>` sections.
  Clicking a section expands it to show tool details. Sections show tool name in summary.
result: issue
reported: "In both modes I see just gray lines looks like empty boxes where information supposed to be"
severity: major

### 5. Tool Visibility: Quiet Mode
expected: |
  Set `pi.chat.toolVisibility` to `"quiet"`.
  Send a prompt that causes Pi to use tools.
  Only "Pi is working..." progress appears — no tool details are shown.
result: pass

### 6. Mid-Response Interruption (Abort)
expected: |
  Set `pi.chat.interruptionBehavior` to `"abort"`.
  Send a prompt that takes time (e.g., "analyze all TypeScript files in the project").
  While Pi is still streaming, send another message (e.g., "stop and say hello").
  The first response stops immediately. Pi responds to the new message.
result: pass

### 7. VS Code Settings Registered
expected: |
  Open VS Code Settings UI (Ctrl+,). Search for "pi.chat".
  Two settings appear: `Pi › Chat: Tool Visibility` (verbose/quiet) and
  `Pi › Chat: Interruption Behavior` (abort/followUp).
  Both have descriptions and default values.
result: pass

### 8. Slash Command /help Followup Button
expected: |
  After any @pi response completes, a "/help" followup button appears below the response.
  Clicking it sends "/help" to Pi and shows available commands.
result: issue
reported: "no button"
severity: major

### 9. Terminal TUI Preserved (File-Based IPC)
expected: |
  The `.pi/review-requests/` and `.pi/review-results/` IPC protocol is unchanged.
  Running `pi` in terminal (not through VS Code chat) still triggers TUI review dialogs.
  No file-based IPC paths or schemas were modified by Phase 2 changes.
result: pass

## Summary

total: 9
passed: 7
issues: 2
pending: 0
skipped: 0

## Gaps

- truth: "In verbose mode, tool executions appear as collapsed `<details>` sections with tool name in summary. Clicking expands to show details."
  status: failed
  reason: "User reported: In both modes I see just gray lines looks like empty boxes where information supposed to be"
  severity: major
  test: 4
  artifacts: []
  missing: []

- truth: "After any @pi response completes, a '/help' followup button appears below the response."
  status: failed
  reason: "User reported: no button"
  severity: major
  test: 8
  artifacts: []
  missing: []
