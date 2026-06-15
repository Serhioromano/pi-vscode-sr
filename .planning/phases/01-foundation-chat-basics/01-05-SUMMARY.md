---
phase: 01
plan: 05
status: complete
---

## 01-05: Chat Integration — Complete

### What was built

- **`vscode-ext/src/chat-handler.ts`** — `createChatHandler` factory returning `vscode.ChatRequestHandler`. Lazy start (D-05), crash visibility (D-06), batch event mapping via streamEvents().
- **`vscode-ext/src/extension.ts`** — Updated with PiProcessManager creation, chat participant registration (`pi-sr.chat`), workspace isolation (`onDidChangeWorkspaceFolders`), deferred async init.
- **`vscode-ext/package.json`** — `chatParticipants` contribution with `id: "pi-sr.chat"`, `name: "pi"`, `isSticky: true`.
- **`vscode-ext/src/utils.ts`** — Added `getPiPath()` to resolve Pi binary via `which pi`.
- **`vscode-ext/src/pi-process-manager.ts`** — Accepts `cliPath` option; uses `new Function` for native dynamic import of ESM-only pi-coding-agent package.

### Key fixes during execution
- Moved `createChatParticipant` to sync activation phase (VS Code Chat API requires handler registered during activate, not in deferred callback)
- Changed `import { RpcClient }` to `import type` + native dynamic import via `new Function` to bypass tsc's CJS require() rewriting
- `getPiPath()` provides full binary path to RpcClient (default relative `dist/cli.js` doesn't exist in project)

### Human verification
- @pi participant appears in VS Code Chat panel
- Messages sent to @pi receive responses from Pi agent
