import type { AgentEvent } from '@earendil-works/pi-agent-core';
import type { RpcClient } from '@earendil-works/pi-coding-agent';

export interface PiProcessManagerState {
  client: RpcClient | null;
  cwd: string;
  model?: string;
  provider?: string;
  sessionId: string | null;
}

export interface PiProcessManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  prompt(message: string): Promise<void>;
  promptAndWait(message: string, timeout?: number): Promise<AgentEvent[]>;
  abort(): Promise<void>;
  onEvent(listener: (event: AgentEvent) => void): () => void;
  getState(): Promise<{ sessionId: string | null }>;
}

export function createPiProcessManager(opts: {
  cwd: string;
  model?: string;
  provider?: string;
  cliPath?: string | null;
}): PiProcessManager {
  const state: PiProcessManagerState = {
    client: null,
    cwd: opts.cwd,
    model: opts.model,
    provider: opts.provider,
    sessionId: null,
  };
  const listeners = new Set<(event: AgentEvent) => void>();

  return {
    async start() {
      if (state.client) {
        // Verify the existing RpcClient is alive — the child process may have been
        // killed externally while the JS object remains in memory (Gap 2, UAT Test 4)
        try {
          await state.client.getState();
          return; // Client is alive — no need to recreate
        } catch {
          // Client is dead (child process killed, IPC broken).
          // Clean up and throw to surface the crash to the caller (D-06: No silent restarts).
          // The chat handler's catch block will show the pi -c recovery error.
          state.client = null;
          state.sessionId = null;
          throw new Error('Pi process exited unexpectedly. Run `pi -c` in terminal to resume the session. Send another message to restart Pi.');
        }
      }
      // Bypass tsc's import()->require() rewriting — pi-coding-agent is ESM-only
      const { RpcClient: RpcClientClass } = await new Function(
        'spec', 'return import(spec)'
      )('@earendil-works/pi-coding-agent') as typeof import('@earendil-works/pi-coding-agent');
      state.client = new RpcClientClass({
        cwd: state.cwd,
        provider: opts.provider,
        model: opts.model,
        cliPath: opts.cliPath ?? undefined,
      });
      await state.client.start();
      // Per Open Question 1: start() implicitly creates a session
      const sessionState = await state.client.getState();
      state.sessionId = sessionState.sessionId;
      // Forward events from RpcClient to our listeners
      state.client.onEvent((event: AgentEvent) => {
        for (const listener of listeners) {
          listener(event);
        }
      });
    },

    async stop() {
      if (!state.client) return;
      await state.client.stop();
      state.client = null;
      state.sessionId = null;
    },

    async restart() {
      await this.stop();
      await this.start();
    },

    async prompt(message: string) {
      if (!state.client) throw new Error('Pi process not started');
      await state.client.prompt(message);
    },

    async promptAndWait(message: string, timeout?: number) {
      if (!state.client) throw new Error('Pi process not started');
      return state.client.promptAndWait(message, [], timeout);
    },

    async abort() {
      if (!state.client) return;
      await state.client.abort();
    },

    onEvent(listener: (event: AgentEvent) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async getState() {
      if (!state.client) return { sessionId: null };
      const s = await state.client.getState();
      return { sessionId: s.sessionId };
    },
  };
}
