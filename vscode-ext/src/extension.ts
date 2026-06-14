/// <reference types="node" />
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ReviewRequest, ReviewResult, ReviewResultFile, DiffSession } from './types';

// Global state
let workspaceRoot: string;
let requestsDir: string;
let resultsDir: string;
let watcher: fs.FSWatcher | null = null;
let resultsWatcher: fs.FSWatcher | null = null;

// key = tmpFsPath (URI.fsPath of the active editor)
const sessions = new Map<string, DiffSession>();
// key = reviewId, value = set of file paths in this review
const reviewFiles = new Map<string, Set<string>>();

export function activate(context: vscode.ExtensionContext) {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage('Pi Companion: open a workspace first');
    return;
  }
  workspaceRoot = root;
  requestsDir = path.join(workspaceRoot, '.pi', 'review-requests');
  resultsDir = path.join(workspaceRoot, '.pi', 'review-results');

  // Create directories
  fs.mkdirSync(requestsDir, { recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });

  // Signal to Pi that VS Code is open with this project (heartbeat: timestamp)
  const readyFile = path.join(workspaceRoot, '.pi', '.vscode-ready');
  fs.writeFileSync(readyFile, Date.now().toString(), 'utf-8');
  const heartbeatTimer = setInterval(() => {
    try { fs.writeFileSync(readyFile, Date.now().toString(), 'utf-8'); } catch {}
  }, 15_000);
  context.subscriptions.push({ dispose: () => clearInterval(heartbeatTimer) });

  // Watch for new review requests
  watcher = fs.watch(requestsDir, (_event: string, filename: string | null) => {
    if (!filename?.endsWith('.json')) return;
    const fp = path.join(requestsDir, filename);
    if (fs.existsSync(fp)) handleRequest(fp);
  });

  // Watch for review results (written by Pi from terminal TUI).
  // When Pi writes a result, close all diff tabs and clean up.
  resultsWatcher = fs.watch(resultsDir, (_event: string, filename: string | null) => {
    if (!filename?.endsWith('.json')) return;
    const fp = path.join(resultsDir, filename);
    if (fs.existsSync(fp)) handleResult(fp);
  });

  // Recover incomplete reviews
  for (const f of fs.readdirSync(requestsDir)) {
    if (f.endsWith('.json')) handleRequest(path.join(requestsDir, f));
  }

  // Commands for editor/title buttons
  context.subscriptions.push(
    vscode.commands.registerCommand('pi-sr.approveCurrent', () => approveCurrent()),
    vscode.commands.registerCommand('pi-sr.rejectCurrent', () => rejectCurrent()),
  );
}

export function deactivate() {
  watcher?.close();
  resultsWatcher?.close();

  // Remove readiness signal
  try {
    const readyFile = path.join(workspaceRoot, '.pi', '.vscode-ready');
    if (fs.existsSync(readyFile)) fs.unlinkSync(readyFile);
  } catch {}
}

// ─── Handle new review request ────────────────────────────────────────

/** Normalize a file path from review request, handling LLM paths without leading /. */
function resolveSafe(filePath: string): string {
  if (filePath.startsWith('/')) return filePath; // Already absolute
  // If filePath starts with cwd-without-leading-slash (LLM forgot the /),
  // strip the duplicate prefix so path.join doesn't double it.
  const cwdClean = workspaceRoot.replace(/\/+$/, '').replace(/^\//, '');
  if (filePath.startsWith(cwdClean + '/')) {
    filePath = filePath.substring(cwdClean.length + 1);
  }
  return path.join(workspaceRoot, filePath);
}

function handleRequest(requestPath: string) {
  let req: ReviewRequest;
  try {
    req = JSON.parse(fs.readFileSync(requestPath, 'utf-8'));
  } catch {
    vscode.window.showErrorMessage(`Pi Review: malformed JSON in ${requestPath}`);
    return;
  }

  if (!req.id || !req.files?.length) return;

  // Skip if this review is already being processed
  if (reviewFiles.has(req.id)) return;

  const fileSet = new Set<string>();
  reviewFiles.set(req.id, fileSet);

  // For each file: create tmp, open diff
  req.files.forEach(file => {
    // Normalize path (LLM may pass cwd-relative without leading /)
    const normalizedPath = resolveSafe(file.path);
    fileSet.add(normalizedPath);

    const tmpDir = path.join(workspaceRoot, '.pi', 'tmp', req.id);
    fs.mkdirSync(tmpDir, { recursive: true });

    const tmpPath = path.join(tmpDir, path.basename(normalizedPath));
    fs.writeFileSync(tmpPath, file.proposed, 'utf-8');

    // Create original file if it doesn't exist
    const origPath = normalizedPath;
    if (!fs.existsSync(origPath)) {
      fs.mkdirSync(path.dirname(origPath), { recursive: true });
      fs.writeFileSync(origPath, file.original || '', 'utf-8');
    }

    const session: DiffSession = {
      reviewId: req.id,
      filePath: normalizedPath,
      originalFsPath: origPath,
      tmpFsPath: tmpPath,
      status: 'pending',
    };
    sessions.set(tmpPath, session);

    // Open diff
    vscode.commands.executeCommand(
      'vscode.diff',
      vscode.Uri.file(origPath),
      vscode.Uri.file(tmpPath),
      `Pi: ${file.path}`
    ).then(() => {
      vscode.commands.executeCommand('setContext', 'piSr.isActive', true);
    });
  });
}

// ─── Approve / Reject ─────────────────────────────────────────────────

function getCurrentSession(): DiffSession | undefined {
  // Tier 1: active editor (fast path — works when tmp side has focus)
  const active = vscode.window.activeTextEditor;
  if (active) {
    const s = sessions.get(active.document.uri.fsPath);
    if (s) return s;
  }
  // Tier 2: all visible editors (catches original side of diff)
  for (const editor of vscode.window.visibleTextEditors) {
    const s = sessions.get(editor.document.uri.fsPath);
    if (s) return s;
  }
  // Tier 3: if exactly one pending session exists, return it
  // (handles edge case where diff editor sides aren't in visibleTextEditors)
  const pending: DiffSession[] = [];
  for (const s of sessions.values()) {
    if (s.status === 'pending') pending.push(s);
  }
  if (pending.length === 1) return pending[0];

  return undefined;
}

async function approveCurrent() {
  try {
    const s = getCurrentSession();
    if (!s) {
      vscode.window.showErrorMessage('Pi Companion: no review session found. Is the diff editor open?');
      return;
    }

    // Read edited content from tmp file
    const edited = fs.readFileSync(s.tmpFsPath, 'utf-8');

    // Write to original
    fs.writeFileSync(s.originalFsPath, edited, 'utf-8');

    // Remove tmp
    try { fs.unlinkSync(s.tmpFsPath); } catch {}

    s.status = 'approved';

    // Close diff tab
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

    checkReviewComplete(s.reviewId);
  } catch (err) {
    vscode.window.showErrorMessage(`Pi Companion: approve failed — ${err}`);
  }
}

async function rejectCurrent() {
  try {
    const s = getCurrentSession();
    if (!s) {
      vscode.window.showErrorMessage('Pi Companion: no review session found. Is the diff editor open?');
      return;
    }

    // Remove tmp
    try { fs.unlinkSync(s.tmpFsPath); } catch {}

    s.status = 'rejected';

    // Close diff tab
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

    checkReviewComplete(s.reviewId);
  } catch (err) {
    vscode.window.showErrorMessage(`Pi Companion: reject failed — ${err}`);
  }
}

// ── Handle result written by Pi (terminal TUI) ──────────────────────

async function handleResult(resultPath: string) {
  let result: ReviewResult;
  try {
    result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
  } catch {
    return; // malformed or partially written — ignore
  }

  if (!result.id) return;

  // Close all diff tabs for this review
  await closeReviewTabs(result.id);

  // Clean up sessions
  for (const [key, s] of sessions) {
    if (s.reviewId === result.id) sessions.delete(key);
  }

  // Clean up request file
  const requestPath = path.join(requestsDir, `${result.id}.json`);
  try { fs.unlinkSync(requestPath); } catch {}

  // Clean up tmp directory
  const tmpDir = path.join(workspaceRoot, '.pi', 'tmp', result.id);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  // Reset context
  reviewFiles.delete(result.id);

  // Check if any reviews are still active
  const anyPending = [...reviewFiles.keys()].length > 0;
  vscode.commands.executeCommand('setContext', 'piSr.isActive', anyPending);
}

// ── Close all diff tabs for a review ─────────────────────────────────

async function closeReviewTabs(reviewId: string) {
  try {
    const groups = vscode.window.tabGroups?.all;
    if (!groups) return;
    const allTabs = groups.flatMap(g => g?.tabs ?? []);
    for (const tab of allTabs) {
      try {
        const input = tab.input;
        if (!input || typeof input !== 'object') continue;
        // Diff tabs have 'original' and 'modified' properties
        const diffInput = input as Record<string, unknown>;
        if (!('modified' in diffInput)) continue;
        const modifiedUri = diffInput.modified;
        if (!(modifiedUri instanceof vscode.Uri)) continue;
        const session = sessions.get(modifiedUri.fsPath);
        if (session?.reviewId === reviewId) {
          await vscode.window.tabGroups.close(tab);
        }
      } catch {
        // Individual tab close failure — ignore and continue
      }
    }
  } catch {
    // tabGroups API unavailable or failed — ignore
  }
}

// ─── Complete review ──────────────────────────────────────────────────

function checkReviewComplete(reviewId: string) {
  try {
    // Any pending sessions left for this review?
    for (const s of sessions.values()) {
      if (s.reviewId === reviewId && s.status === 'pending') return; // not done yet
    }

    // All files processed — build result
    const files: ReviewResultFile[] = [];
    const fileSet = reviewFiles.get(reviewId);
    if (!fileSet) return;

    let allApproved = true;
    let processed = false;

    for (const fp of fileSet) {
      const session = [...sessions.values()].find(s => s.filePath === fp);

      // Pending — shouldn't happen (checked above), but guard anyway
      if (session?.status === 'pending') continue;

      let status: 'approved' | 'rejected';
      let final = '';

      if (session?.status === 'rejected') {
        status = 'rejected';
      } else if (session?.status === 'approved') {
        status = 'approved';
        // fp should be absolute from resolveSafe(), but guard against relative paths
        const filePath = fp.startsWith('/') ? fp : path.join(workspaceRoot, fp);
        final = fs.readFileSync(filePath, 'utf-8');
      } else {
        // Session went missing — fallback. Safer to treat as rejected.
        status = 'rejected';
      }

      files.push({ path: fp, status, final });
      processed = true;

      if (status !== 'approved') allApproved = false;
    }

    // Clean up sessions for this review
    for (const [key, s] of sessions) {
      if (s.reviewId === reviewId) sessions.delete(key);
    }

    const result: ReviewResult = {
      id: reviewId,
      status: !processed ? 'rejected' : allApproved ? 'approved' : 'rejected',
      files,
    };

    // Write result
    const resultPath = path.join(resultsDir, `${reviewId}.json`);
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf-8');

    // Remove request file
    const requestPath = path.join(requestsDir, `${reviewId}.json`);
    try { fs.unlinkSync(requestPath); } catch {}

    // Clean up tmp directory
    const tmpDir = path.join(workspaceRoot, '.pi', 'tmp', reviewId);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

    // Reset context
    vscode.commands.executeCommand('setContext', 'piSr.isActive', false);

    reviewFiles.delete(reviewId);

    vscode.window.showInformationMessage(
      `Pi Companion: ${result.status === 'approved' ? 'accepted' : 'rejected'} (${files.filter(f => f.status === 'approved').length}/${files.length})`
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Pi Companion: review completion failed — ${err}`);
  }
}
