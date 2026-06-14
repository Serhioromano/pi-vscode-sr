# pi-vscode-sr

## What This Is

A VS Code native integration layer for the Pi coding agent. The VS Code extension becomes a full UI bridge — using VS Code's built-in Chat panel, InlineCompletionProvider, and editor surface — while Pi remains the single source of truth for configuration, models, skills, and agents. Chat with Pi, run slash commands, review file changes, and get inline code suggestions — all through native VS Code interfaces, no terminal required.

## Core Value

Interact with the full Pi agent (chat, slash commands, extensions, review) entirely through VS Code's native interface without reinventing Pi's configuration, extension, or agent system.

## Requirements

### Validated

- ✓ File-based IPC review protocol via `.pi/` directory — existing
- ✓ Pi agent tool overrides (`write`, `edit`) for file mutation interception — existing
- ✓ VS Code diff editor review with approve/reject commands — existing
- ✓ Terminal TUI selector as fallback/parallel review path — existing
- ✓ Dual-package architecture (`pi-vscode-sr` npm + `vscode-pi-sr` Marketplace) — existing
- ✓ Heartbeat-based VS Code readiness detection — existing

### Active

- [ ] `@pi` chat participant registered via VS Code Chat API — users type `@pi` in the built-in Chat panel
- [ ] Visual approve/reject controls rendered inline in chat responses (replaces terminal TUI for VS Code users)
- [ ] Inline ghost-text code suggestions via VS Code InlineCompletionProvider API
- [ ] All Pi slash commands (`/model`, etc.) forwarded through chat and handled by Pi engine
- [ ] All Pi skills, agents, and extensions accessible through the chat participant automatically
- [ ] Pi `.pi/` config files remain the single source of truth for model, provider, and agent configuration
- [ ] Terminal TUI retained as fallback when VS Code review path is unavailable

### Out of Scope

- Custom chat UI or webview — build on VS Code's native Chat panel, not a bespoke interface
- VS Code Agents Window support — deferred to future version
- Model management UI — Pi self-configures via `/model` slash command and its own config files
- Multi-session management — single chat session at a time
- Replacing Pi's configuration system — `.pi/` files are authoritative; VS Code settings only control extension-side features

## Context

**Current state:** The project already provides file review via VS Code diff editor (v1.4.7, published to npm + Marketplace). The Pi agent runs in a terminal; the VS Code extension watches `.pi/` for review requests and opens diff editors. The terminal TUI provides approve/reject/rethink selectors. VS Code presence is detected via a heartbeat file.

**What's changing:** VS Code now has a Chat API (stable) and InlineCompletionProvider API (stable). These enable building an agent integration that feels native — users chat with Pi inside VS Code's own Chat panel, see responses with inline approve/reject buttons, and get Copilot-style completions as they type. The Pi engine, its config, and its extension system are untouched — the VS Code extension becomes a pure UI bridge.

**Technical environment:**
- Pi SDK `@earendil-works/pi-coding-agent` ^0.74.0 (pre-1.0, breaking changes possible)
- VS Code Engine `^1.82.0` (Chat API available since 1.82; InlineCompletionProvider since 1.68)
- TypeScript: root ESM/NodeNext, vscode-ext CommonJS
- Node.js >= 20.0.0
- File-based IPC via `.pi/` directory (no sockets, no RPC)

**Prior work:**
- Pi extension (`src/index.ts`, 470 lines) — tool overrides, review lifecycle, TUI
- VS Code extension (`vscode-ext/src/extension.ts`, 368 lines) — activation, diff handling, approval

**Known issues to address** (from codebase map):
- File-based IPC has no atomicity, locking, or corruption recovery
- Zero test coverage
- Monolithic single-file architecture in both packages
- No CI/CD pipeline
- Empty catch blocks swallow errors silently
- Pre-1.0 Pi SDK dependency risk

## Constraints

- **Pi SDK compatibility**: Must work with `@earendil-works/pi-coding-agent` ^0.74.0; API surface for tool/chat protocol must be verified
- **File-based IPC**: Existing `.pi/` protocol must continue working for backward compatibility
- **Terminal workflow**: Must not break existing terminal-only users
- **VS Code API minimum**: Chat API requires VS Code >= 1.82; InlineCompletionProvider >= 1.68
- **No config reinvention**: Pi config files (`.pi/`) are authoritative; VS Code extension must not create parallel configuration
- **Dual TypeScript configs**: Root ESM/NodeNext, vscode-ext CommonJS — any new shared code must handle both module systems

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use VS Code Chat API, not custom webview | Native feel, accessibility, keyboard navigation, theme support out of the box | — Pending |
| Pi config (.pi/) remains source of truth | Pi self-configures via `/model` and its config files; avoid config duplication | — Pending |
| Terminal TUI stays as fallback | Users without VS Code or with VS Code closed still need review capability | — Pending |
| InlineCompletionProvider for suggestions | Separate from Chat API; standard VS Code extension point used by Copilot and others | — Pending |
| Visual approve/reject in chat responses | Use Chat API's rich response capabilities (buttons, commands) rather than custom UI | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-14 after initialization*
