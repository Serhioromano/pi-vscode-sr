import type { AgentEvent } from '@earendil-works/pi-agent-core';
import type { ChatResponseStream } from 'vscode';

/**
 * Action to perform on a ChatResponseStream for a given AgentEvent.
 * Pure data structure -- no side effects.
 */
export type StreamAction =
  | { type: 'progress'; value: string }
  | { type: 'markdown'; value: string }
  | { type: 'done' }
  | { type: 'error'; value: string };

/**
 * Map a single AgentEvent to a StreamAction.
 * Pure function: (event) => action. No side effects, no external state.
 */
export function mapAgentEventToAction(event: AgentEvent): StreamAction {
  switch (event.type) {
    case 'agent_start':
      return { type: 'progress', value: 'Pi is working...' };

    case 'turn_start':
      return { type: 'markdown', value: '---' };

    case 'message_update': {
      const msg = event.assistantMessageEvent;
      if (msg.type === 'delta' && msg.delta?.type === 'text') {
        return { type: 'markdown', value: msg.delta.text };
      }
      return { type: 'markdown', value: '' };
    }

    case 'tool_execution_start':
      return { type: 'markdown', value: '```\nerror executing ' + event.toolName + '...\n```\n' };

    case 'tool_execution_update':
      if (typeof event.partialResult === 'string') {
        return { type: 'markdown', value: event.partialResult };
      }
      return { type: 'markdown', value: '' };

    case 'tool_execution_end':
      if (event.isError) {
        return { type: 'markdown', value: 'Tool ' + event.toolName + ' failed' };
      }
      return { type: 'markdown', value: 'Tool ' + event.toolName + ' completed' };

    case 'message_end':
      return { type: 'markdown', value: '' };

    case 'agent_end':
      return { type: 'done' };

    case 'turn_end':
    case 'message_start':
      return { type: 'markdown', value: '' };

    default:
      return { type: 'markdown', value: '' };
  }
}

/**
 * Apply a StreamAction to a ChatResponseStream (side-effectful).
 * Separated from mapAgentEventToAction so mapping logic stays pure.
 */
export function applyStreamAction(
  stream: ChatResponseStream,
  action: StreamAction
): void {
  switch (action.type) {
    case 'progress':
      stream.progress(action.value);
      break;
    case 'markdown':
      if (action.value) stream.markdown(action.value);
      break;
    case 'error':
      stream.markdown('- ' + action.value);
      break;
    case 'done':
      break; // No-op for stream; handler resolves when all events processed
  }
}

/**
 * Process an array of AgentEvents through a ChatResponseStream.
 * Batch mode for Phase 1 (non-streaming). Phase 2 will add progressive streaming.
 */
export function streamEvents(
  events: AgentEvent[],
  stream: ChatResponseStream
): void {
  for (const event of events) {
    const action = mapAgentEventToAction(event);
    applyStreamAction(stream, action);
  }
}
