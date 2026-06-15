import { MarkdownString, type ChatResponseStream } from 'vscode';
import type { AgentEvent } from '@earendil-works/pi-agent-core';

/**
 * User-configurable tool execution visibility in streaming responses.
 * 'verbose' — show tool execution as collapsible <details>/<summary> sections.
 * 'quiet'   — suppress all tool execution output (only shows progress).
 */
export type ToolVisibility = 'verbose' | 'quiet';

/**
 * Action to perform on a ChatResponseStream for a given AgentEvent.
 * Pure data structure -- no side effects.
 */
export type StreamAction =
  | { type: 'progress'; value: string }
  | { type: 'markdown'; value: string | MarkdownString }
  | { type: 'done' }
  | { type: 'error'; value: string };

/**
 * Buffer for one tool execution's events between tool_execution_start
 * and tool_execution_end.  Accumulates partial results so the complete
 * collapsible section can be emitted as a single block (Pitfall 3).
 */
let toolBuffer: {
  toolName: string;
  args: string;
  partialResults: string[];
  isError: boolean;
} | null = null;

/**
 * Escape HTML special characters so tool names and results are safe
 * inside the <details>/<summary> block.
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Build a MarkdownString containing a collapsible <details>/<summary> HTML
 * section for one complete tool execution.  Called only from the
 * tool_execution_end handler.
 *
 * Uses VS Code's MarkdownString with supportHtml = true so DOMPurify
 * allows the <details> and <summary> tags through.
 */
function buildToolSection(buf: {
  toolName: string;
  args: string;
  partialResults: string[];
  isError: boolean;
}): MarkdownString {
  const status = buf.isError ? '$(error) Failed' : '$(check) Completed';
  const resultContent = buf.partialResults.join('\n') || '(no output)';
  const html = '<details>\n<summary><strong>Tool: '
    + escapeHtml(buf.toolName)
    + '</strong> -- '
    + status
    + '</summary>\n\n```\n'
    + escapeHtml(resultContent)
    + '\n```\n\n</details>';
  const ms = new MarkdownString(html);
  ms.supportHtml = true; // Allows <details>/<summary> through DOMPurify (D-03)
  ms.isTrusted = true;   // Permits command: links if needed later
  return ms;
}

/**
 * Map a single AgentEvent to a StreamAction.
 * Pure function: (event, toolVisibility?) => action. No side effects, no external state.
 *
 * @param toolVisibility - Controls tool execution rendering ('verbose' | 'quiet').
 *                         Defaults to 'verbose' for backward compatibility.
 */
export function mapAgentEventToAction(
  event: AgentEvent,
  toolVisibility: ToolVisibility = 'verbose'
): StreamAction {
  switch (event.type) {
    case 'agent_start':
      return { type: 'progress', value: 'Pi is working...' };

    case 'turn_start':
      return { type: 'markdown', value: '---' };

    case 'message_update': {
      const msg = event.assistantMessageEvent;
      if (msg.type === 'text_delta') {
        return { type: 'markdown', value: msg.delta };
      }
      return { type: 'markdown', value: '' };
    }

    case 'tool_execution_start':
      if (toolVisibility === 'quiet') {
        // Quiet mode: suppress all tool output (D-01)
        return { type: 'markdown', value: '' };
      }
      // Verbose mode: initialise buffer, show progress immediately (D-02)
      toolBuffer = {
        toolName: event.toolName,
        args: JSON.stringify(event.args ?? {}),
        partialResults: [],
        isError: false,
      };
      return { type: 'progress', value: 'Tool: ' + event.toolName };

    case 'tool_execution_update':
      if (toolVisibility === 'verbose' && toolBuffer && typeof event.partialResult === 'string') {
        toolBuffer.partialResults.push(event.partialResult);
      }
      // No per-update output — everything is buffered for tool_execution_end
      return { type: 'markdown', value: '' };

    case 'tool_execution_end':
      if (toolVisibility === 'verbose' && toolBuffer) {
        toolBuffer.isError = event.isError;
        const section = buildToolSection(toolBuffer);
        toolBuffer = null;
        return { type: 'markdown', value: section };
      }
      // Quiet mode or orphaned buffer: suppress output
      toolBuffer = null;
      return { type: 'markdown', value: '' };

    case 'message_end':
      // Prevent orphaned tool buffers across messages
      toolBuffer = null;
      return { type: 'markdown', value: '' };

    case 'agent_end':
      // Prevent orphaned tool buffers across turns
      toolBuffer = null;
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
 * Batch mode (non-streaming). Uses default verbose tool visibility.
 * Callers that need quiet mode should use mapAgentEventToAction +
 * applyStreamAction individually.
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
