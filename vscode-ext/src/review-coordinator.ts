import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { ReviewRequest, ReviewResult, ReviewResultFile, DiffSession } from '../../shared/types';
import { resolveSafe } from '../../shared/path-utils';
import { IPC_REVIEW_REQUESTS, IPC_REVIEW_RESULTS, IPC_TMP } from '../../shared/ipc';

export interface ReviewCoordinator {
  start(): Promise<void>;
  stop(): void;
  handleRequest(requestPath: string): Promise<void>;
  approveCurrent(): Promise<void>;
  rejectCurrent(): Promise<void>;
  handleResult(resultPath: string): Promise<void>;
  closeReviewTabs(reviewId: string): Promise<void>;
  checkReviewComplete(reviewId: string): Promise<void>;
}

export function createReviewCoordinator(opts: {
  workspaceRoot: string;
}): ReviewCoordinator {
  const workspaceRoot = opts.workspaceRoot;
  const requestsDir = path.join(workspaceRoot, IPC_REVIEW_REQUESTS);
  const resultsDir = path.join(workspaceRoot, IPC_REVIEW_RESULTS);
  // key = tmpFsPath (URI.fsPath of the active editor)
  const sessions = new Map<string, DiffSession>();
  // key = reviewId, value = set of file paths in this review
  const reviewFiles = new Map<string, Set<string>>();
  let watcher: fsSync.FSWatcher | null = null;
  let resultsWatcher: fsSync.FSWatcher | null = null;

  // ─── Session lookup ──────────────────────────────────────────────────

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

  // ─── Lifecycle ───────────────────────────────────────────────────────

  async function start(): Promise<void> {
    try {
      await fs.mkdir(requestsDir, { recursive: true });
      await fs.mkdir(resultsDir, { recursive: true });

      // Watch for new review requests
      watcher = fsSync.watch(requestsDir, (_event: string, filename: string | null) => {
        if (!filename?.endsWith('.json')) return;
        const fp = path.join(requestsDir, filename);
        // Check file still exists (watch fires for delete events too)
        fs.stat(fp).then(() => {
          handleRequest(fp).catch((err: unknown) =>
            console.error('ReviewCoordinator: handleRequest error', err)
          );
        }).catch(() => {});
      });

      // Watch for review results (written by Pi from terminal TUI)
      resultsWatcher = fsSync.watch(resultsDir, (_event: string, filename: string | null) => {
        if (!filename?.endsWith('.json')) return;
        const fp = path.join(resultsDir, filename);
        fs.stat(fp).then(() => {
          handleResult(fp).catch((err: unknown) =>
            console.error('ReviewCoordinator: handleResult error', err)
          );
        }).catch(() => {});
      });

      // Recover incomplete reviews
      const files = await fs.readdir(requestsDir);
      for (const f of files) {
        if (f.endsWith('.json')) {
          await handleRequest(path.join(requestsDir, f));
        }
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Pi Companion: failed to start review coordinator — ${err}`);
    }
  }

  function stop(): void {
    watcher?.close();
    resultsWatcher?.close();
    watcher = null;
    resultsWatcher = null;
  }

  // ─── Handle new review request ──────────────────────────────────────

  async function handleRequest(requestPath: string): Promise<void> {
    let req: ReviewRequest;
    try {
      const raw = await fs.readFile(requestPath, 'utf-8');
      req = JSON.parse(raw);
    } catch (err) {
      vscode.window.showErrorMessage(`Pi Review: malformed JSON in ${requestPath}`);
      console.error('ReviewCoordinator: malformed JSON', err);
      return;
    }

    if (!req.id || !req.files?.length) return;

    // Skip if this review is already being processed
    if (reviewFiles.has(req.id)) return;

    const fileSet = new Set<string>();
    reviewFiles.set(req.id, fileSet);

    // For each file: create tmp, open diff
    for (const file of req.files) {
      // Normalize path (LLM may pass cwd-relative without leading /)
      const normalizedPath = resolveSafe(workspaceRoot, file.path);
      fileSet.add(normalizedPath);

      const tmpDir = path.join(workspaceRoot, IPC_TMP, req.id);
      await fs.mkdir(tmpDir, { recursive: true });

      const tmpPath = path.join(tmpDir, path.basename(normalizedPath));
      await fs.writeFile(tmpPath, file.proposed, 'utf-8');

      // Create original file if it doesn't exist
      try {
        await fs.access(normalizedPath);
      } catch {
        await fs.mkdir(path.dirname(normalizedPath), { recursive: true });
        await fs.writeFile(normalizedPath, file.original || '', 'utf-8');
      }

      const session: DiffSession = {
        reviewId: req.id,
        filePath: normalizedPath,
        originalFsPath: normalizedPath,
        tmpFsPath: tmpPath,
        status: 'pending',
      };
      sessions.set(tmpPath, session);

      // Open diff
      vscode.commands.executeCommand(
        'vscode.diff',
        vscode.Uri.file(normalizedPath),
        vscode.Uri.file(tmpPath),
        `Pi: ${file.path}`
      ).then(() => {
        vscode.commands.executeCommand('setContext', 'piSr.isActive', true);
      });
    }
  }

  // ─── Approve / Reject ───────────────────────────────────────────────

  async function approveCurrent(): Promise<void> {
    try {
      const s = getCurrentSession();
      if (!s) {
        vscode.window.showErrorMessage('Pi Companion: no review session found. Is the diff editor open?');
        return;
      }

      // Read edited content from tmp file
      const edited = await fs.readFile(s.tmpFsPath, 'utf-8');

      // Write to original
      await fs.writeFile(s.originalFsPath, edited, 'utf-8');

      // Remove tmp
      try {
        await fs.unlink(s.tmpFsPath);
      } catch (err) {
        console.error('ReviewCoordinator: failed to unlink tmp file', err);
      }

      s.status = 'approved';

      // Close diff tab
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

      await checkReviewComplete(s.reviewId);
    } catch (err) {
      vscode.window.showErrorMessage(`Pi Companion: approve failed — ${err}`);
    }
  }

  async function rejectCurrent(): Promise<void> {
    try {
      const s = getCurrentSession();
      if (!s) {
        vscode.window.showErrorMessage('Pi Companion: no review session found. Is the diff editor open?');
        return;
      }

      // Remove tmp
      try {
        await fs.unlink(s.tmpFsPath);
      } catch (err) {
        console.error('ReviewCoordinator: failed to unlink tmp file', err);
      }

      s.status = 'rejected';

      // Close diff tab
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

      await checkReviewComplete(s.reviewId);
    } catch (err) {
      vscode.window.showErrorMessage(`Pi Companion: reject failed — ${err}`);
    }
  }

  // ── Handle result written by Pi (terminal TUI) ──────────────────────

  async function handleResult(resultPath: string): Promise<void> {
    let result: ReviewResult;
    try {
      const raw = await fs.readFile(resultPath, 'utf-8');
      result = JSON.parse(raw);
    } catch (err) {
      console.error('ReviewCoordinator: malformed result JSON', err);
      return;
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
    try {
      await fs.unlink(requestPath);
    } catch (err) {
      console.error('ReviewCoordinator: failed to unlink request file', err);
    }

    // Clean up tmp directory
    const tmpDir = path.join(workspaceRoot, IPC_TMP, result.id);
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (err) {
      console.error('ReviewCoordinator: failed to clean up tmp dir', err);
    }

    // Reset context
    reviewFiles.delete(result.id);

    // Check if any reviews are still active
    const anyPending = reviewFiles.size > 0;
    vscode.commands.executeCommand('setContext', 'piSr.isActive', anyPending);
  }

  // ── Close all diff tabs for a review ───────────────────────────────

  async function closeReviewTabs(reviewId: string): Promise<void> {
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
        } catch (err) {
          console.error('ReviewCoordinator: failed to close tab', err);
        }
      }
    } catch (err) {
      console.error('ReviewCoordinator: failed to close review tabs', err);
    }
  }

  // ─── Complete review ────────────────────────────────────────────────

  async function checkReviewComplete(reviewId: string): Promise<void> {
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
          final = await fs.readFile(filePath, 'utf-8');
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
      await fs.writeFile(resultPath, JSON.stringify(result, null, 2), 'utf-8');

      // Remove request file
      const requestPath = path.join(requestsDir, `${reviewId}.json`);
      try {
        await fs.unlink(requestPath);
      } catch (err) {
        console.error('ReviewCoordinator: failed to unlink request file', err);
      }

      // Clean up tmp directory
      const tmpDir = path.join(workspaceRoot, IPC_TMP, reviewId);
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch (err) {
        console.error('ReviewCoordinator: failed to clean up tmp dir', err);
      }

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

  return {
    start,
    stop,
    handleRequest,
    approveCurrent,
    rejectCurrent,
    handleResult,
    closeReviewTabs,
    checkReviewComplete,
  };
}
