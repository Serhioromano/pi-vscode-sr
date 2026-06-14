---
phase: 01
slug: foundation-chat-basics
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-14
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.8 |
| **Config file** | `vscode-ext/vitest.config.ts` (new) |
| **Quick run command** | `cd vscode-ext && npx vitest run --reporter verbose` |
| **Full suite command** | `cd vscode-ext && npx vitest run --reporter verbose` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd vscode-ext && npx vitest run --changed`
- **After every plan wave:** Run `cd vscode-ext && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | FOUND-04 | T-01-01 | mapAgentEventToAction is pure, no side effects | unit | `npx vitest run tests/event-mapper.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | FOUND-04 | T-01-01 | applyStreamAction applies to mock ChatResponseStream only | unit | `npx vitest run tests/event-mapper.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | FOUND-04 | T-01-01 | Edge cases: unexpected event types handled gracefully | unit | `npx vitest run tests/event-mapper.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 1 | FOUND-01 | T-01-02 | resolveSafe validates path is within workspace | unit | `npx vitest run tests/path-utils.test.ts` | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 1 | FOUND-01 | T-01-02 | IPC message validation rejects malformed JSON | unit | `npx vitest run tests/ipc.test.ts` | ❌ W0 | ⬜ pending |
| 01-05-01 | 05 | 2 | FOUND-03 | T-01-03 | createPiProcessManager factory returns expected API shape | unit | `npx vitest run tests/pi-process-manager.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vscode-ext/vitest.config.ts` — vitest configuration file
- [ ] `vscode-ext/tests/event-mapper.test.ts` — tests for pure event mapping functions
- [ ] `vscode-ext/tests/path-utils.test.ts` — tests for resolveSafe and path utilities
- [ ] `vscode-ext/tests/ipc.test.ts` — tests for IPC message validation
- [ ] `vscode-ext/tests/pi-process-manager.test.ts` — tests for PiProcessManager factory
- [ ] Framework install: `cd vscode-ext && npm install --save-dev vitest`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| VS Code Chat participant registers and accepts messages | CHAT-01 | Requires VS Code Extension Host | Launch extension in debug mode, open Chat panel, type `@pi hello`, verify response |
| Extension activates without "slow" warning | FOUND-02 | Requires VS Code Extension Host | Launch extension in debug mode, check Developer Tools console for no slow-activation warnings |
| File I/O uses async fs.promises | FOUND-03 | Pattern check (no sync I/O calls) | `grep -r "readFileSync\|writeFileSync\|existsSync\|mkdirSync" vscode-ext/src/` returns empty |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
