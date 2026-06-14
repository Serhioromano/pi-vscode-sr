# Stack Research

**Domain:** VS Code extension AI agent integration (Chat participant + InlineCompletionProvider)
**Researched:** 2026-06-14
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@types/vscode` | `^1.82.0` (minimum) `^1.98.0` (target) | VS Code API type definitions for Chat + Inline APIs | Chat participant API (`vscode.chat.createChatParticipant`) is stable since 1.82. `stream.button()` is available since 1.82. Bumping to 1.98+ gives access to `ChatRequest.model`, `ChatResponseStream.anchor()`, `followupProvider`, and `InlineCompletionTriggerKind`. Version 1.122+ enables BYOK chat without Copilot sign-in. |
| VS Code Engine | `^1.82.0` (minimum) `^1.98.0` (recommended) | Extension runtime engine requirement | Chat participant API requires 1.82+. For BYOK (no Copilot dependency for Chat panel), require 1.122+. InlineCompletionItemProvider requires 1.68+ (already satisfied). |
| TypeScript | `^5.3.0` (vscode-ext) | Extension compilation | Already established. No change needed. VS Code extensions must stay CommonJS; `@types/vscode` versions must match the target engine. |

### VS Code APIs (Primary)

| API | Available Since | Purpose | Notes |
|----|----------------|---------|-------|
| `vscode.chat.createChatParticipant(id, handler)` | 1.82 | Register `@pi` participant in the Chat view | Participant `id` must be lowercase, no underscores, max 32 chars. Recommend `"sr-pi.pi-agent"` or `"pi-sr.agent"`. The handler receives `(request, context, stream, token)`. |
| `ChatResponseStream.markdown(value)` | 1.82 | Stream response text into chat | Supports full markdown including code blocks, links, images. Use `MarkdownString` with `isTrusted` for command URIs. |
| `ChatResponseStream.button(button)` | 1.82 | Render clickable buttons in chat | Used for approve/reject/retry controls. Button invokes a VS Code command with optional arguments. |
| `ChatResponseStream.progress(value)` | 1.82 | Show progress indicator while waiting | Used while waiting for Pi to respond via IPC. |
| `ChatResponseStream.anchor(value, title?)` | 1.82 | Reference a file or location in chat | Link to files Pi is acting on. |
| `ChatRequest.command` | 1.82 | Detect which slash command was used | Check `request.command` for `/model`, `/skill`, `/agent` etc. |
| `ChatRequest.variables` | 1.82 | Access `@variable` references the user added | E.g., `@file`, `@selection` |
| `ChatRequest.model` | 1.90+ | The language model instance | UNDEFINED if no Copilot/BYOK model configured. Pi does NOT use this -- it communicates with the external Pi agent. The handler must guard against `request.model` being undefined even though it won't be called. |
| `ChatParticipant.followupProvider` | 1.82 | Provide suggested follow-up questions | Return contextual follow-ups after each response. |
| `ChatParticipant.onDidReceiveFeedback` | 1.82 | React to user up/down votes | Useful for telemetry. |
| `vscode.languages.registerInlineCompletionItemProvider(selector, provider)` | 1.68 | Register ghost-text completion provider | Returns `Disposable`. Use `{ pattern: '**' }` or specific language selectors. Multiple providers merge automatically. |
| `InlineCompletionItem` | 1.68 | A single completion item | Properties: `insertText`, `range`, `filterText`, `command`. Range must begin/end on same line. |
| `InlineCompletionTriggerKind.Invoke` (0) | 1.68 | Explicit user trigger | User pressed Ctrl+Space or similar. Return multiple items for cycling. |
| `InlineCompletionTriggerKind.Automatic` (1) | 1.68 | Automatic trigger while typing | Return a single item. |

### Chat API Dependency Chain

```
VS Code Chat View
  ├── Requires: Copilot OR BYOK model configured (1.122+)
  │     OR: Third-party extension providing Chat view (rare)
  ├── Provides: @-participant list, chat input, response rendering
  └── Our extension: registers @pi participant via createChatParticipant
  
Our @pi participant handler:
  ├── Does NOT call request.model.sendRequest()
  ├── Communicates with Pi agent via .pi/ file IPC (existing)
  ├── Streams Pi responses via stream.markdown() / stream.button()
  └── Works without LM model if Chat view itself is available
```

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@vscode/chat-extension-utils` | `^0.0.0-alpha.5` | High-level chat participant building blocks | SKIP for this project. It wraps LM tool-calling loops and model selection, neither of which we need since Pi is an external agent, not a VS Code LM. If the project later adds Copilot LM fallback, consider it then. |
| `deasync` or `async-mutex` | latest | Synchronize IPC file reads with async chat handler | Pi uses file-based IPC (no RPC). The chat handler is async. Use a polling loop with `setInterval` + promise to watch `.pi/` response files. Consider adding file locking to prevent corruption. |
| `debounce` (lodash) or `@thi.ng/async` | latest | Debounce InlineCompletionItemProvider calls | Inline provider fires on every keystroke. Need 300-500ms debounce before sending context to Pi. Standard pattern in Continue (350ms), Void (500ms). |
| `lru-cache` | latest | Cache inline completion results | Continue uses LRU with 20-item max per document. Void autorejects stale entries. Cache key = normalized prefix context. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `@vscode/vsce` `^3.2.0` | Extension packaging | Already used. No change. |
| `vsce` + `.vscodeignore` | Marketplace publishing | Already configured. Ensure `package.json` `contributes.*` are correct. |
| `@vscode/test-cli` | Integration testing for VS Code extensions | New addition recommended. Chat participant and InlineCompletionProvider need integration tests. The `@vscode/test-cli` framework can simulate editor contexts. |

## Installation

### New npm dependencies needed

```bash
# Core (for the VS Code extension - vscode-ext/)
npm install --save lodash.debounce   # or @thi.ng/async

# Dev (for tests)
npm install -D @vscode/test-cli @types/vscode@^1.98.0

# For IPC improvements (optional)
npm install --save async-mutex
```

### package.json contributions (new block)

```json
{
  "contributes": {
    "chatParticipants": [
      {
        "id": "pi-sr.agent",
        "name": "pi",
        "fullName": "Pi Agent",
        "description": "Chat with Pi coding agent. Supports all Pi slash commands and skills.",
        "isSticky": true,
        "commands": [
          { "name": "model", "description": "Switch AI model provider" },
          { "name": "skill", "description": "List or activate a skill" },
          { "name": "agent", "description": "List or switch agent" },
          { "name": "help", "description": "Show available commands" }
        ]
      }
    ]
  }
}
```

### package.json activation event (new)

```json
{
  "activationEvents": [
    "onStartupFinished",
    "onChatParticipant:pi-sr.agent"
  ]
}
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| VS Code Chat API (`createChatParticipant`) | Custom WebviewView-based sidebar chat | When Copilot/BYOK cannot be required (air-gapped, no LM config). WebviewView has full control but loses native Chat UI features: accessibility, keyboard nav, theme, command palette integration. The project's existing decision to use Chat API is correct given the terminal TUI fallback. |
| `request.model.sendRequest()` (bypass entirely) | `@vscode/chat-extension-utils` | If Pi were a VS Code LM provider (using `vscode.lm.registerLanguageModel`). But Pi is an external process, so the utils library's LM tool-calling loop doesn't apply. Bypass is correct. |
| File-based IPC (existing `.pi/` mechanism) | JSON-RPC over stdio (child process) | If Pi ran as a child process of VS Code. OpenCode uses this pattern (spawns `opencode acp` subprocess). However, Pi currently runs independently in a terminal. File-based IPC is the established protocol; changing it is out of scope for this milestone. |
| InlineCompletionItemProvider (standard API) | Copilot's own inline completion | Copilot's inline completion requires GitHub sign-in even with BYOK ("inline suggestions still require GitHub sign-in" per 1.122 notes). Our own InlineCompletionItemProvider works independently as a standard VS Code API. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@vscode/chat-extension-utils` | Alpha-quality (v0.0.0-alpha.5), designed for LM tool-calling loops, not for proxying to an external agent. Adds unnecessary complexity. | Direct `createChatParticipant` handler that reads/writes Pi IPC. |
| WebviewView chat | Loses native Chat UI: accessibility, keyboard navigation, theme integration, search. Only consider if Copilot/BYOK cannot be installed. | Chat Participant API + terminal TUI fallback. |
| `selectChatModels()` / `vscode.lm.selectChatModels()` | Deprecated API. Returns `undefined` in many scenarios (no consent, no model, race condition). Pi doesn't need it. | `request.model` (if needed), or bypass entirely. |
| `request.model.sendRequest()` | This is for Copilot LMs. Pi is an external agent. Calling it would send Pi prompts to Copilot instead. | Direct IPC communication with Pi agent. |
| Custom serialize/deserialize for chat state | VS Code manages chat history (ChatContext.history) automatically. | Use `ChatContext.history` for previous turns, `context.workspaceState` for session metadata. |
| ACP/JSON-RPC/stdio for Pi communication | Would require restructuring Pi's architecture. Out of scope for this milestone. | File-based `.pi/` IPC (already established). |

## Stack Patterns by Variant

**If VS Code >= 1.122 (BYOK available):**
- Chat participant works without Copilot sign-in
- No LM model configuration required for the extension itself (Pi handles its own models)
- Chat view appears automatically when user configures any BYOK model

**If VS Code >= 1.82 but < 1.122 (Copilot only):**
- Chat participant requires GitHub Copilot extension installed and authenticated
- Terminal TUI becomes the primary fallback for non-Copilot users
- The `@pi` participant activation event only fires when Copilot chat view exists

**If VS Code < 1.82 (legacy):**
- Chat participant API not available
- Use existing diff review + terminal TUI only
- Extension must continue activating (no hard failure)

**If Pi runs as child process (future):**
- Replace file-based IPC with stdio JSON-RPC (like OpenCode's ACP pattern)
- Yields lower latency, streaming, and lifecycle management benefits
- Chat handler can pipe Pi responses directly instead of polling files

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@types/vscode@^1.82.0` | VS Code engine `^1.82.0` | Current minimum. Chat participant API available. `stream.button()` available. |
| `@types/vscode@^1.90.0` | VS Code engine `^1.90.0` | Adds `ChatRequest.model` (may be undefined). Better type definitions. |
| `@types/vscode@^1.98.0` | VS Code engine `^1.98.0` | Latest stable features. Recommended target. Adds `followupProvider`, `ChatResponseStream.anchor()`, richer inline completion types. |
| `@types/vscode@^1.122.0` | VS Code engine `^1.122.0` | BYOK without Copilot sign-in. If targeting this, the Chat view is available to any user who configures a model. |
| InlineCompletionItemProvider (any) | VS Code engine `^1.68.0` | Already satisfied by current minimum. No version change needed. |
| `@earendil-works/pi-coding-agent` `^0.74.0` | Existing Pi SDK | No changes needed. The VS Code extension communicates via `.pi/` file IPC, not the Pi SDK directly. |
| `typescript@^5.3.0` (vscode-ext) | `@types/vscode@^1.82.0+` | No conflicts. CommonJS output required for VS Code extensions. |

### @types/vscode version upgrade path

Current: `^1.82.0`

The safest upgrade path is:

1. **Minimum viable:** Stay at `^1.82.0` -- everything needed (createChatParticipant, stream.button(), InlineCompletionItemProvider) is available. The ChatRequest type won't include `model` property (available from 1.90), but we don't use it anyway.
2. **Recommended:** Bump to `^1.98.0` -- gets latest stable type definitions, `followupProvider`, anchor references, `InlineCompletionTriggerKind` enum in types.
3. **Forward-looking:** Bump to `^1.122.0` -- gets BYOK type definitions. Only if the project wants to officially require 1.122+ for Copilot-free chat.

Recommendation: **`^1.82.0` (stay) for now**, then bump to `^1.98.0` at implementation time. The types from 1.82 are sufficient; upgrading mid-implementation adds risk. No runtime behavior change -- VS Code chat APIs are backward compatible.

## Sources

- Context7 `/websites/code_visualstudio_api` -- VS Code API reference for `createChatParticipant`, `ChatResponseStream`, `InlineCompletionItemProvider`, `InlineCompletionItem` API signatures and code examples
- Context7 `/microsoft/vscode-docs` -- Chat participant tutorial with full handler implementation, slash commands, `package.json` contributions, and `followupProvider` examples
- Microsoft VS Code release notes (v1_98, v1_100, v1_122) -- verified BYOK, Chat API changes, inline completion changes [HIGH confidence]
- GitHub issue microsoft/vscode-discussions#2595 -- confirmed Chat participant API requires Copilot/BYOK chat view [HIGH confidence]
- GitHub issue robpitcher/forge#53 -- documented migration from Chat API to WebviewView due to Copilot requirement [HIGH confidence]
- GitHub issue microsoft/vscode-docs#7752 -- deprecated `selectChatModels` in favor of `request.model` [HIGH confidence]
- OpenCode PR #15501 -- reference implementation of chat participant with external agent process (ACP over stdio) [HIGH confidence]
- Continue.dev autocomplete system (DeepWiki) -- debouncing (350ms), FIM templates, context gathering, LRU caching patterns [MEDIUM confidence for patterns -- Continue is a well-known project]
- Void editor autocomplete (DeepWiki) -- 500ms debounce, LRU cache (20 items), prediction type selection, concurrency controls (max 2 pending) [MEDIUM confidence]

---
*Stack research for: VS Code extension AI agent integration (Chat participant + InlineCompletionProvider)*
*Researched: 2026-06-14*
