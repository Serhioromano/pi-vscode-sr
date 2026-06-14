<!-- GSD:project-start source:PROJECT.md -->
## Project

**pi-vscode-sr**

A VS Code native integration layer for the Pi coding agent. The VS Code extension becomes a full UI bridge — using VS Code's built-in Chat panel, InlineCompletionProvider, and editor surface — while Pi remains the single source of truth for configuration, models, skills, and agents. Chat with Pi, run slash commands, review file changes, and get inline code suggestions — all through native VS Code interfaces, no terminal required.

**Core Value:** Interact with the full Pi agent (chat, slash commands, extensions, review) entirely through VS Code's native interface without reinventing Pi's configuration, extension, or agent system.

### Constraints

- **Pi SDK compatibility**: Must work with `@earendil-works/pi-coding-agent` ^0.74.0; API surface for tool/chat protocol must be verified
- **File-based IPC**: Existing `.pi/` protocol must continue working for backward compatibility
- **Terminal workflow**: Must not break existing terminal-only users
- **VS Code API minimum**: Chat API requires VS Code >= 1.82; InlineCompletionProvider >= 1.68
- **No config reinvention**: Pi config files (`.pi/`) are authoritative; VS Code extension must not create parallel configuration
- **Dual TypeScript configs**: Root ESM/NodeNext, vscode-ext CommonJS — any new shared code must handle both module systems
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.3+ (vscode-ext) / 6.0+ (root) - Entire codebase written in TypeScript, both the Pi extension (`src/index.ts`) and the VS Code extension (`vscode-ext/src/extension.ts`, `types.ts`).
- JavaScript - Compiled output in `dist/` and `vscode-ext/dist/` directories.
- Not detected. No other languages used in application code.
## Runtime
- Node.js >= 20.0.0. Local environment runs v24.15.0. The `@earendil-works/pi-tui` dependency requires `"node": ">=20.0.0"`.
- npm
- Lockfile: `package-lock.json` present in both root and `vscode-ext/`.
## Frameworks
- **Pi Coding Agent SDK** (`@earendil-works/pi-coding-agent` ^0.74.0) - The primary framework. Provides the extension system including `ExtensionAPI` for registering custom tools (`write`, `edit`) and lifecycle event handlers (`session_start`, `before_agent_start`, `message_end`). The Pi extension (`src/index.ts`) is loaded as an extension of the Pi agent process.
- **Pi Terminal UI** (`@earendil-works/pi-tui` ^0.74.0) - Terminal user interface library with differential rendering. Used by the Pi agent's TUI for the review selector dialogs (Approve, Reject, Rethink, etc.).
- **VS Code Extension API** (`@types/vscode` ^1.82.0, engine `^1.82.0`) - The VS Code extension uses the standard VS Code extension API for commands, editors, diff views, tab management, file system watching, and context keys.
- Not detected. No test framework, no test configuration files, no test files in the entire codebase. The `Makefile` has a `test` target that runs a manual integration-like test via `pi -e` with a specific prompt.
- **TypeScript Compiler (tsc)** - Both root and `vscode-ext/` use `tsc` for compilation. Root uses `tsc -p tsconfig.json` (implicit via npm version). `vscode-ext/` uses `tsc -p tsconfig.json` with a `watch` script.
- **vsce** (`@vscode/vsce` ^3.2.0) - VS Code extension packaging and publishing tool.
- **Make** - Build orchestration via `Makefile` with `publish`, `publish-pi`, `publish-vscode`, and `test` targets.
## Key Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `@earendil-works/pi-coding-agent` | ^0.74.0 | Pi agent extension SDK - provides `ExtensionAPI`, `ExtensionContext`, tool registration, lifecycle events, file mutation queue |
| `@earendil-works/pi-tui` | ^0.74.0 | Terminal UI library for interactive selector dialogs |
| `typebox` | ^1.1.38 | JSON Schema type builder for tool parameter definitions |
| `yaml` | ^2.7.0 | YAML parser/stringifier |
| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^6.0.3 (root) / ^5.3.0 (vscode-ext) | TypeScript compiler |
| `@types/node` | ^25.9.3 (root) / ^25.9.2 (vscode-ext) | Node.js type definitions |
| `@types/vscode` | ^1.82.0 | VS Code API type definitions |
| `@vscode/vsce` | ^3.2.0 | VS Code extension packaging and Marketplace publishing |
## Configuration
- Root `tsconfig.json`: targets ES2022, module NodeNext, strict mode enabled, output to `dist/`, declarations enabled.
- `vscode-ext/tsconfig.json`: targets ES2022, module commonjs (required for VS Code), strict mode enabled, source maps enabled, output to `dist/`.
- `.vscodeignore` in `vscode-ext/`: excludes `.vscode/`, `src/`, `node_modules/`, `.gitignore`, `tsconfig.json`, `package-lock.json`, `*.vsix` from the packaged extension.
- `tsconfig.json` (root) - compiler options for Pi extension source
- `vscode-ext/tsconfig.json` - compiler options for VS Code extension
- `Makefile` - publish and build orchestration
- `.vscodeignore` - VS Code extension packaging exclusions
## Platform Requirements
- Node.js >= 20.0.0
- npm (any recent version)
- For VS Code extension development: VS Code with extension debugging support
- GitHub CLI (`gh`) for publishing/releases
- VS Code Marketplace token (`VSCE_PAT`) for publishing to marketplace
- **Pi extension** (`pi-vscode-sr`): Runs as a Pi agent extension. Loaded via `pi install npm:pi-vscode-sr`. No server deployment needed.
- **VS Code extension** (`vscode-pi-sr`): Runs inside VS Code as a standard extension. Distributed via VS Code Marketplace as `serhioromano.vscode-pi-sr`.
## Dual-Package Architecture
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Languages
- **TypeScript** (all source code) - both `src/` (Pi extension) and `vscode-ext/src/` (VSCode extension)
- **JavaScript** - `.claude/hooks/` are JS files; GSD framework hooks, not project code
## TypeScript Strictness
| Setting | Root (`src/`) | VSCode Extension (`vscode-ext/`) |
|---------|---------------|----------------------------------|
| `strict` | `true` | `true` |
| `target` | `ES2022` | `ES2022` |
| `module` | `NodeNext` | `commonjs` |
| `skipLibCheck` | `true` | `true` |
| `esModuleInterop` | `true` | `true` |
| `declaration` | `true` | not set |
| `sourceMap` | not set | `true` |
| `moduleResolution` | `NodeNext` | (default) |
| `forceConsistentCasingInFileNames` | not set | `true` |
| `resolveJsonModule` | not set | `true` |
- Strict mode is always on. Do NOT disable `strict` in new tsconfigs.
- `skipLibCheck: true` skips type checking in `node_modules` - acceptable for extensions.
- `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes` are NOT enabled.
- Root uses `NodeNext` module system (ESM-compatible); VSCode extension uses `commonjs` (required by VSCode host).
## Naming Patterns
- Use `kebab-case`: `extension.ts`, `types.ts`, `index.ts`.
- No `.tsx` files exist.
- Use `camelCase`: `registerWriteOverride`, `createReviewAndWait`, `resolveSafe`, `getCurrentSession`.
- Entry points follow conventions: Pi: `export default function(pi: ExtensionAPI)`, VSCode: `export function activate(context)`.
- Helper functions are private module-scoped (not exported).
- Use `camelCase`: `projectCwd`, `workspaceRoot`, `requestsDir`, `resultPath`.
- Module-level mutable state uses `let`: `let projectCwd: string | null = null;`
- Sets/Maps: `const sessionReviewIds = new Set<string>();`
- Primitives: `const interval = 500;`
- Use `PascalCase`: `ReviewRequest`, `ReviewResult`, `ReviewResultFile`, `DiffSession`, `FileStatus`.
- Discriminated unions use PascalCase string literals for discriminants.
- No `I` prefix or `T` prefix.
## Code Style
- Root (`src/index.ts`): **4 spaces**
- VSCode extension (`vscode-ext/src/`): **2 spaces**
## Module System
- `NodeNext` module resolution.
- Default export: `export default function (pi: ExtensionAPI) { ... }`
- ESM `import` / `import type` syntax.
- `commonjs` module.
- Named exports: `export function activate(...)`, `export function deactivate()`.
- Namespace imports: `import * as vscode from 'vscode';`, `import * as fs from 'fs';`
## Import Organization
## Error Handling
- Empty `try/catch` for filesystem operations during cleanup.
- Return error result objects for tool failures - do NOT throw.
- Use discriminated union types for multi-outcome operations.
- Only `throw new Error()` for invariant violations.
- VSCode: use `vscode.window.showErrorMessage()` for user-facing errors.
- Tools: use `isError: true` to signal agent-facing errors.
## Logging
- `console.warn()` - Pi extension for agent-facing warnings.
- `vscode.window.showErrorMessage()` - user-facing errors.
- `vscode.window.showInformationMessage()` - success notifications.
- `vscode.window.showWarningMessage()` - non-critical warnings.
- No structured logging library. No `console.log()` in source.
## Comments and Documentation
- Comment WHY, not what.
- Use section dividers to organize files.
- Keep comments in English.
- No JSDoc on simple functions or interfaces.
## Function Design
## Module Design
- `src/index.ts`: single `export default function`
- `vscode-ext/src/types.ts`: named interface/type exports only
- `vscode-ext/src/extension.ts`: `activate` and `deactivate`
- `src/index.ts`: `sessionReviewIds`, `sessionApproveAll`, `projectCwd`, `vscodeNotOpenWarned`
- `vscode-ext/src/extension.ts`: `workspaceRoot`, `requestsDir`, `resultsDir`, `sessions`, `reviewFiles`
## VSCode-Specific Patterns
## Async Patterns
## Git Commit Conventions
- Version bumps: `1.4.7`, `1.4.6`
- Prefix: `vscode-ext: sync version 1.4.7`
- Auto-generated: `Prepare for new version patch`
- Descriptive: `Fix src`, `Improve description`, `change description`
- One-word: `heartbit`, `picture`, `fix`
- `vscode-ext: sync version <version>` for VSCode extension
- `Prepare for new version <version>` for root package
## Linting and Formatting
- No ESLint (`.eslintrc*`, `eslint.config.*`)
- No Prettier (`.prettierrc*`)
- No `.editorconfig`
- No lint scripts in any `package.json`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
```
## Component Responsibilities
| Component | Responsibility | File |
|-----------|----------------|------|
| Pi Extension Entry | Registers tools and event handlers with the pi framework | `src/index.ts:421-453` |
| Write Override | Captures `write` tool calls, creates review requests | `src/index.ts:246-320` |
| Edit Override | Captures `edit` tool calls, creates review requests | `src/index.ts:324-417` |
| Review Lifecycle | Creates review JSON, polls for results, races TUI vs VS Code | `src/index.ts:37-128` |
| TUI Selector | Inline terminal UI for approve/reject/rethink/abort | `src/index.ts:170-202` |
| VS Code Activation | Sets up heartbeat, file watchers, commands, recovers pending reviews | `vscode-ext/src/extension.ts:19-66` |
| VS Code Diff Handler | Creates temp files, opens diff editor for each review file | `vscode-ext/src/extension.ts:93-148` |
| VS Code Approve/Reject | Applies or discards changes from diff editor | `vscode-ext/src/extension.ts:175-223` |
| VS Code Result Handler | Processes results written by pi TUI, closes diff tabs | `vscode-ext/src/extension.ts:227-288` |
| VS Code Review Completer | Aggregates per-file results, writes final result JSON | `vscode-ext/src/extension.ts:292-368` |
## Pattern Overview
- **Tool override pattern** — The pi framework provides default `write` and `edit` tools; this extension replaces them with review-enabled versions that intercept the LLM's file mutations.
- **File-based inter-process communication** — The pi agent (CLI process) and VS Code extension (separate process) communicate exclusively through the `.pi/` directory in the project workspace: review requests are written as JSON files, results are read back as JSON files.
- **Race-based review resolution** — Two paths can resolve a review: the VS Code diff editor (approve/reject buttons) or the terminal TUI selector (Approve/Reject/Rethink/Approve All/Abort). Both run concurrently via `Promise.race()`.
- **Module-level mutable state** — Both extensions manage session state via module-scoped variables (`Map`, `Set`, simple variables), not dependency injection.
## Layers
- Purpose: Hooks into the pi agent framework to override file mutation tools with human review.
- Location: `src/index.ts`
- Contains: Default export factory function, two tool registrations (`write`, `edit`), event handlers, review lifecycle logic, TUI selector.
- Depends on: `@earendil-works/pi-coding-agent` (framework types, `ExtensionAPI`, `withFileMutationQueue`), `@earendil-works/pi-tui` (indirectly via `ctx.ui`), TypeBox (`Type` object for parameter schemas).
- Used by: The pi framework, which invokes the default export at startup with an `ExtensionAPI` instance.
- Purpose: Provides visual diff review UI in VS Code, enabling users to see proposed changes and approve/reject them.
- Location: `vscode-ext/src/extension.ts`
- Contains: Activation/deactivation hooks, file watchers, diff view management, approve/reject commands, review completion logic.
- Depends on: `vscode` API, Node.js `fs` and `path` modules.
- Used by: VS Code runtime (standard extension lifecycle).
- Purpose: Shared interfaces for the review IPC protocol between pi and VS Code.
- Location: `vscode-ext/src/types.ts`
- Contains: `ReviewRequest`, `ReviewFile`, `ReviewResult`, `ReviewResultFile`, `DiffSession`, `FileStatus`.
- Used by: Both `extension.ts` files (pi side inlines equivalent shapes but they must match exactly).
## Data Flow
### Primary Review Flow (VS Code available)
### Secondary Review Flow (VS Code unavailable, terminal only)
### Tertiary Review Flow (no VS Code at all)
### Approve All Flow
### Cleanup Flow
- Pi extension uses module-level variables: `sessionReviewIds` (Set), `sessionApproveAll` (Set), `projectCwd` (string), `vscodeNotOpenWarned` (boolean)
- VS Code extension uses module-level variables: `workspaceRoot`, `requestsDir`, `resultsDir`, `watcher` (FSWatcher), `resultsWatcher` (FSWatcher), `sessions` (Map<string, DiffSession>), `reviewFiles` (Map<string, Set<string>>)
- No DI, no class instances, no singletons beyond these module variables
- State persistence is via the filesystem (`.pi/*.json`), not in-memory across restarts
## Key Abstractions
- Purpose: IPC contract between pi and VS Code. Written by pi at `.pi/review-requests/{uuid}.json`, consumed by VS Code.
- Shape: `{ id: string, title: string, files: [{ path, original, proposed, description? }] }`
- Pattern: File-based message passing.
- Purpose: IPC contract for results. Written by VS Code (or pi TUI) at `.pi/review-results/{uuid}.json`, consumed by the other process.
- Shape: `{ id: string, status: "approved" | "rejected", files: [{ path, status, final }] }`
- Pattern: File-based message passing.
- Purpose: Internal VS Code state tracking a single diff editor's lifecycle.
- Fields: `reviewId`, `filePath`, `originalFsPath`, `tmpFsPath`, `status` (pending/approved/rejected)
- Pattern: Transient in-memory state mapped by temp file path.
- Purpose: Framework-provided helper from `@earendil-works/pi-coding-agent` that serializes concurrent file writes.
- Usage: Wraps the actual `writeFileSync` call in the approved path of both tool overrides (`src/index.ts:295`, `src/index.ts:392`).
- Purpose: Path normalization that handles the common LLM mistake of passing absolute-like paths without the leading `/` (e.g. `home/user/project/file.ts` instead of `/home/user/project/file.ts`).
- Pattern: Duplicated in both extensions (`src/index.ts:233`, `vscode-ext/src/extension.ts:82`) — known code duplication.
## Entry Points
- Location: `src/index.ts:421`
- Triggers: Pi framework discovers the extension via `package.json` field `pi.extensions: ["./src/index.ts"]` and calls the default export with an `ExtensionAPI` instance.
- Responsibilities: Register `write` and `edit` tool overrides, subscribe to `session_start`, `before_agent_start`, `message_end` lifecycle events.
- Location: `vscode-ext/src/extension.ts:19`
- Triggers: VS Code activates the extension via `activationEvents: ["onStartupFinished"]` in `vscode-ext/package.json`.
- Responsibilities: Create `.pi/` subdirectories, start heartbeat, start `fs.watch` watchers on review request/result directories, register editor title commands, recover any incomplete reviews.
- Location: `vscode-ext/src/extension.ts:68`
- Triggers: VS Code extension host unload.
- Responsibilities: Close watchers, remove `.vscode-ready` signal.
## Extension Activation Lifecycle
### Pi Extension Activation
### VS Code Extension Activation
## Communication Patterns
- No sockets, pipes, or RPC.
- Communication directory: `.pi/` in the workspace root, with subdirectories `review-requests/`, `review-results/`, `tmp/`.
- Detection: Pi detects VS Code presence by checking the heartbeat file `.pi/.vscode-ready` (fresh timestamp within 30 seconds, heartbeat interval = 15s).
- Watchers: VS Code uses `fs.watch` on both directories for immediate notification. Pi polls the results directory (500ms interval, 10-minute deadline).
- Concurrency model: Both processes can write to the same result file, but the Pi `writeSyncResult` and VS Code `checkReviewComplete` separately handle the same schema. Race conditions are avoided by Promise.race — whichever process resolves first wins, the other's result is ignored.
- Pi framework manages the LLM conversation; this extension only hooks into tool execution.
- Tools registered with `executionMode: "sequential"` — the LLM must complete each write/edit before the next tool call.
- Tool results include `isError: true` for reject/error outcomes (tells LLM to retry or adapt).
- Set to `true` when diff editors are opened, `false` when reviews complete.
- Controls visibility of the Approve/Reject buttons in the editor title bar.
## Webview Architecture
## Key Design Patterns Used
- **Tool Override Pattern** — Registering tools with the same name as built-in tools to intercept and wrap their behavior. The pi framework accepts the last-registered tool for a given name.
- **Event Subscription Pattern** — Using `pi.on("event_name", handler)` to hook into lifecycle events (`session_start`, `before_agent_start`, `message_end`).
- **File-Based IPC** — Asynchronous message passing via JSON files on the filesystem.
- **Race-and-Winner Pattern** — `Promise.race()` between TUI and VS Code watcher to resolve reviews from either interface.
- **Module-Scoped State** — Simple module-level variables instead of classes or DI.
- **Guard Clause Flow** — Heavy use of early returns and switch/case in tool execute handlers rather than nested conditionals.
- **Result Object Pattern** — Returning structured result objects (`{ content, details, isError? }`) rather than throwing exceptions for expected error cases (rejection, timeout).
## Error Handling
- Tool execution catch blocks return error objects with descriptive text: `src/index.ts:308-310` (rejected), `src/index.ts:314-316` (timeout), `src/index.ts:359-363` (file not found), `src/index.ts:369-374` (edit failure).
- File polling catches and retries on parse errors (partial writes): `src/index.ts:162-166`.
- VS Code error handling uses try/catch in approve/reject/close operations with `showErrorMessage` user feedback: `vscode-ext/src/extension.ts:198-200`, `vscode-ext/src/extension.ts:221-223`.
- No centralized error boundary or logging framework — errors are handled locally per operation.
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
