# 🔍 Pi VS Code

Secure code review bridge between **Pi coding agent** and **VS Code**. Every file mutation proposed by Pi opens a diff editor — you preview, edit, and approve or reject before anything touches disk.

<img width="800" alt="Pi Defender" src="https://raw.githubusercontent.com/Serhioromano/pi-vscode/refs/heads/main/images/pi-vscode.png">


## ✨ How it works

1. Pi agent generates code changes
2. Instead of writing directly, a **review request** is created
3. VS Code opens a **diff editor** so you can inspect and even edit the proposed changes
4. Choose what to do in a terminal selector:

| Option | Action |
|--------|--------|
| ✅ **Approve** | Apply this file's changes |
| ❌ **Reject** | Discard this file's changes — agent sees an error and must retry |
| ⭐ **Approve All** | Auto-approve every future change for this session |
| 🚪 **Abort** | Stop the agent session immediately |

You can also approve/reject from the diff tab.

## 📦 Installation

### 1. Pi Extension

```bash
pi install pi-vscode-sr
```

Or install locally:

```bash
pi install pi-vscode-sr -l
```

### 2. VS Code Extension

Install from marketplace:

**`serhioromano.vscode-pi-sr`** — Pi Agent Companion

Or search `Pi Agent Companion` in the VS Code Extensions panel.
