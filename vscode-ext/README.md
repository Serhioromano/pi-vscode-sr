# Pi SR — VS Code Extension

Code review companion for the [Pi Coding Agent](https://pi.ai). When Pi proposes a file change, this extension opens a diff editor with **✓ Accept** and **✗ Reject** buttons so you can review and approve every modification before it touches your files.

## How it works

1. Pi agent wants to write or edit a file
2. The **pi-vscode-sr** npm package intercepts the tool call and writes a review request to `.pi/review-requests/{uuid}.json`
3. This VS Code extension watches for new requests, opens a diff editor, and adds Accept/Reject buttons to the editor title bar
4. Your decision is written to `.pi/review-results/{uuid}.json` — Pi reads it and either applies or discards the change

## Prerequisites

Install the Pi extension first:

```bash
pi install pi-vscode-sr
```

Or add it to your Pi config as an extension.

## Development

```bash
# Compile
npm run compile

# Watch mode
npm run watch

# Package as .vsix
npm run package
```

## License

MIT
