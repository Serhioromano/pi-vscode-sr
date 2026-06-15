import { describe, it, expect, vi } from 'vitest';
import { mapAgentEventToAction, applyStreamAction, StreamAction } from '../src/event-mapper';
import type { AgentEvent } from '@earendil-works/pi-agent-core';

// Mock the vscode module so MarkdownString can be constructed in tests.
// In the VS Code extension host, the real vscode module is always available;
// in unit tests we substitute a minimal stand-in.
vi.mock('vscode', () => {
  class MockMarkdownString {
    value: string;
    supportHtml: boolean = false;
    isTrusted: boolean = false;
    constructor(value?: string) { this.value = value ?? ''; }
  }
  return { MarkdownString: MockMarkdownString };
});

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
      assistantMessageEvent: { type: 'text_delta', delta: 'Hello world' } as any,
    } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action).toEqual({ type: 'markdown', value: 'Hello world' });
  });

  it('maps message_update with non-text delta to empty markdown', () => {
    const event = {
      type: 'message_update',
      assistantMessageEvent: { type: 'tool_use' } as any,
    } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action).toEqual({ type: 'markdown', value: '' });
  });

  // Phase 2: tool events with buffering and ToolVisibility

  it('tool_execution_start returns progress in verbose mode', () => {
    const event = {
      type: 'tool_execution_start',
      toolName: 'read',
      args: { file: 'test.ts' },
    } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action).toEqual({ type: 'progress', value: 'Tool: read' });
  });

  it('tool_execution_start returns empty markdown in quiet mode', () => {
    const event = {
      type: 'tool_execution_start',
      toolName: 'read',
      args: { file: 'test.ts' },
    } as AgentEvent;
    const action = mapAgentEventToAction(event, 'quiet');
    expect(action).toEqual({ type: 'markdown', value: '' });
  });

  it('tool_execution_start without toolVisibility defaults to verbose', () => {
    const event = {
      type: 'tool_execution_start',
      toolName: 'write',
    } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action.type).toBe('progress');
    expect(action.value).toContain('Tool:');
  });

  it('tool_execution_update accumulates partial results in verbose mode', () => {
    const startEvent = {
      type: 'tool_execution_start',
      toolName: 'read',
      args: { file: 'test.ts' },
    } as AgentEvent;
    mapAgentEventToAction(startEvent);

    const updateEvent = {
      type: 'tool_execution_update',
      toolName: 'read',
      partialResult: 'partial content',
    } as AgentEvent;
    const action = mapAgentEventToAction(updateEvent);
    // No per-update output
    expect(action).toEqual({ type: 'markdown', value: '' });
  });

  it('tool_execution_update returns empty in quiet mode', () => {
    const event = {
      type: 'tool_execution_update',
      toolName: 'read',
      partialResult: 'content',
    } as AgentEvent;
    const action = mapAgentEventToAction(event, 'quiet');
    expect(action).toEqual({ type: 'markdown', value: '' });
  });

  it('tool_execution_update returns empty for non-string partialResult', () => {
    const startEvent = {
      type: 'tool_execution_start',
      toolName: 'read',
      args: {},
    } as AgentEvent;
    mapAgentEventToAction(startEvent);

    const event = {
      type: 'tool_execution_update',
      toolName: 'read',
      partialResult: { complex: true },
    } as AgentEvent;
    const action = mapAgentEventToAction(event);
    expect(action).toEqual({ type: 'markdown', value: '' });
  });

  it('tool_execution_end returns collapsible section in verbose mode', () => {
    const startEvent = {
      type: 'tool_execution_start',
      toolName: 'read',
      args: { file: 'test.ts' },
    } as AgentEvent;
    mapAgentEventToAction(startEvent);

    const updateEvent = {
      type: 'tool_execution_update',
      toolName: 'read',
      partialResult: 'line1',
    } as AgentEvent;
    mapAgentEventToAction(updateEvent);

    const endEvent = {
      type: 'tool_execution_end',
      toolName: 'read',
      isError: false,
    } as AgentEvent;
    const action = mapAgentEventToAction(endEvent);
    expect(action.type).toBe('markdown');
    const md = action.value as any;
    expect(md.supportHtml).toBe(true);
    expect(md.value).toContain('<details>');
    expect(md.value).toContain('<summary>');
    expect(md.value).toContain('line1');
  });

  it('tool_execution_end returns empty in quiet mode', () => {
    const startEvent = {
      type: 'tool_execution_start',
      toolName: 'read',
      args: {},
    } as AgentEvent;
    mapAgentEventToAction(startEvent, 'quiet');

    const endEvent = {
      type: 'tool_execution_end',
      toolName: 'read',
      isError: false,
    } as AgentEvent;
    const action = mapAgentEventToAction(endEvent, 'quiet');
    expect(action).toEqual({ type: 'markdown', value: '' });
  });

  it('tool_execution_end with isError shows failed status', () => {
    const startEvent = {
      type: 'tool_execution_start',
      toolName: 'write',
      args: {},
    } as AgentEvent;
    mapAgentEventToAction(startEvent);

    const endEvent = {
      type: 'tool_execution_end',
      toolName: 'write',
      isError: true,
    } as AgentEvent;
    const action = mapAgentEventToAction(endEvent);
    expect(action.type).toBe('markdown');
    const md = action.value as any;
    expect(md.value).toContain('Failed');
    expect(md.value).toContain('$(error)');
  });

  it('tool_execution_end with isError false shows completed status', () => {
    const startEvent = {
      type: 'tool_execution_start',
      toolName: 'write',
      args: {},
    } as AgentEvent;
    mapAgentEventToAction(startEvent);

    const endEvent = {
      type: 'tool_execution_end',
      toolName: 'write',
      isError: false,
    } as AgentEvent;
    const action = mapAgentEventToAction(endEvent);
    expect(action.type).toBe('markdown');
    const md = action.value as any;
    expect(md.value).toContain('Completed');
    expect(md.value).toContain('$(check)');
  });

  it('message_end resets tool buffer', () => {
    const startEvent = {
      type: 'tool_execution_start',
      toolName: 'read',
      args: {},
    } as AgentEvent;
    mapAgentEventToAction(startEvent);

    const messageEndEvent = { type: 'message_end' } as AgentEvent;
    mapAgentEventToAction(messageEndEvent);

    // After message_end, the buffer is reset so tool_execution_end
    // produces no output (no orphaned section).
    const endEvent = {
      type: 'tool_execution_end',
      toolName: 'read',
      isError: false,
    } as AgentEvent;
    const action = mapAgentEventToAction(endEvent);
    expect(action).toEqual({ type: 'markdown', value: '' });
  });

  it('agent_end resets tool buffer', () => {
    const startEvent = {
      type: 'tool_execution_start',
      toolName: 'read',
      args: {},
    } as AgentEvent;
    mapAgentEventToAction(startEvent);

    const agentEndEvent = { type: 'agent_end' } as AgentEvent;
    const agentEndAction = mapAgentEventToAction(agentEndEvent);
    expect(agentEndAction).toEqual({ type: 'done' });

    // After agent_end, buffer is reset
    const endEvent = {
      type: 'tool_execution_end',
      toolName: 'read',
      isError: false,
    } as AgentEvent;
    const action = mapAgentEventToAction(endEvent);
    expect(action).toEqual({ type: 'markdown', value: '' });
  });

  // Existing tests that should still pass

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
    expect(action.type).toBe('done');
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

  it('calls stream.markdown for markdown action with string value', () => {
    const stream = { progress: () => {}, markdown: () => {} };
    let called = '';
    stream.markdown = (v: string) => { called = v; };
    applyStreamAction(stream as any, { type: 'markdown', value: 'Test' });
    expect(called).toBe('Test');
  });

  it('calls stream.markdown with MarkdownString value and forwards it', () => {
    const stream = { progress: () => {}, markdown: () => {} };
    let called: any = null;
    stream.markdown = (v: any) => { called = v; };

    // Construct a duck-typed MarkdownString-like object.
    // The mock in vi.mock('vscode') replaces the real MarkdownString
    // with MockMarkdownString; we build a plain object with the same shape.
    const md = { value: '<details>test</details>', supportHtml: true, isTrusted: true };
    applyStreamAction(stream as any, { type: 'markdown', value: md as any });
    expect(called).toBe(md);
    expect(called.value).toContain('<details>');
    expect(called.supportHtml).toBe(true);
  });

  it('does not call stream.markdown for empty markdown action', () => {
    const stream = { progress: () => {}, markdown: () => {} };
    let called = false;
    stream.markdown = () => { called = true; };
    applyStreamAction(stream as any, { type: 'markdown', value: '' });
    expect(called).toBe(false);
  });
});
