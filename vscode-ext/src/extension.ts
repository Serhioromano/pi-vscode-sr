import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ReviewRequest, ReviewResult, ReviewResultFile, DiffSession } from './types';

// Global state
let workspaceRoot: string;
let requestsDir: string;
let resultsDir: string;
let watcher: fs.FSWatcher | null = null;

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

  // Watch for new review requests
  watcher = fs.watch(requestsDir, (_, filename) => {
    if (!filename?.endsWith('.json')) return;
    const fp = path.join(requestsDir, filename);
    if (fs.existsSync(fp)) handleRequest(fp);
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
}

// ─── Handle new review request ────────────────────────────────────────

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
    fileSet.add(file.path);

    const tmpDir = path.join(workspaceRoot, '.pi', 'tmp', req.id);
    fs.mkdirSync(tmpDir, { recursive: true });

    const tmpPath = path.join(tmpDir, path.basename(file.path));
    fs.writeFileSync(tmpPath, file.proposed, 'utf-8');

    // Create original file if it doesn't exist
    const origPath = path.join(workspaceRoot, file.path);
    if (!fs.existsSync(origPath)) {
      fs.mkdirSync(path.dirname(origPath), { recursive: true });
      fs.writeFileSync(origPath, file.original || '', 'utf-8');
    }

    const session: DiffSession = {
      reviewId: req.id,
      filePath: file.path,
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
}

async function rejectCurrent() {
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
}

// ─── Complete review ──────────────────────────────────────────────────

function checkReviewComplete(reviewId: string) {
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
      final = fs.readFileSync(path.join(workspaceRoot, fp), 'utf-8');
    } else {
      // Session went missing — fallback. Safer to treat as rejected.
      console.error(`[Pi Companion] checkReviewComplete: session not found for ${fp} in review ${reviewId}`);
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
}
