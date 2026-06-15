import * as vscode from 'vscode';
import type { PiProcessManager } from './pi-process-manager';
import { streamEvents } from './event-mapper';
import type { AgentEvent } from '@earendil-works/pi-agent-core';

export function createChatHandler(processManager: PiProcessManager): vscode.ChatRequestHandler {
  return async (
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> => {
    // --- Interaction: Lazy Start (UI-SPEC lines 86-93) ---
    stream.progress('Starting Pi...'); // Shown on first @pi message only (D-05)

    try {
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
