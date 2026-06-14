# Feature Landscape: VS Code AI Agent Integration Extensions

**Domain:** VS Code AI coding agent extensions (Chat API + InlineCompletionProvider)
**Researched:** 2026-06-14
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features that every VS Code AI extension must provide. Missing these makes the product feel incomplete or non-viable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **@-mention chat participant** (e.g., `@pi`) | Every AI extension (`@copilot`, `@cody`, `@q`) registers a chat participant in VS Code's native Chat panel. No custom chat UI. | MEDIUM | VS Code Chat API since 1.82. Register via `vscode.chat.createChatParticipant`. Pi must register `@pi` participant. |
| **Slash commands in chat** (`/explain`, `/fix`, `/tests`) | Users expect `/` commands for common tasks. Copilot has `/explain`, `/fix`, `/tests`; Continue has `/edit`, `/comment`, `/test`, `/review`; Cody has `/explain`, `/test`, `/doc`. | LOW | Each slash command is a registered `ChatParticipantSlashCommand`. Pi must forward all Pi slash commands through its participant. `/model`, `/tools`, `/cost`, `/sessions`, `/reload`, and all custom prompts (`/plan`, `/handoff`, `/bmad`, etc.) should work. |
| **Context references** (`#file`, `#selection`, `@workspace`) | Users expect to reference files, selections, and terminal output in chat messages. Copilot uses `@workspace`, `#file`, `#selection`; Cody uses `@` for files/symbols; Codeium has inline context pinning. | MEDIUM | VS Code Chat API supports `ChatRequestParser` for context variables. Pi must support `#file`, `#selection`, custom context. |
| **Markdown rendering in responses** | Chat responses render markdown with code blocks, syntax highlighting, and inline formatting. Every extension does this. | LOW | Use `stream.markdown()` for primary content. Standard. |
| **Diff view for proposed file changes** | Users expect to see proposed changes in VS Code's diff editor. Copilot "Apply in Editor" opens diff; Cline shows diff before applying; Continue uses inline diff; Cody Smart Apply uses diff; Amazon Q inline chat shows diff. | LOW (existing) | Already implemented in v1.4.7. Pi opens `vscode.diff` from `.pi/` review requests. The existing implementation works and must be retained. |
| **Approve/reject individual files** | Users expect to accept or reject each file change. Copilot Agent Mode has per-file accept; Cline has approve/reject dialogs for every action; Continue has accept/reject on inline diffs. | LOW (existing) | Already implemented in v1.4.7 via `pi-sr.approveCurrent` / `pi-sr.rejectCurrent` commands in editor title bar. Must be retained and enhanced with visual controls in chat. |
| **Streaming responses** | AI responses appear token-by-token in real time, not all at once when complete. Copilot, Cline, Continue, Cody all stream. | MEDIUM | Pi SDK likely supports streaming. Chat participant handler must push progressively via `stream.markdown()`. |
| **Ghost-text inline completions** | https://github.com/microsoft/vscode/issues/163396 - tab to accept ghost text as you type. Copilot, Tabnine, Cody, Codeium, Supermaven all provide this. | HIGH | Pi is primarily a chat agent, not an inline autocomplete engine. InlineCompletionProvider is less natural for Pi's workflow. The milestone calls for it as a separate feature, but complexity is high and value is uncertain for Pi. |

### Differentiators (Competitive Advantage)

Features that set Pi apart. Not expected by users of other extensions, but create unique value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Visual approve/reject controls in chat responses** | Users approve/reject file changes directly from chat response buttons -- no separate diff tab navigation required. No other extension does this natively in chat. Cline uses custom webview dialogs; Copilot provides "X" per file in a separate list; Continue accepts/rejects in inline diff. | MEDIUM | **CRITICAL VS Code Chat API LIMITATION:** `ChatResponseCommandButtonPart` can place command buttons in chat responses, but they cannot be visually grouped or styled as primary/secondary. Buttons appear individually (see GitHub issue microsoft/vscode#228038). Workaround: use filetree part for file list, button per file. Cannot render custom widget -- must use native Part types only. |
| **Terminal TUI retained as fallback** | Users who prefer terminal or don't have VS Code open still get full review capability through Pi's native TUI. No other VS Code extension offers a parallel terminal interface. | LOW | Already implemented. Just need to ensure existing TUI path is not broken by chat features. |
| **All Pi skills, agents, extensions accessible through chat** | Not just built-in slash commands -- every Pi skill, custom agent, and extension is available via `@pi`. Pi's extensibility system (skills/agents/extensions) is far richer than competitors' fixed command lists. | MEDIUM | Chat participant must forward all Pi slash commands verbatim. Skill loading, agent dispatch, and extension hooks are handled by Pi engine. VS Code extension is a thin passthrough. |
| **`.pi/` config files remain single source of truth** | No config duplication. Model, provider, agent, skill configuration stays in `.pi/` files. Unlike Continue (config.json), Copilot (GitHub settings), Amazon Q (AWS config), Tabnine (Tabnine config) -- all of which require their own config setup. | LOW | Pi already reads `.pi/settings.json`, `.pi/models.json`, `.pi/auth.json`. VS Code extension reads from there rather than creating VS Code settings. |
| **File-based IPC protocol** | No network sockets, no RPC, no agent subprocess. Simple file reads/writes through `.pi/` directory. Extremely debuggable, no port conflicts, survives restarts. | MEDIUM | Already implemented. Existing `.pi/review-requests/` and `.pi/review-results/` protocol. Requirements: no atomicity guarantee, no locking, no corruption recovery -- these need addressing. |
| **InlineCompletionProvider with Pi agent context** | Completions informed by Pi's full agent context (active skills, model, project rules). Unlike Copilot/Tabnine which use their own context systems. Pi's completions reflect the active agent configuration. | HIGH | Pi is not designed as an autocomplete engine. FIM (Fill-in-the-Middle) completions require a different model interaction pattern than Pi's turn-based chat. May need a separate lightweight model or API call for inline completions. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for Pi's architecture. Already documented in PROJECT.md as Out of Scope.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Custom chat UI / webview** | "Chat feels more native with custom UI" | VS Code Chat API provides native, themed, accessible, keyboard-navigable chat. Custom webview breaks theme support, accessibility, and requires maintenance. | Use `vscode.ChatResponseStream` with native `markdown()`, `button()`, `filetree()`, `anchor()` parts. Accept the API's visual limitations. |
| **Model management UI** | "Let me switch models from VS Code settings" | Pi already manages model config via `/model` slash command and `.pi/settings.json`. Duplicating in VS Code settings creates split-brain config. VS Code settings are per-machine, Pi config is per-project. | Use `/model` in chat. Display current model via welcome message or `/model` response. |
| **Multi-session management** | "I want multiple Pi conversations" | Pi's session model is single session per instance. Multi-session requires fundamental changes to Pi engine session management. VS Code's Chat API also doesn't natively support multi-session per participant. | Single session is fine for v1. Future v2 could explore `/resume` to switch sessions or agents to simulate multi-session. |
| **VS Code Agents Window** | "VS Code has an Agents window UI" | The Agents Window API (`vscode.chat.createChatAgent`) is a different API surface focused on outcome-based tasks rather than chat. No clear model for review workflow. | Use chat participant (`@pi`) which maps naturally to Pi's chat interface. Revisit Agents Window for future v2. |
| **Replace Pi's configuration system** | "Let me configure everything in VS Code settings" | Pi has a mature `.pi/` config system with settings.json, models.json, auth.json, skills, agents, extensions. Replicating this in VS Code is enormous scope, and creates config drift. | Keep `.pi/` authoritative. VS Code extension reads from `.pi/`. Maybe add VS Code settings only for extension-level concerns (e.g., diff editor behavior, notification prefs). |
| **Autocomplete-as-you-type (Copilot-style)** | "I want Copilot-quality inline completions" | Pi is a chat agent, not an autocomplete engine. Inline completions require a different ML pipeline (FIM model, low latency, streaming). Pi's models are general-purpose chat models not optimized for autocomplete latency. | Implement InlineCompletionProvider as an optional feature that queries Pi with a specific completion prompt. Accept that quality will differ from specialized autocomplete tools. Consider this P3, not P1. |

## Feature Dependencies

```
@pi Chat Participant (chatParticipant)
    ├──requires──> Chat participant registration (package.json contributes)
    ├──requires──> ChatRequestHandler implementation
    ├──requires──> Pi SDK integration (send chat, receive streaming response)
    ├──requires──> Slash command forwarding to Pi engine
    │                   └──enhances──> Custom slash command registration
    ├──enhances──> Context variable support (#file, #selection)
    └──enhances──> Visual approve/reject in chat responses
                        └──requires──> Chat response button command handlers
                        └──requires──> Review state management (file-by-file status in chat)
                        └──requires──> Existing diff editor integration

InlineCompletionProvider
    ├──requires──> InlineCompletionItemProvider registration
    ├──requires──> Pi SDK integration (completion request/response)
    └──enhances──> Command-on-accept for auto-imports

Review Result Writing (handleResult)
    ├──requires──> File-based IPC (.pi/review-results/)
    └──depends──> Existing file watcher on results directory

Terminal TUI (existing)
    └──no conflict──> Chat participant (independent, parallel paths)

`.pi/` config as source of truth
    └──conflicts──> VS Code settings as parallel config source (AVOID)
```

### Dependency Notes

- **@pi Chat Participant is the foundation** -- every chat feature builds on this. Must be implemented first.
- **Visual approve/reject in chat depends on chat participant** -- buttons are rendered via `ChatResponseCommandButtonPart` in the response stream. This is separate from the existing editor/title button commands (`pi-sr.approveCurrent`, `pi-sr.rejectCurrent`).
- **InlineCompletionProvider is independent** -- it has no dependency on chat. It can be built separately, potentially in a later phase.
- **Terminal TUI is parallel** -- it reads/writes the same `.pi/` files. No dependency on VS Code extension. Must not be broken.
- **Review file watcher supports both paths** -- the existing `resultsWatcher` in `extension.ts` handles results from both terminal TUI and (future) chat-based approve/reject.

## MVP Definition

### Launch With (v1 Milestone)

The three features specified as the milestone scope:

- [ ] **@pi chat participant** -- Register `@pi` in VS Code Chat panel. Forward messages to Pi engine via SDK. Stream responses. Handle `/model` and other slash commands. Essential foundation for all other features.
- [ ] **Visual approve/reject controls in chat responses** -- When Pi proposes file changes, render per-file approve/reject buttons in the chat response using `ChatResponseCommandButtonPart` + `ChatResponseFileTreePart`. Execute review decisions and write results to `.pi/review-results/`.
- [ ] **Inline ghost-text code suggestions** -- Register `InlineCompletionItemProvider`. Query Pi engine for completions. Render as ghost text. Accept with Tab. This P3 feature has lower urgency but is part of the milestone scope.

### Add After Validation (Implied by Existing Architecture)

- [ ] **Review state lifecycle in chat** -- Track per-file approve/reject state across multiple chat turns. Show summary when all files in a review are processed.
- [ ] **Improved button UX workaround for Chat API limitation** -- Since `ChatResponseCommandButtonPart` cannot render grouped/primary-secondary buttons (microsoft/vscode#228038), use a workaround: filetree for file list + single command per file. Monitor the VS Code issue for API improvements.

### Future Consideration (v2+)

- [ ] **InlineCompletionProvider polish** -- Optimize for latency, add command-on-accept for semantic side effects. Low priority since Pi is not an autocomplete tool.
- [ ] **@workspace context provider** -- Index workspace for codebase-aware context. Requires significant infrastructure.
- [ ] **VS Code Agents Window support** -- When the API matures. Deferred per PROJECT.md.
- [ ] **Multi-session support** -- `/resume` to switch sessions. Requires Pi engine changes.
- [ ] **Diff editor inline edits** -- Allow editing the proposed diff directly in VS Code and sending edits back to Pi. Currently the diff is one-way (display only).

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| @pi chat participant | HIGH | MEDIUM | P1 |
| Visual approve/reject in chat | HIGH | MEDIUM | P1 |
| Slash command forwarding | HIGH | LOW | P1 |
| Context variable support (#file, #selection) | MEDIUM | MEDIUM | P1 |
| Inline ghost-text completions | LOW | HIGH | P3 |
| Terminal TUI retention | HIGH (for existing users) | LOW (already done) | P0 (don't break) |
| Starred/filetree part for review UI | MEDIUM | LOW | P1 |
| Review state lifecycle in chat | MEDIUM | MEDIUM | P2 |
| @workspace context provider | MEDIUM | HIGH | P3 |
| Workaround for Chat API button grouping limit | MEDIUM | LOW | P2 |

**Priority key:**
- P0: Must not break (existing functionality)
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | GitHub Copilot | Cline | Continue.dev | Cody (Sourcegraph) | Tabnine | Amazon Q | Pi (Our Approach) |
|---------|---------------|-------|-------------|-----|---------|----------|-------------------|
| **Chat participant** | `@copilot` (workspace, vscode, terminal) | Custom webview sidebar | Custom webview sidebar | `@cody` in Chat panel | Webview chat | `@q` in Chat panel | `@pi` in native Chat panel |
| **Inline completions** | Ghost text (Copilot) | No | Tab autocomplete | Ghost text (Cody) | Ghost text | Ghost text | Ghost text (via InlineCompletionProvider) |
| **Slash commands** | `/explain`, `/fix`, `/tests` | Custom (tool-based) | `/edit`, `/test`, `/comment`, custom | `/explain`, `/test`, `/doc`, custom | `/test`, `/fix`, `/doc`, `/explain` | (limited) | All Pi built-in + custom slash commands forwarded |
| **File review UI** | "Apply in Editor" + per-file X | Webview diff + approve/reject dialogs | Inline diff with accept/reject | Smart Apply diff | Diff view + apply button | Inline diff | Chat buttons + diff editor (dual path) |
| **Diff visualization** | VS Code diff | Custom diff in webview | Inline diff overlay | VS Code diff | VS Code diff | Inline diff | VS Code diff editor (existing) |
| **Custom config** | GitHub settings | Per-workspace `.clinerules` | `config.json` | Cody config | Tabnine config | AWS config | `.pi/` files (no duplication) |
| **Terminal fallback** | No | No | No | No | No | No | **Yes** -- Pi TUI works in parallel |
| **Approve/reject in chat** | Partial (per-file X in list) | Yes (webview dialogs) | Yes (inline diff) | No (Smart Apply auto-applies) | No (apply button) | No | **Yes** -- buttons in chat response + diff editor |
| **Multi-agent support** | Ask/Plan/Agent modes | Plan/Act modes | Agents (configurable) | Chat commands | No | Agent mode | **Yes** -- full Pi agent system through chat |
| **Open source** | No | Yes (Apache 2.0) | Yes (Apache 2.0) | Yes (Apache 2.0) | No | No | Yes (MIT) |

## Critical VS Code Chat API Limitations for Visual Review Controls

These limitations directly affect the visual approve/reject feature design and must be understood before implementation:

1. **`ChatResponseCommandButtonPart` places individual buttons, not groups.** Each `button(command)` call renders a separate button. They appear one-per-line by default, not in a horizontal group. There is no way to create a primary/secondary visual hierarchy. (microsoft/vscode#228038)

2. **No custom rendering in chat responses.** You cannot render a custom widget, React component, or webview in a chat response. You are limited to: `markdown()`, `anchor()`, `button()`, `filetree()`, `progress()`, `reference()`.

3. **Followup suggestions are only at the end of a response.** `stream.followup()` can only push followup buttons after the response is complete, not inline. This means "Approve All" / "Reject All" followup buttons can only appear after the full review response.

4. **Buttons trigger commands, not direct actions.** Each `ChatResponseCommandButtonPart` executes a `vscode.Command`. The command handler must update state and may need to re-render or close the response. There is no way to update a response in-place after sending.

5. **File tree parts are read-only.** `ChatResponseFileTreePart` displays a file tree for reference. Files cannot have interactive buttons attached directly to them in the tree.

### Recommended Workaround for Approve/Reject in Chat

Given these limitations, the recommended pattern is:

```
[stream.markdown] "Pi proposes changes to 3 files:"
[stream.filetree]  -- list of files (read-only, for visual reference)
[stream.markdown] "---"
[stream.markdown] "src/app.ts: [Approve] [Reject] [View Diff]"
[stream.button] command: pi-sr.approveFile(filePath)
[stream.button] command: pi-sr.rejectFile(filePath)
[stream.button] command: pi-sr.openDiff(filePath)
[stream.markdown] "src/utils.ts: [Approve] [Reject] [View Diff]"
[stream.button] command: pi-sr.approveFile(filePath)
[stream.button] command: pi-sr.rejectFile(filePath)
[stream.button] command: pi-sr.openDiff(filePath)
...
[stream.followup] "Approve All" | "Reject All" | "Rethink"
```

This keeps the visual structure clear: file tree for overview, inline button commands per file, followup buttons for batch actions.

## vs Current Implementation

The existing extension (v1.4.7) provides:
- File watcher on `.pi/review-requests/` -- opens diff editors for proposed changes
- Editor title buttons (Approve/Reject) -- `pi-sr.approveCurrent`, `pi-sr.rejectCurrent`
- File watcher on `.pi/review-results/` -- closes diff tabs when Pi writes results (from terminal TUI)
- Heartbeat file (`.pi/.vscode-ready`) -- signals VS Code presence to Pi
- Session management (per-review, per-file state tracking)

What changes with v1:
- Chat participant (`@pi`) replaces the need for a separate terminal for VS Code users
- Visual approve/reject in chat supplements (does not replace) the editor/title buttons
- InlineCompletionProvider adds ghost text completions
- Terminal TUI remains as fallback for non-VS-Code use

## Sources

- GitHub: microsoft/vscode-copilot-release -- Copilot Chat features and issue discussions
- GitHub: microsoft/vscode/issues/228038 -- Chat API button grouping limitation
- GitHub: microsoft/vscode/issues/219245 -- Chat API transactional nature limitation
- GitHub: microsoft/vscode/issues/163396 -- InlineCompletion ghost text disappearance issue
- GitHub: microsoft/vscode/issues/199908 -- Chat participant API tracking issue
- JetBrains Kotlin Wrappers for VSCode: ChatResponseStream API reference
- Continue.dev documentation: feature set and configuration reference (continuedev/docs)
- Sourcegraph Cody documentation: feature reference (sourcegraph.com/docs/cody)
- Tabnine documentation: features and pricing (docs.tabnine.com)
- Amazon Q Developer documentation: AWS blog posts and docs
- Cline documentation: breakdown at memo.d.foundation/breakdown/cline
- Codeium Windsurf: changelog and documentation (windsurf.com)
- Supermaven: documentation and pricing (supermaven.com)
- Pi coding agent: reference configs (HazAT/pi-config, kksimons/pi-config, skidvis/pi-coding-agent-config)

---
*Feature research for: pi-vscode-sr (VS Code AI agent integration)*
*Researched: 2026-06-14*
