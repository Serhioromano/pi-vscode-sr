---
phase: 02
slug: rich-chat-experience
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.8 |
| **Config file** | `vscode-ext/vitest.config.ts` (from Phase 1) |
| **Quick run command** | `cd vscode-ext && npx vitest run --changed` |
| **Full suite command** | `cd vscode-ext && npx vitest run --reporter verbose` |

---

## Sampling Rate

- **After every task commit:** Run `cd vscode-ext && npx vitest run --changed`
- **After every wave merge:** Run `cd vscode-ext && npx vitest run --reporter verbose`
- **Phase gate:** Full suite green before `/gsd-verify-work`

---

## Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | Status |
|--------|----------|-----------|-------------------|--------|
| CHAT-02 | Slash command passthrough — prompt sent as-is without parsing | unit | `npx vitest run tests/chat-handler.test.ts` | Wave 0 |
| CHAT-03 | `mapAgentEventToAction` handles `text_delta` progressively | unit | `npx vitest run tests/event-mapper.test.ts` | Wave 0 (extend existing) |
| CHAT-03 | `StreamAction` correctly renders markdown fragments | unit | `npx vitest run tests/event-mapper.test.ts` | Wave 0 |
| CHAT-03 | Tool visibility: verbose mode emits `<details>` HTML, quiet mode silences | unit | `npx vitest run tests/event-mapper.test.ts` | Wave 0 |
| CHAT-05 | File-based IPC unchanged — `.pi/` protocol not modified | manual | `grep -r "\.pi/" vscode-ext/src/ --exclude review-coordinator` | N/A |
| D-04/D-05 | Interruption: abort kills stream, followUp queues | unit mock | `npx vitest run tests/chat-handler.test.ts` | Wave 0 |
| D-11 | `RpcUiHandler` maps select/confirm/input/notify to correct VS Code API | unit | `npx vitest run tests/rpc-ui-handler.test.ts` | Wave 0 |
| D-07 | `request.prompt` sent verbatim to `processManager.prompt()` | unit | `npx vitest run tests/chat-handler.test.ts` | Wave 0 |

---

## Wave 0 Gaps

- [ ] `vscode-ext/tests/chat-handler.test.ts` — covers CHAT-02 passthrough, CHAT-03 progressive streaming, D-04/D-05 interruption
- [ ] `vscode-ext/tests/rpc-ui-handler.test.ts` — covers D-11 mapping of select/confirm/input/notify
- [ ] `vscode-ext/tests/event-mapper.test.ts` extension — add tests for tool visibility modes (verbose HTML output, quiet mode silence)

---

## Security Domain

No new security enforcement mechanisms are introduced in Phase 2. This phase relies entirely on:
- VS Code's existing `window.showQuickPick()` / `showInputBox()` dialog sandbox (user interaction required, no programmatic bypass)
- VS Code's DOMPurify-based markdown HTML sanitizer (when `supportHtml = true`, only allowed tags survive)
