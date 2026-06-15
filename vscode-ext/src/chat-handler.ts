import * as vscode from 'vscode';
import type { PiProcessManager } from './pi-process-manager';
import { streamEvents } from './event-mapper';
import type { AgentEvent } from '@earendil-works/pi-agent-core';

export function createChatHandler(processManager: PiProcessManager): vscode.ChatRequestHandler {
  return async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> => {
    // New VS Code Chat session: restart Pi for a fresh context
    // context.history is empty when the user starts a new chat (clicks New Chat button)
    // Workspace switch is handled separately by onDidChangeWorkspaceFolders in extension.ts
    if (context.history.length === 0) {
      await processManager.restart().catch(() => {
        // restart() calls stop() then start(); stop() is no-op when client is null
      });
    }

    try {
      // Only show lazy-start progress when Pi is not already running (Gap 1 closure, D-05)
      const initialState = await processManager.getState().catch(() => ({ sessionId: null }));
      if (!initialState.sessionId) {
        stream.progress('Starting Pi...');
      }
      // Lazy start: start() is no-op if already running
      await processManager.start();

      // After start completes: show Pi is working
      stream.progress('Pi is working...'); // UI-SPEC: agent_start copy

      // Send prompt and collect all events (Phase 1: batch mode, non-streaming)
      // Use promptAndWait which waits for agent_end before resolving
      // Per Pitfall 3: handler must await completion before resolving
      const events: AgentEvent[] = await processManager.promptAndWait(request.prompt);

      // Map events to stream actions (batch mode for Phase 1)
      streamEvents(events, stream);

      return {}; // ChatResult — empty OK for Phase 1
    } catch (err) {
      // --- Crash Visibility (UI-SPEC lines 95-102, D-06) ---
      // If Pi process exited unexpectedly, show actionable error in chat
      const errorMsg = err instanceof Error ? err.message : String(err);
      stream.markdown(
        '**Pi process exited unexpectedly.**\n\n' +
        '```\n' + errorMsg + '\n```\n\n' +
        'Run `pi -c` in terminal to resume the session. Send another message to restart Pi.'
      );
      return {};
    }
  };
}
