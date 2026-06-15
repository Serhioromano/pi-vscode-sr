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
      if (state.client) return; // Already started
      const { RpcClient: RpcClientClass } = await import('@earendil-works/pi-coding-agent');
      state.client = new RpcClientClass({
        cwd: state.cwd,
        provider: opts.provider,
        model: opts.model,
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
