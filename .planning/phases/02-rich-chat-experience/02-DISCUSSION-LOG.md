# Phase 2: Rich Chat Experience - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 2-Rich Chat Experience
**Areas discussed:** Tool Execution Visibility, Mid-response Interruption, Slash Command UX, Terminal TUI Coexistence

---

## Tool Execution Visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Show everything progressively | Each tool start, partial progress, and completion appears in chat as it happens | |
| Compact one-liners only | Tool names only, no partial results | |
| Minimal — just "Pi is working..." | Only progress message, no tool details | |
| Context-aware visibility | Show only long-running (>2s) tools and errors | |

**User's choice:** Make it a VS Code configuration setting — let each user choose their preferred level of detail.

| Option | Description | Selected |
|--------|-------------|----------|
| Three levels: full / compact / minimal | full, compact, and minimal granularity | |
| Two levels: verbose / quiet | verbose = tool names + errors; quiet = just "Pi is working..." | ✓ |
| Per-category toggles | Separate boolean toggles for each aspect | |

**User's choice:** Two levels — verbose / quiet. Simple, less code.

| Option | Description | Selected |
|--------|-------------|----------|
| quiet (default) | Clean output by default, opt into verbose | |
| verbose (default) | Show tool activity by default, opt into quiet | ✓ |

**User's choice:** verbose (default). Users see what Pi is doing by default.

**Notes:** Tool execution sections in verbose mode should be **collapsible and collapsed by default** — user clicks to unfold and read details. Setting name: `pi.chat.toolVisibility`. Values: `"verbose"` | `"quiet"`. Use HTML `<details>`/`<summary>` if VS Code Chat renderer supports it.

---

## Mid-response Interruption

| Option | Description | Selected |
|--------|-------------|----------|
| Abort and restart fresh | New message kills current response, starts fresh | |
| Context-aware routing | / commands steer, regular messages queue | |
| Always steer | Redirect mid-response, keep context | |
| Always queue | Never interrupt, messages wait their turn | |

**User's choice:** Configurable via VS Code setting — don't force one workflow on all users.

| Option | Description | Selected |
|--------|-------------|----------|
| Three options: abort / steer / followUp | Full spectrum with steer for mid-stream redirection | |
| Two: abort vs queue | Simpler — abort (immediate) and followUp (patient) | ✓ |

**User's choice:** Two options — abort and followUp. Steer excluded for simplicity. Setting name: `pi.chat.interruptionBehavior`. Values: `"abort"` | `"followUp"`.

| Option | Description | Selected |
|--------|-------------|----------|
| abort (default) | Feels responsive, what most chat apps do | ✓ |
| followUp (default) | Safer, never loses work | |

**User's choice:** abort (default).

---

## Slash Command UX

| Option | Description | Selected |
|--------|-------------|----------|
| Pure passthrough | Send text as-is, Pi handles everything | |
| Passthrough + autocomplete hints | Fetch commands via getCommands(), show / suggestions in chat | ✓ |
| Passthrough + help command | Passthrough with a help response listing commands | |

**User's choice:** Passthrough + autocomplete hints. Commands still pass through to Pi as-is, but users get discoverability via autocomplete.

| Option | Description | Selected |
|--------|-------------|----------|
| Fetch once on activation | getCommands() once during deferred init | |
| Lazy fetch on first / | Fetch on first / keystroke, cache for session | |
| Fetch on each / keystroke | Re-fetch every time user types /, always up-to-date | ✓ |

**User's choice:** Fetch on each `/` keystroke. Commands always current. RPC is local, expected to be fast.

---

## Terminal TUI Coexistence

| Option | Description | Selected |
|--------|-------------|----------|
| Verify, don't build | Researcher validates TUI still works in RPC mode | |
| Handle RPC UI requests in chat | Build handlers for RpcExtensionUIRequest in chat | ✓ |
| Both paths, user chooses | Configurable preferred review path | |

**User's choice:** Handle RPC UI requests using VS Code's native UI API — `window.showQuickPick()` for selectors, `window.showInputBox()` for input, `window.showInformationMessage()` for notifications. NOT markdown buttons or custom webviews. Platform-native feel.

**Notes:** The RPC UI request handling pipeline should be established in Phase 2. Phase 3 builds on this for review-specific controls.

---

## Claude's Discretion

No areas were delegated to Claude — all decisions were user-confirmed.

## Deferred Ideas

- **`steer()` interruption mechanism** — Excluded for simplicity. Could be added as a third `pi.chat.interruptionBehavior` value if users request mid-response redirection that preserves context.
- **Per-category tool visibility toggles** — The user chose simple two-level verbose/quiet. Per-category toggles would be a configuration enhancement.
