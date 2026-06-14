import { describe, it, expect } from 'vitest';
import { mapAgentEventToAction, applyStreamAction, StreamAction } from '../src/event-mapper';
import type { AgentEvent } from '@earendil-works/pi-agent-core';

describe('mapAgentEventToAction', () => {
  it('maps agent_start to progress action', () => {
    const event = { type: 'agent_start' } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action).toEqual({ type: 'progress', value: 'Pi is working...' });
  });

  it('maps turn_start to markdown with section break', () => {
    const event = { type: 'turn_start' } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action).toEqual({ type: 'markdown', value: '---' });
  });

  it('maps message_update with text delta to markdown action', () => {
    const event = {
      type: 'message_update',
      assistantMessageEvent: { type: 'delta', delta: { type: 'text', text: 'Hello world' } },
    } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action).toEqual({ type: 'markdown', value: 'Hello world' });
  });

  it('maps message_update with non-text delta to empty markdown', () => {
    const event = {
      type: 'message_update',
      assistantMessageEvent: { type: 'delta', delta: { type: 'tool_use' } },
    } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action).toEqual({ type: 'markdown', value: '' });
  });

  it('maps tool_execution_start to markdown with tool name', () => {
    const event = {
      type: 'tool_execution_start',
      toolName: 'write',
    } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action).toEqual({ type: 'markdown', value: '```\nerror executing write...\n```\n' });
  });

  it('maps tool_execution_update with string partialResult to markdown', () => {
    const event = {
      type: 'tool_execution_update',
      toolName: 'write',
      partialResult: 'Processing...',
    } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action).toEqual({ type: 'markdown', value: 'Processing...' });
  });

  it('maps tool_execution_update with non-string partialResult to empty markdown', () => {
    const event = {
      type: 'tool_execution_update',
      toolName: 'write',
      partialResult: { complex: true },
    } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action).toEqual({ type: 'markdown', value: '' });
  });

  it('maps tool_execution_end with isError true to markdown with failure', () => {
    const event = {
      type: 'tool_execution_end',
      toolName: 'write',
      isError: true,
    } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action.value).toContain('write');
    expect(action.value).toContain('failed');
  });

  it('maps tool_execution_end with isError false to markdown with completion', () => {
    const event = {
      type: 'tool_execution_end',
      toolName: 'write',
      isError: false,
    } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action.value).toContain('write');
    expect(action.value).toContain('completed');
  });

  it('maps agent_end to done action', () => {
    const event = { type: 'agent_end' } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action).toEqual({ type: 'done' });
  });

  it('maps message_end to empty markdown', () => {
    const event = { type: 'message_end' } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action).toEqual({ type: 'markdown', value: '' });
  });

  it('maps unknown event type to empty markdown', () => {
    const event = { type: 'turn_end' } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action).toEqual({ type: 'markdown', value: '' });
  });

  it('handles agent_end with no preceding message_update (Open Question 3)', () => {
    const event = {
      type: 'agent_end',
      messages: [{ role: 'assistant', content: [{ type: 'text', text: 'Final response' }] }],
    } as AgentEvent;
    const action = mapAgentEventToAction(event);
    // Fallback: if no message_update processed, extract from agent_end.messages
    expect(action.type).toBe('done');
    // Additional text extraction from agent_end.messages is deferred -- Phase 2 streaming
  });
});

describe('applyStreamAction', () => {
  it('calls stream.progress for progress action', () => {
    const stream = { progress: () => {}, markdown: () => {} };
    let called = '';
    stream.progress = (v: string) => { called = v; };
    applyStreamAction(stream as any, { type: 'progress', value: 'Test' });
    expect(called).toBe('Test');
  });

  it('calls stream.markdown for markdown action', () => {
    const stream = { progress: () => {}, markdown: () => {} };
    let called = '';
    stream.markdown = (v: string) => { called = v; };
    applyStreamAction(stream as any, { type: 'markdown', value: 'Test' });
    expect(called).toBe('Test');
  });

  it('does not call stream.markdown for empty markdown action', () => {
    const stream = { progress: () => {}, markdown: () => {} };
    let called = false;
    stream.markdown = () => { called = true; };
    applyStreamAction(stream as any, { type: 'markdown', value: '' });
    expect(called).toBe(false);
  });
});
