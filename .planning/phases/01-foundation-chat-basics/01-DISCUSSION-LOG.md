# Phase 1: Foundation + Chat Basics - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 1-Foundation + Chat Basics
**Areas discussed:** Module organization style, Pi process lifecycle, Shared code strategy, Refactoring depth

---

## Module Organization Style

**Q1: Function-based modules or class-based services?**

| Option | Description | Selected |
|--------|-------------|----------|
| Function-based | Module-scoped functions + state via closures. Matches existing codebase. | ✓ |
| Class-based services | Classes with constructor DI. Easier to test but new pattern. | |
| Hybrid | Classes for stateful, functions for stateless. | |

**Q2: Module-level state vs factory functions?**

| Option | Description | Selected |
|--------|-------------|----------|
| Factory functions | `createXxx(opts)` returns `{ methods, state }` via closure. Testable. | ✓ |
| Module-level state | `let`/`const` at module scope (current pattern). | |

**Q3: Flat files vs subdirectories?**

| Option | Description | Selected |
|--------|-------------|----------|
| Flat domain files | `pi-process-manager.ts`, `event-mapper.ts`, etc. in `vscode-ext/src/` | ✓ |
| Subdirectories | `src/chat/`, `src/process/`, etc. | |

**Q4: Orchestrator activation vs minimal extraction?**

| Option | Description | Selected |
|--------|-------------|----------|
| Orchestrator pattern | Thin `activate()` that wires factories, returns <1ms | |
| Minimal extraction | Keep `activate()` structure, delegate to module functions | ✓ |

---

## Pi Process Lifecycle

**Q1: When should the Pi process start?**

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy on first @pi message | Zero overhead until used. Startup latency on first message. | ✓ |
| Eager on activation | Always ready, but memory cost even if unused. | |
| Hybrid | Background start during activation, "connecting..." if not ready. | |

**Q2: What happens on Pi process crash?**

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-restart with message | Restart automatically, show "restarted" in chat. | |
| Show error, user re-invokes | Error message, user sends another message to restart. | |
| Auto-restart silently | Restart without notification. | |

**User's choice (free-text):** "Pi allow restart current session with `pi -c`. We need to let user know though that there was a crash for debugging purpose."
→ Show crash visibly (with stderr), mention `pi -c` for session resume, user reconnects by sending another message.

**Q3: How to discover the Pi CLI path?**

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect from PATH | Check `pi --version`, show setup message if missing. | ✓ |
| VS Code setting | `pi.cliPath` setting for explicit configuration. | |

**User's choice (free-text):** "Pi have to be installed. We may check `pi --version` to see if pi command is available. Or you suggest to install pi Agent executable with extension?"

Claude recommended: Check `pi --version` — don't bundle Pi. Reasoning: Pi is independently installed by terminal users, bundling would balloon extension size and create update coupling.

**Q4: Pi process on workspace switch?**

| Option | Description | Selected |
|--------|-------------|----------|
| Stop on switch | Kill old process, start new for new workspace. | |
| Keep running, warn | Keep original, warn if user tries @pi elsewhere. | |
| Single workspace only | Only activate for first workspace. | |

**User's choice (free-text):** "Can we save session with a workspace name and if switch back to that workspace restore that particular session. So we isolate workspaces but do not lose progress when switch."
→ Workspace-isolated sessions with persistence. Save on switch, restore on return.

---

## Shared Code Strategy

**Q1: How to handle shared code?**

| Option | Description | Selected |
|--------|-------------|----------|
| shared/ dir with dual compilation | One source, compile to ESM + CJS. | |
| Keep duplicating | Current approach. Zero build complexity but tech debt. | |
| Third npm package | `@pi-vscode-shared/types`. Versioned but heavy. | |

**User's choice:** `shared/` dir at project root with types, IPC constants, and path utils.

**Q2: What lives in shared/?**

| Option | Description | Selected |
|--------|-------------|----------|
| Types + IPC constants | Interfaces + `.pi/` path constants + JSON schemas. | |
| Types only | Just TypeScript interfaces. | |
| Types + IPC + path utils | Full shared surface including `resolveSafe` and helpers. | ✓ |

**Q3: How to handle ESM vs CJS compilation?**

| Option | Description | Selected |
|--------|-------------|----------|
| Dual emit | Compile to both .mjs and .js. | |
| Project references | TypeScript project references between packages. | |
| CJS only everywhere | Compile shared as CJS, ESM interop handles the rest. | |

**User's choice (free-text):** "Use import export everywhere. VS Code does not require CJS — it works with ESM just fine."
→ ESM `import`/`export` everywhere. No dual compilation needed.

---

## Refactoring Depth

**Q1: How deep should vscode-ext refactoring go?**

| Option | Description | Selected |
|--------|-------------|----------|
| Moderate | Extract to files, fix sync I/O and empty catches. | |
| Minimal | Move code to files, don't change logic. | |
| Deep | Restructure internal APIs, error boundaries, retry logic. | ✓ |

**Q2: Should Pi extension also be refactored?**

| Option | Description | Selected |
|--------|-------------|----------|
| Refactor Pi extension too | Same deep treatment for `src/index.ts`. | ✓ |
| Minimal touch | Only extract shared types. | |
| Don't touch | Leave Pi extension for Phase 3. | |

**User's choice (free-text):** "Yes refactor it but please start with creating a separate branch for that phase, so if it fails nothing is touched what we have now."
→ Both packages refactored. Dedicated git branch for safety.

**Q3: Add test infrastructure?**

| Option | Description | Selected |
|--------|-------------|----------|
| Add tests for new code | Test runner + tests for EventMapper, utils, IPC validation. | ✓ |
| Test infrastructure only | Set up runner + config, one example test. | |
| Defer testing | Separate phase for test coverage. | |

---

## Claude's Discretion

No areas were delegated to Claude — all decisions were user-confirmed. Claude recommended:
- Check `pi --version` rather than bundling Pi (user accepted)
- ESM everywhere rather than dual compilation (user independently suggested this)

## Deferred Ideas

None — discussion stayed within Phase 1 scope.
