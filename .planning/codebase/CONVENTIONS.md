# Coding Conventions

**Analysis Date:** 2026-06-14

## Languages

- **TypeScript** (all source code) - both `src/` (Pi extension) and `vscode-ext/src/` (VSCode extension)
- **JavaScript** - `.claude/hooks/` are JS files; GSD framework hooks, not project code

## TypeScript Strictness

**Compiler settings** (both `tsconfig.json` files):

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

**Key points:**
- Strict mode is always on. Do NOT disable `strict` in new tsconfigs.
- `skipLibCheck: true` skips type checking in `node_modules` - acceptable for extensions.
- `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes` are NOT enabled.
- Root uses `NodeNext` module system (ESM-compatible); VSCode extension uses `commonjs` (required by VSCode host).

## Naming Patterns

**Files:**
- Use `kebab-case`: `extension.ts`, `types.ts`, `index.ts`.
- No `.tsx` files exist.

**Functions:**
- Use `camelCase`: `registerWriteOverride`, `createReviewAndWait`, `resolveSafe`, `getCurrentSession`.
- Entry points follow conventions: Pi: `export default function(pi: ExtensionAPI)`, VSCode: `export function activate(context)`.
- Helper functions are private module-scoped (not exported).

**Variables and constants:**
- Use `camelCase`: `projectCwd`, `workspaceRoot`, `requestsDir`, `resultPath`.
- Module-level mutable state uses `let`: `let projectCwd: string | null = null;`
- Sets/Maps: `const sessionReviewIds = new Set<string>();`
- Primitives: `const interval = 500;`

**Types and Interfaces:**
- Use `PascalCase`: `ReviewRequest`, `ReviewResult`, `ReviewResultFile`, `DiffSession`, `FileStatus`.
- Discriminated unions use PascalCase string literals for discriminants.
- No `I` prefix or `T` prefix.

```typescript
// DO
export interface ReviewRequest {
  id: string;
  title: string;
  files: ReviewFile[];
}
type FileStatus = 'pending' | 'approved' | 'rejected';

// DO NOT
// interface IReviewRequest { ... }
// type TFileStatus = ...;
```

## Code Style

**Indentation:**
- Root (`src/index.ts`): **4 spaces**
- VSCode extension (`vscode-ext/src/`): **2 spaces**
Maintain this per-directory: `src/` 4-space, `vscode-ext/src/` 2-space.

**Quotes:** Single quotes only.
**Semicolons:** Used consistently at end of statements.
**Trailing commas:** Used in multiline object/array literals.
**Braces:** Opening braces on same line (1TBS style). Always use braces for control flow.

## Module System

**Root (Pi extension) - `src/index.ts`:**
- `NodeNext` module resolution.
- Default export: `export default function (pi: ExtensionAPI) { ... }`
- ESM `import` / `import type` syntax.

**VSCode extension - `vscode-ext/src/`:**
- `commonjs` module.
- Named exports: `export function activate(...)`, `export function deactivate()`.
- Namespace imports: `import * as vscode from 'vscode';`, `import * as fs from 'fs';`

## Import Organization

**Root** (`src/index.ts`):
1. Third-party type imports: `import type { ExtensionAPI } from "...";`
2. Third-party value imports: `import { withFileMutationQueue } from "...";`
3. Utility library: `import { Type } from "typebox";`
4. Node built-ins (alphabetical): `crypto`, `fs`, `path`

**VSCode extension** (`vscode-ext/src/extension.ts`):
1. Reference directive: `/// <reference types="node" />`
2. Namespace imports: `import * as vscode from 'vscode';`
3. Node built-ins: `import * as fs from 'fs';`, `import * as path from 'path';`
4. Local imports: `import { ReviewRequest } from './types';`

No path aliases - all local imports use relative paths.

## Error Handling

**"Never throw for expected failures" pattern:**

1. **Empty try-catch for expected failures:**
```typescript
try {
    original = readFileSync(absolutePath, "utf-8");
    fileExists = true;
} catch {
    // new file
}
```

2. **Returning error results instead of throwing:**
```typescript
try {
    original = readFileSync(absolutePath, "utf-8");
} catch {
    return {
        content: [{ type: "text", text: `File not found: ${params.path}` }],
        details: { path: params.path, status: "error", error: "not found" },
    };
}
```

3. **Using `isError: true` for tool-level failures:**
```typescript
return {
    isError: true,
    content: [{ type: "text", text: `File rejected...` }],
    details: { path: params.path, status: "rejected" },
};
```

4. **Throwing only for truly impossible states:**
```typescript
default:
    throw new Error(`Unexpected review status: ${(result as any).status}`);
```

5. **Discriminated union for return outcomes:**
```typescript
type ReviewOutcome =
    | { status: "approved"; final: string }
    | { status: "rejected" }
    | { status: "rethink"; prompt: string }
    | { status: "timeout" };
```

6. **Silent catch for cleanup operations:**
```typescript
try { fs.unlinkSync(s.tmpFsPath); } catch {}
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
```

**Rules:**
- Empty `try/catch` for filesystem operations during cleanup.
- Return error result objects for tool failures - do NOT throw.
- Use discriminated union types for multi-outcome operations.
- Only `throw new Error()` for invariant violations.
- VSCode: use `vscode.window.showErrorMessage()` for user-facing errors.
- Tools: use `isError: true` to signal agent-facing errors.

## Logging

**Patterns:**
- `console.warn()` - Pi extension for agent-facing warnings.
- `vscode.window.showErrorMessage()` - user-facing errors.
- `vscode.window.showInformationMessage()` - success notifications.
- `vscode.window.showWarningMessage()` - non-critical warnings.
- No structured logging library. No `console.log()` in source.

```typescript
console.warn("VS Code not detected - working without diff review...");
vscode.window.showErrorMessage(`Pi Companion: approve failed - ${err}`);
vscode.window.showInformationMessage(`Pi Companion: accepted (2/3)`);
```

## Comments and Documentation

**Section headers:**
```typescript
// --- Section name ---
```

**Block comments:** Standard `//` line comments, not `/* */`.

**JSDoc:** Used only for non-obvious functions with edge cases (e.g. `resolveSafe` at `src/index.ts:233`).

**Rules:**
- Comment WHY, not what.
- Use section dividers to organize files.
- Keep comments in English.
- No JSDoc on simple functions or interfaces.

## Function Design

**Size:** Largest is `createReviewAndWait()` (~88 lines at `src/index.ts`). All functions under ~100 lines. Average ~25-30 lines.

**Parameters:** 1-4 positional parameters. Optional params use `opts` object.

**Return values:** Complex types as type aliases/interfaces. `Promise<T>` for async. `boolean` for validators.
Tool executors return `{ content, details, isError? }`.

## Module Design

**Exports:** Each file has a focused export surface:
- `src/index.ts`: single `export default function`
- `vscode-ext/src/types.ts`: named interface/type exports only
- `vscode-ext/src/extension.ts`: `activate` and `deactivate`

**Global state:** Module-level mutable state:
- `src/index.ts`: `sessionReviewIds`, `sessionApproveAll`, `projectCwd`, `vscodeNotOpenWarned`
- `vscode-ext/src/extension.ts`: `workspaceRoot`, `requestsDir`, `resultsDir`, `sessions`, `reviewFiles`

This is the standard VSCode extension pattern: state at module scope, managed by activate/deactivate lifecycle.

## VSCode-Specific Patterns

**Activation:**
```typescript
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('pi-sr.approveCurrent', () => approveCurrent()),
    );
}
export function deactivate() {
    watcher?.close();
}
```

**Command registration:** `registerCommand()` with kebab-case IDs (`pi-sr.approveCurrent`). Push to `context.subscriptions`.

**Context keys:** `executeCommand('setContext', 'piSr.isActive', value)` for conditional UI.

**File watching:** `fs.watch()` on `.pi/` directories.

**Diff editors:** Open via `executeCommand('vscode.diff', left, right, title)`. Close via `tabGroups.close(tab)`.

**Heartbeat pattern:**
```typescript
const heartbeatTimer = setInterval(() => {
    try { fs.writeFileSync(readyFile, Date.now().toString(), 'utf-8'); } catch {}
}, 15_000);
context.subscriptions.push({ dispose: () => clearInterval(heartbeatTimer) });
```

**Unused parameters:** Prefixed with underscore: `_toolCallId`, `_signal`, `_onUpdate`.

## Async Patterns

**Primary:** `async/await` everywhere.

**Polling:**
```typescript
async function pollResultFile(resultPath, deadline, interval = 500) {
    while (Date.now() < deadline) {
        try {
            if (existsSync(resultPath)) {
                return { action: "file-approved" };
            }
        } catch { /* retry */ }
        await sleep(interval);
    }
    return { action: "timeout" };
}
```

**Race pattern:**
```typescript
const outcome = await Promise.race([tuiPromise, pollPromise]);
```

**Cancellation via AbortController:**
```typescript
const tuiController = new AbortController();
tuiController.abort();
```

**Sleep utility:**
```typescript
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
```

**Rules:** Use `async/await` over `.then()/.catch()`. Use `Promise.race` for timeouts. Use `AbortController` for cancellation.

## Git Commit Conventions

**Inconsistent patterns observed:**
- Version bumps: `1.4.7`, `1.4.6`
- Prefix: `vscode-ext: sync version 1.4.7`
- Auto-generated: `Prepare for new version patch`
- Descriptive: `Fix src`, `Improve description`, `change description`
- One-word: `heartbit`, `picture`, `fix`

Makefile auto-generates during publishing:
- `vscode-ext: sync version <version>` for VSCode extension
- `Prepare for new version <version>` for root package

No conventional commits standard enforced.

## Linting and Formatting

**Not configured:**
- No ESLint (`.eslintrc*`, `eslint.config.*`)
- No Prettier (`.prettierrc*`)
- No `.editorconfig`
- No lint scripts in any `package.json`

Code formatting relies on author discipline.

---

*Convention analysis: 2026-06-14*
