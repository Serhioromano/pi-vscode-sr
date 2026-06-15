/// <reference types="node" />
import * as vscode from 'vscode';
import * as path from 'path';
import { createReviewCoordinator } from './review-coordinator';
import { createPiProcessManager } from './pi-process-manager';
import { createChatHandler } from './chat-handler';
import { startHeartbeat, ensurePiDirs, checkPiInstalled } from './utils';

export function activate(context: vscode.ExtensionContext) {
  // Phase 1: Sync — must return in <1ms (FOUND-05)
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage('Pi Companion: open a workspace first');
    return;
  }

  // Create factories immediately (synchronous, no I/O)
  const reviewCoordinator = createReviewCoordinator({ workspaceRoot: root });

  // Create PiProcessManager factory immediately (synchronous, no I/O — D-05 lazy start)
  const processManager = createPiProcessManager({ cwd: root });

  // Register sync commands immediately
  context.subscriptions.push(
    vscode.commands.registerCommand('pi-sr.approveCurrent', () => reviewCoordinator.approveCurrent()),
    vscode.commands.registerCommand('pi-sr.rejectCurrent', () => reviewCoordinator.rejectCurrent()),
  );

  // Register chat participant @pi synchronously (CHAT-01)
  // MUST be sync — VS Code Chat API requires handler registered during activation, not in deferred callback
  const chatHandler = createChatHandler(processManager);
  const participant = vscode.chat.createChatParticipant('pi-sr.chat', chatHandler);
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icon.png');
  context.subscriptions.push(participant);

  // Phase 2: Deferred async initialization (fire-and-forget)
  void (async () => {
    try {
      // Check Pi availability
      const piFound = await checkPiInstalled();
      if (!piFound) {
        vscode.window.showInformationMessage(
          'Pi is not installed. Run: npm install -g @earendil-works/pi'
        );
        // Continue — extension still works for other features
      }

      // Ensure .pi/ directories exist
      await ensurePiDirs(root);

      // Start review coordinator (watchers, heartbeat)
      reviewCoordinator.start();

      // Start heartbeat signal
      const heartbeat = startHeartbeat(root);
      context.subscriptions.push(heartbeat);


      // Workspace isolation — stop process on workspace switch (partial D-08).
      // D-08 requires: (1) stop Pi process, (2) save session state, (3) restore on return.
      // This implementation covers (1) stop only. The Pi process will be lazy-restarted
      // on the next @pi message (D-05) with a fresh session for the new workspace.
      //
      // SAVE/RESTORE GAP: state persistence needs cross-workspace storage and
      // workspace-identity keying — deferred to dedicated sub-phase after Phase 1 ships.
      // CWD STALENESS SUB-GAP: processManager was created with cwd=<original root>;
      // factory recreation or setCwd() needed for correct restart in new workspace.
      // Both deferred alongside SAVE/RESTORE.
      context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
          const newRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (newRoot && newRoot !== root) {
            // Workspace root changed — stop the old Pi process (no new process started yet)
            // The next @pi message will lazy-start a fresh process for the new workspace
            processManager.stop().catch((err: unknown) => {
              console.error('Pi Companion: failed to stop Pi process on workspace switch', err);
            });
          }
        })
      );

    } catch (err) {
      console.error('Pi Companion deferred init failed:', err);
    }
  })();

  // Teardown subscriptions
  context.subscriptions.push(
    { dispose: () => reviewCoordinator.stop() },
    { dispose: () => processManager.stop() },
  );
}

export function deactivate(): void {
  // Teardown handled by subscription dispose callbacks
}
