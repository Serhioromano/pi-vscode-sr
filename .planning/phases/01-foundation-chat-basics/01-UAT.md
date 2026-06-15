---
status: complete
phase: 01-foundation-chat-basics
source: 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md, 01-GAP-FIX-SUMMARY.md
started: 2026-06-15T13:27:00Z
updated: 2026-06-15T15:00:00Z
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
result: pass
fix: GAP-FIX — chat-handler.ts checks getState() before showing "Starting Pi..."
previous_result: issue

### 4. Pi Crash Recovery
expected: With @pi active and responding, kill the Pi process. Send another message to @pi. An error appears in chat with "Send another message to restart." No pi -c terminal guidance (irrelevant for RPC-based Chat integration). Liveness check times out in 2s instead of hanging.
result: pass
fix: GAP-FIX — pi-process-manager.ts adds liveness check with 2s timeout, chat-handler.ts catch block renders crash error without pi -c
previous_result: issue

### 5. Workspace Switch Restarts Pi
expected: With @pi active in one workspace, switch to a different workspace folder. The Pi process from the previous workspace should stop. Send a message to @pi in the new workspace — a fresh Pi process should lazy-start (showing "Starting Pi..." again).
result: skipped
reason: skipped by user

## Summary

total: 5
passed: 4
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

- truth: "Subsequent messages skip lazy start — 'Starting Pi...' only appears on first message"
  status: resolved
  reason: "GAP-FIX: chat-handler.ts checks getState() before showing progress. Test 3 re-tested and passed."
  severity: major
  test: 3
  resolved_by: 01-GAP-FIX
- truth: "Killing Pi process shows error in chat with recovery guidance"
  status: resolved
  reason: "GAP-FIX: pi-process-manager.ts adds liveness check with 2s timeout. chat-handler.ts catch block renders crash error. Test 4 re-tested and passed."
  severity: major
  test: 4
  resolved_by: 01-GAP-FIX

