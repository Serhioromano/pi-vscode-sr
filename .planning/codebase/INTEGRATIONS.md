# External Integrations

**Analysis Date:** 2026-06-14

## APIs & External Services

**External APIs:**
- None. The extension does not make any HTTP requests, call any external REST APIs, or connect to any third-party services at runtime.

**Pi Agent SDK:**
- The core integration is with the `@earendil-works/pi-coding-agent` SDK (^0.74.0). The Pi extension (`src/index.ts`) is loaded into the Pi agent process and interacts via the `ExtensionAPI` interface. This is a local in-process integration, not a network service.
  - SDK/Client: `@earendil-works/pi-coding-agent`
  - Provides: `ExtensionAPI` object for registering tools and lifecycle event handlers, `ExtensionContext` for accessing UI, CWD, abort, and session management.

## Data Storage

**Databases:**
- None. No database client or ORM is used.

**File Storage:**
- Local filesystem only. The extension reads/writes files on the user's machine at the project root. All review state is stored in a `.pi/` directory relative to the workspace root (`ctx.cwd` or `workspaceRoot`).

**Caching:**
- None. No caching layer is used.

## Filesystem-Based IPC (Inter-Process Communication)

The Pi agent process and the VS Code extension communicate entirely through the filesystem using a shared `.pi/` directory under the project root. This is the central architectural pattern of the project.

**Protocol overview:**
```
.pi/
├── .vscode-ready          # Heartbeat file (VS Code writes timestamp every 15s)
├── review-requests/       # Pi agent writes JSON request files
│   └── {uuid}.json        # Format: ReviewRequest { id, title, files: [{path, original, proposed, description}] }
├── review-results/        # VS Code extension or Pi TUI writes decision files
│   └── {uuid}.json        # Format: ReviewResult { id, status, files: [{path, status, final}] }
└── tmp/                   # Temporary diff files
    └── {reviewId}/
        └── {filename}     # Proposed file contents for diff viewing
```

**Request flow:**

1. Pi agent calls the custom `write` or `edit` tool registered in `src/index.ts`.
2. The tool handler generates a UUID, writes a review request to `.pi/review-requests/{uuid}.json`, and starts two concurrent workflows:
   - A terminal TUI selector via `ctx.ui.select()` using the `@earendil-works/pi-tui` library.
   - A polling loop (`pollResultFile`) that watches `.pi/review-results/{uuid}.json`.
3. The VS Code extension watches the `review-requests/` directory via `fs.watch()`. When a new JSON file appears, it reads the request, creates a temporary diff file in `.pi/tmp/`, opens the VS Code diff editor (`vscode.diff`), and waits for user action.
4. User action (Approve/Reject) in VS Code writes the result to `.pi/review-results/{uuid}.json`.
5. The Pi agent's polling loop detects the result file and either applies or discards the file change.

**Heartbeat mechanism:**
- VS Code extension writes a Unix timestamp to `.pi/.vscode-ready` every 15 seconds (`setInterval` in `extension.ts`).
- Pi extension reads this file and checks that the timestamp is within 30 seconds (`isVscodeReady()` in `src/index.ts`).
- If no heartbeat within 30 seconds, the Pi extension bypasses review (auto-approves) and applies changes directly.
- On deactivation, the VS Code extension deletes the `.vscode-ready` file.

## VS Code API Surface Area

**Commands registered:**
- `pi-sr.approveCurrent` - Approve the currently viewed diff (registered in `vscode-ext/src/extension.ts:63`)
- `pi-sr.rejectCurrent` - Reject the currently viewed diff (registered in `vscode-ext/src/extension.ts:64`)

**Commands consumed:**
- `vscode.diff` (line 139) - Open diff editor with original vs proposed file
- `workbench.action.closeActiveEditor` (lines 195, 217) - Close diff tab after approve/reject
- `setContext` with key `piSr.isActive` - Enable/disable editor/title buttons

**Extension contributions (`vscode-ext/package.json`):**
- `commands`: Two commands with `$(check)` and `$(close)` icons
- `menus.editor/title`: Two navigation buttons, visible only when `piSr.isActive` context is true

**Editor API used:**
- `vscode.window.activeTextEditor` - Get currently focused editor for session matching
- `vscode.window.visibleTextEditors` - Fallback to find diff sessions in visible editors
- `vscode.window.tabGroups.all` - Close diff tabs programmatically on terminal-side reject/approval

**File system watching:**
- `fs.watch()` on `review-requests/` - Detect new review requests from Pi agent
- `fs.watch()` on `review-results/` - Detect results written by Pi terminal TUI

**Notifications:**
- `vscode.window.showInformationMessage()` - Review complete status
- `vscode.window.showErrorMessage()` - Error states
- `vscode.window.showWarningMessage()` - Workspace not open warning

**Activation:**
- `onStartupFinished` - Extension activates immediately after VS Code starts

## Authentication & Identity

**Auth Provider:**
- None. No authentication required at runtime.

**CI/CD Auth:**
- `VSCE_PAT` environment variable required for VS Code Marketplace publishing (see `Makefile:81-86`)
- `GITHUB_TOKEN` (via `gh auth`) for GitHub release creation
- npm authentication token for publishing to npm registry

## Monitoring & Observability

**Error Tracking:**
- None. No Sentry, DataDog, or any error monitoring service.

**Logs:**
- `console.warn()` in `src/index.ts` for VS Code readiness warnings.
- No structured logging or log files. All output goes to stdout/stderr of the Pi agent process.

## CI/CD & Deployment

**Hosting:**
- npm registry - Package name: `pi-vscode-sr`
- VS Code Marketplace - Publisher: `Serhioromano`, Extension ID: `serhioromano.vscode-pi-sr`

**CI Pipeline:**
- None. Publishing is done manually via `make publish v=<version>` from a local development machine. The Makefile orchestrates:
  1. Running `npm version` to bump version
  2. Pushing to GitHub
  3. Running `npm publish` to publish Pi extension
  4. Running `@vscode/vsce publish` to publish VS Code extension
  5. Creating GitHub releases via `gh release create`

**Publishing workflow (Makefile):**
- `make publish-pi v=<patch|minor|major|X.Y.Z>`: bumps version, commits, pushes, creates GitHub release
- `make publish-vscode`: syncs version from root, compiles, publishes to Marketplace
- `make publish v=<version>`: runs both in sequence

## Environment Configuration

**Required env vars (for development/publishing only, not runtime):**
- `VSCE_PAT` - Personal access token for VS Code Marketplace (required for `make publish-vscode`)

**Runtime configuration:**
- None. The extension is configured solely through the Pi agent's extension system. No env vars, config files, or settings are needed at runtime.

## Webhooks & Callbacks

**Incoming:**
- None.

**Outgoing:**
- None.

## Network Requests

**Runtime:**
- None. The extension operates entirely locally with no network dependencies.

**Publishing only:**
- `npm publish` sends package to npm registry
- `vsce publish` sends extension to VS Code Marketplace
- `gh release create` creates GitHub release

---

*Integration audit: 2026-06-14*
