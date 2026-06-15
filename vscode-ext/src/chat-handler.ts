import * as vscode from 'vscode';
import type { PiProcessManager } from './pi-process-manager';
import { mapAgentEventToAction, applyStreamAction } from './event-mapper';
import type { AgentEvent } from '@earendil-works/pi-agent-core';

export type InterruptionBehavior = 'abort' | 'followUp';

export interface ChatSettings {
  toolVisibility: 'verbose' | 'quiet';
  interruptionBehavior: InterruptionBehavior;
}

class CancellationError extends Error {
  constructor() {
    super('Chat request cancelled by user');
    this.name = 'CancellationError';
  }
}

export function createChatHandler(
  processManager: PiProcessManager,
  settings?: ChatSettings
): vscode.ChatRequestHandler {
  const resolvedSettings: ChatSettings = settings ?? {
    toolVisibility: 'verbose',
    interruptionBehavior: 'abort',
  };

  return async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> => {
    // New VS Code Chat session: restart Pi for a fresh context
    // context.history is empty when the user starts a new chat
    if (context.history.length === 0) {
      await processManager.restart().catch(() => {});
    }

    try {
      // Lazy start: show progress only when Pi is not already running (Gap 1 closure, D-05)
      const initialState = await processManager.getState().catch(() => ({ sessionId: null }));
      if (!initialState.sessionId) {
        stream.progress('Starting Pi...');
      }
      await processManager.start();

      // After start completes: show Pi is working
      stream.progress('Pi is working...'); // UI-SPEC: agent_start copy

      try {
        // Subscribe to events BEFORE prompt (Pitfall 1 — CRITICAL)
        let resolveCompletion: (() => void) | null = null;
        const onComplete = new Promise<void>((resolve) => {
          resolveCompletion = resolve;
        });

        const unsubscribe = processManager.onEvent((event: AgentEvent) => {
          const action = mapAgentEventToAction(event, resolvedSettings.toolVisibility);
          applyStreamAction(stream, action);
          if (event.type === 'agent_end') {
            resolveCompletion?.();
          }
        });

        try {
          // Create cancellation race (Pitfall 4 prevention, D-05)
          const abortController = new AbortController();
          token.onCancellationRequested(() => abortController.abort());

          const rejectOnAbort = new Promise<never>((_, reject) => {
            if (abortController.signal.aborted) {
              reject(new CancellationError());
              return;
            }
            abortController.signal.addEventListener('abort', () => {
              reject(new CancellationError());
            });
          });

          // Send prompt verbatim (D-07 passthrough — no parsing, no inspection)
          await processManager.prompt(request.prompt);

          // Race: completion vs cancellation (Pitfall 4 prevention, D-05)
          await Promise.race([onComplete, rejectOnAbort]);
        } catch (err) {
          if (err instanceof CancellationError) {
            if (resolvedSettings.interruptionBehavior === 'abort') {
              await processManager.abort();
            }
            // followUp: Do not abort — VS Code handler re-invocation + Pi's internal
            // queue processes the new message after the current turn completes.
            // Per D-05: functionally identical to calling RpcClient.followUp() directly.
            return {};
          }
          throw err;
        } finally {
          unsubscribe();
        }

        return {};
      } catch (err) {
        // Non-cancellation error inside the streaming block — propagate to outer crash handler
        throw err;
      }
    } catch (err) {
      // --- Crash Visibility (UI-SPEC lines 95-102, D-06) ---
      // If Pi process exited unexpectedly, show actionable error in chat
      const errorMsg = err instanceof Error ? err.message : String(err);
      stream.markdown(
        '**Pi process exited unexpectedly.**\n\n' +
        '```\n' + errorMsg + '\n```\n\n' +
        'Send another message to restart.'
      );
      return {};
    }
  };
}
