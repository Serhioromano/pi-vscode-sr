## Build & Update Rules

1. After updating any `*.ts` file, update:
   - `README.md` — document changes, protocol, usage
   - `CHANGELOG.md` — add entry with version and description
   - `AGENTS.md` — keep spec in sync with actual implementation

2. Compile VS Code extension:
   ```bash
   cd vscode-ext && npx tsc -p tsconfig.json
   ```

3. Run extension in debug mode:
   - Open root project in VS Code
   - Press **F5**
   - In the new window, check Console (Ctrl+Shift+I) for `[Pi Companion] activated`
   - To test: copy `.pi/review-requests/test.json` to trigger a diff

4. Package as `.vsix`:
   ```bash
   cd vscode-ext && npx @vscode/vsce package
   ```

5. Pi should look at Pi documentation for best practices
