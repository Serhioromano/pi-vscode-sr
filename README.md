# Pi VS Code

Pi extension that integrates with VS Code's diff editor for reviewing code changes proposed by the Pi agent.

## Architecture

The project has **two components** in one repository:

### 1. Pi Extension (root)

- **`src/index.ts`** — Extension loaded by Pi agent (`@earendil-works/pi-tui`)
- Published as npm package `pi-vscode`
- **Overrides `write` tool** — instead of writing directly, creates a review request in `.pi/review-requests/{uuid}.json`
- Polls `.pi/review-results/{uuid}.json` for user's decision, then writes if approved

### 2. VS Code Extension (`vscode-ext/`) — **Pi Companion**

- **`vscode-ext/src/extension.ts`** — VS Code extension (package name: `vscode-pi-companion`) with approve/reject buttons in diff editor
- Watches `.pi/review-requests/` for new review requests from Pi
- Opens diff editors with **✓ Approve / ✗ Reject** buttons in the editor title bar
- Writes results to `.pi/review-results/` for Pi to read

## Protocol

### Review Request (Pi → VS Code Extension)

File: `.pi/review-requests/{uuid}.json`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Add input validation to login",
  "files": [
    {
      "path": "src/auth/login.ts",
      "original": "export function login(email: string, password: string) {\n  return api.post('/login', { email, password });\n}",
      "proposed": "export function login(email: string, password: string) {\n  if (!email.includes('@')) throw new Error('Invalid email');\n  if (password.length < 8) throw new Error('Password too short');\n  return api.post('/login', { email, password });\n}",
      "description": "Added email and password validation",
      "language": "typescript"
    }
  ]
}
```

### Review Result (VS Code Extension → Pi)

File: `.pi/review-results/{uuid}.json`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "approved",
  "files": [
    {
      "path": "src/auth/login.ts",
      "status": "approved",
      "final": "export function login(email: string, password: string) {\n  if (!email.includes('@')) throw new Error('Invalid email');\n  if (password.length < 8) throw new Error('Password too short');\n  return api.post('/login', { email, password });\n}"
    }
  ]
}
```

## Quick Start

### VS Code Extension Dev
1. Open this project in VS Code
2. Press **F5** (or run "Run VS Code Extension" in Run & Debug)
3. A new VS Code window opens with the extension loaded
4. In that window, create a test request:
   ```bash
   mkdir -p .pi/review-requests
   cp /home/sergey/www/pi-vscode/.pi/review-requests/test.json .pi/review-requests/
   ```
5. The extension will open a diff editor with **✓ Approve / ✗ Reject** buttons
6. Edit the right side, then click Approve or Reject

### Pi Extension (npm)
Run Pi with the extension:
```bash
pi -e /path/to/pi-vscode/src/index.ts
```
When Pi calls `write`, the extension creates a review request instead of writing directly.

## Development

```bash
# Compile Pi extension (root)
npm run compile

# Compile VS Code extension
cd vscode-ext && npm run compile

# Watch mode (VS Code extension)
cd vscode-ext && npm run watch

# Package VS Code extension as .vsix
cd vscode-ext && npm run package
```

## License

MIT
