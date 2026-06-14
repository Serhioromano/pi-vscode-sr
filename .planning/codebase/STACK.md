# Technology Stack

**Analysis Date:** 2026-06-14

## Languages

**Primary:**
- TypeScript 5.3+ (vscode-ext) / 6.0+ (root) - Entire codebase written in TypeScript, both the Pi extension (`src/index.ts`) and the VS Code extension (`vscode-ext/src/extension.ts`, `types.ts`).
- JavaScript - Compiled output in `dist/` and `vscode-ext/dist/` directories.

**Secondary:**
- Not detected. No other languages used in application code.

## Runtime

**Environment:**
- Node.js >= 20.0.0. Local environment runs v24.15.0. The `@earendil-works/pi-tui` dependency requires `"node": ">=20.0.0"`.

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present in both root and `vscode-ext/`.

## Frameworks

**Core:**
- **Pi Coding Agent SDK** (`@earendil-works/pi-coding-agent` ^0.74.0) - The primary framework. Provides the extension system including `ExtensionAPI` for registering custom tools (`write`, `edit`) and lifecycle event handlers (`session_start`, `before_agent_start`, `message_end`). The Pi extension (`src/index.ts`) is loaded as an extension of the Pi agent process.
- **Pi Terminal UI** (`@earendil-works/pi-tui` ^0.74.0) - Terminal user interface library with differential rendering. Used by the Pi agent's TUI for the review selector dialogs (Approve, Reject, Rethink, etc.).

**VS Code:**
- **VS Code Extension API** (`@types/vscode` ^1.82.0, engine `^1.82.0`) - The VS Code extension uses the standard VS Code extension API for commands, editors, diff views, tab management, file system watching, and context keys.

**Testing:**
- Not detected. No test framework, no test configuration files, no test files in the entire codebase. The `Makefile` has a `test` target that runs a manual integration-like test via `pi -e` with a specific prompt.

**Build/Dev:**
- **TypeScript Compiler (tsc)** - Both root and `vscode-ext/` use `tsc` for compilation. Root uses `tsc -p tsconfig.json` (implicit via npm version). `vscode-ext/` uses `tsc -p tsconfig.json` with a `watch` script.
- **vsce** (`@vscode/vsce` ^3.2.0) - VS Code extension packaging and publishing tool.
- **Make** - Build orchestration via `Makefile` with `publish`, `publish-pi`, `publish-vscode`, and `test` targets.

## Key Dependencies

**Critical (runtime):**

| Package | Version | Purpose |
|---------|---------|---------|
| `@earendil-works/pi-coding-agent` | ^0.74.0 | Pi agent extension SDK - provides `ExtensionAPI`, `ExtensionContext`, tool registration, lifecycle events, file mutation queue |
| `@earendil-works/pi-tui` | ^0.74.0 | Terminal UI library for interactive selector dialogs |
| `typebox` | ^1.1.38 | JSON Schema type builder for tool parameter definitions |
| `yaml` | ^2.7.0 | YAML parser/stringifier |

**Infrastructure (devDependencies):**

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^6.0.3 (root) / ^5.3.0 (vscode-ext) | TypeScript compiler |
| `@types/node` | ^25.9.3 (root) / ^25.9.2 (vscode-ext) | Node.js type definitions |
| `@types/vscode` | ^1.82.0 | VS Code API type definitions |
| `@vscode/vsce` | ^3.2.0 | VS Code extension packaging and Marketplace publishing |

## Configuration

**Environment:**
- Root `tsconfig.json`: targets ES2022, module NodeNext, strict mode enabled, output to `dist/`, declarations enabled.
- `vscode-ext/tsconfig.json`: targets ES2022, module commonjs (required for VS Code), strict mode enabled, source maps enabled, output to `dist/`.
- `.vscodeignore` in `vscode-ext/`: excludes `.vscode/`, `src/`, `node_modules/`, `.gitignore`, `tsconfig.json`, `package-lock.json`, `*.vsix` from the packaged extension.

**Build:**
- `tsconfig.json` (root) - compiler options for Pi extension source
- `vscode-ext/tsconfig.json` - compiler options for VS Code extension
- `Makefile` - publish and build orchestration
- `.vscodeignore` - VS Code extension packaging exclusions

## Platform Requirements

**Development:**
- Node.js >= 20.0.0
- npm (any recent version)
- For VS Code extension development: VS Code with extension debugging support
- GitHub CLI (`gh`) for publishing/releases
- VS Code Marketplace token (`VSCE_PAT`) for publishing to marketplace

**Production:**
- **Pi extension** (`pi-vscode-sr`): Runs as a Pi agent extension. Loaded via `pi install npm:pi-vscode-sr`. No server deployment needed.
- **VS Code extension** (`vscode-pi-sr`): Runs inside VS Code as a standard extension. Distributed via VS Code Marketplace as `serhioromano.vscode-pi-sr`.

## Dual-Package Architecture

The project consists of two independently published packages sharing the same repository:

1. **pi-vscode-sr** (root `package.json`) - npm package loaded as a Pi agent extension. Provides the source of truth for file review orchestration, tool registration, and TUI interaction.
2. **vscode-pi-sr** (`vscode-ext/package.json`) - VS Code extension published to the Marketplace. Provides the diff editor interface for visual file review.

Version numbers are synchronized between both packages via `make publish-vscode`.

---

*Stack analysis: 2026-06-14*
