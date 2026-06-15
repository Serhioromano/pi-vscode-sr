import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChatHandler } from '../src/chat-handler';
import type { PiProcessManager } from '../src/pi-process-manager';
import type { AgentEvent } from '@earendil-works/pi-agent-core';

describe('createChatHandler', () => {
  let mockProcessManager: PiProcessManager;
  let eventListeners: ((event: AgentEvent) => void)[];

  beforeEach(() => {
    eventListeners = [];
    mockProcessManager = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn().mockResolvedValue(undefined),
      prompt: vi.fn().mockResolvedValue(undefined),
      promptAndWait: vi.fn().mockResolvedValue([]),
      abort: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn().mockImplementation((listener: (event: AgentEvent) => void) => {
        eventListeners.push(listener);
        return () => {
          eventListeners = eventListeners.filter(l => l !== listener);
        };
      }),
      getState: vi.fn().mockResolvedValue({ sessionId: 'test-session' }),
    };
  });

  it('returns a ChatRequestHandler function', () => {
    const handler = createChatHandler(mockProcessManager);
    expect(typeof handler).toBe('function');
  });

  it('sends prompt verbatim to processManager.prompt (D-07 passthrough)', async () => {
    const handler = createChatHandler(mockProcessManager);
    const mockStream = { progress: vi.fn(), markdown: vi.fn() };
    const mockToken = { onCancellationRequested: vi.fn(), isCancellationRequested: false };

    const handlerPromise = handler(
      { prompt: '/model claude-sonnet-4' } as any,
      { history: [{ role: 'user', content: 'hi' }] } as any,
      mockStream as any,
      mockToken as any,
    );

    // Yield so handler progresses past getState() and start() to onEvent setup
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // Emit agent_end to complete the handler
    eventListeners[0]({ type: 'agent_end' } as AgentEvent);
    await handlerPromise;

    expect(mockProcessManager.prompt).toHaveBeenCalledWith('/model claude-sonnet-4');
  });

  it('streams message_update text_delta events to stream.markdown', async () => {
    const handler = createChatHandler(mockProcessManager);
    const mockStream = { progress: vi.fn(), markdown: vi.fn() };
    const mockToken = { onCancellationRequested: vi.fn(), isCancellationRequested: false };

    const handlerPromise = handler(
      { prompt: 'write a poem' } as any,
      { history: [{ role: 'user', content: 'hi' }] } as any,
      mockStream as any,
      mockToken as any,
    );

    // Yield so handler progresses past getState() and start() to onEvent setup
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // Emit a text_delta event
    eventListeners[0]({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'Hello world' } as any,
    } as AgentEvent);

    // Emit agent_end to complete
    eventListeners[0]({ type: 'agent_end' } as AgentEvent);
    await handlerPromise;

    expect(mockStream.markdown).toHaveBeenCalledWith('Hello world');
  });

  it('resolves after agent_end event', async () => {
    const handler = createChatHandler(mockProcessManager);
    const mockStream = { progress: vi.fn(), markdown: vi.fn() };
    const mockToken = { onCancellationRequested: vi.fn(), isCancellationRequested: false };

    const handlerPromise = handler(
      { prompt: 'test' } as any,
      { history: [{ role: 'user', content: 'hi' }] } as any,
      mockStream as any,
      mockToken as any,
    );

    // Yield so handler progresses past getState() and start() to onEvent setup
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // Emit agent_end
    eventListeners[0]({ type: 'agent_end' } as AgentEvent);
    await expect(handlerPromise).resolves.toEqual({});
  });

  it('new session restarts Pi process', async () => {
    const handler = createChatHandler(mockProcessManager);
    const mockStream = { progress: vi.fn(), markdown: vi.fn() };
    const mockToken = { onCancellationRequested: vi.fn(), isCancellationRequested: false };

    const handlerPromise = handler(
      { prompt: 'test' } as any,
      { history: [] } as any, // empty history = new session
      mockStream as any,
      mockToken as any,
    );

    // Yield so handler progresses through restart, getState, start, to onEvent setup
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // Emit agent_end to complete
    eventListeners[0]({ type: 'agent_end' } as AgentEvent);
    await handlerPromise;

    expect(mockProcessManager.restart).toHaveBeenCalled();
  });

  it('cancellation triggers abort in abort mode (D-05)', async () => {
    let resolvePrompt: (() => void) | null = null;
    const pmAbort: PiProcessManager = {
      ...mockProcessManager,
      prompt: vi.fn(() => new Promise<void>(resolve => { resolvePrompt = resolve; })),
    };

    const handler = createChatHandler(pmAbort, {
      toolVisibility: 'verbose',
      interruptionBehavior: 'abort',
    });

    const mockStream = { progress: vi.fn(), markdown: vi.fn() };
    const mockToken = { onCancellationRequested: vi.fn(), isCancellationRequested: false };
    let cancelCb: (() => void) | null = null;
    mockToken.onCancellationRequested = vi.fn((cb: () => void) => { cancelCb = cb; });

    const handlerPromise = handler(
      { prompt: 'test' } as any,
      { history: [{ role: 'user', content: 'hi' }] } as any,
      mockStream as any,
      mockToken as any,
    );

    // Yield so handler progresses past getState(), start(), through sync setup, to prompt()
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // Handler is now suspended at await prompt() — fire cancellation
    cancelCb!();
    // Resolve prompt to let handler reach the race
    resolvePrompt!();

    await expect(handlerPromise).resolves.toEqual({});
    expect(pmAbort.abort).toHaveBeenCalled();
  });
});
