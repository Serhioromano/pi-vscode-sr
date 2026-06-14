/// <reference types="node" />
import * as vscode from 'vscode';
import * as path from 'path';
import { createReviewCoordinator } from './review-coordinator';
import { startHeartbeat, ensurePiDirs, checkPiInstalled } from './utils';
import { IPC_HEARTBEAT } from '../shared/ipc';

export function activate(context: vscode.ExtensionContext) {
  // Phase 1: Sync — must return in <1ms (FOUND-05)
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage('Pi Companion: open a workspace first');
    return;
  }

  // Create factory immediately (synchronous, no I/O)
  const reviewCoordinator = createReviewCoordinator({ workspaceRoot: root });

  // Register sync commands immediately
  context.subscriptions.push(
    vscode.commands.registerCommand('pi-sr.approveCurrent', () => reviewCoordinator.approveCurrent()),
    vscode.commands.registerCommand('pi-sr.rejectCurrent', () => reviewCoordinator.rejectCurrent()),
  );

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

      // Chat participant registration comes in a subsequent plan
      // (Plan 01-05 wires createChatHandler + vscode.chat.createChatParticipant)

    } catch (err) {
      console.error('Pi Companion deferred init failed:', err);
    }
  })();

  // Deactivate provides teardown
  context.subscriptions.push({ dispose: () => reviewCoordinator.stop() });
}

export function deactivate(): void {
  // Teardown handled by subscription dispose callbacks
}
