---
status: complete
phase: 01-foundation-chat-basics
source: 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md
started: 2026-06-15T13:27:00Z
updated: 2026-06-15T13:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. @pi Participant Visible in VS Code Chat
expected: After loading the vscode-pi-sr extension in VS Code, open the Chat panel (Ctrl+Shift+I or View > Chat). Type @ in the chat input and verify "pi" appears in the participant list with fullName "Pi Agent". The participant should be sticky (isSticky: true) so it remains selected after use.
result: pass

### 2. Send Message to @pi and Receive Response
expected: Select @pi participant in the Chat panel. Send a message (e.g., "hello"). On first message, expect to see "Starting Pi..." progress indicator, followed by "Pi is working...", then a response from the Pi agent with markdown content.
result: pass

### 3. Subsequent Messages Skip Lazy Start
expected: After completing test 2, send another message to @pi (e.g., "how are you"). This time, "Starting Pi..." should NOT appear — Pi is already running. The response should come back faster since the Pi process is already alive.
result: issue
reported: "Every time I start a message it writes Starting Pi... Pi is working..."
severity: major

### 4. Pi Crash Recovery
expected: With @pi active and responding, kill the Pi process (e.g., `pkill -f "pi "` or similar). Send another message to @pi. An error should appear in the chat with recovery instructions mentioning `pi -c` for recovery guidance.
result: issue
reported: "still Starting Pi... Pi is working."
severity: major

### 5. Workspace Switch Restarts Pi
expected: With @pi active in one workspace, switch to a different workspace folder. The Pi process from the previous workspace should stop. Send a message to @pi in the new workspace — a fresh Pi process should lazy-start (showing "Starting Pi..." again).
result: skipped
reason: skipped by user

## Summary

total: 5
passed: 2
issues: 2
pending: 0
skipped: 1
blocked: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Subsequent messages skip lazy start — 'Starting Pi...' only appears on first message"
  status: failed
  reason: "User reported: Every time I start a message it writes Starting Pi... Pi is working..."
  severity: major
  test: 3
  artifacts: []
  missing: []
- truth: "Killing Pi process shows error in chat with pi -c recovery guidance"
  status: failed
  reason: "User reported: still Starting Pi... Pi is working."
  severity: major
  test: 4
  artifacts: []
  missing: []

