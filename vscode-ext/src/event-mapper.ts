import type { ChatResponseStream } from 'vscode';
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
  | { type: 'markdown'; value: string }
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
 * Format tool arguments for display.  Extracts the most informative field
 * depending on the tool type (e.g. the command for bash, the path for read).
 */
function formatToolInput(toolName: string, argsJson: string): string {
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>;
    switch (toolName) {
      case 'bash': {
        const cmd = typeof args.command === 'string' ? args.command : '';
        const cwd = typeof args.workdir === 'string' ? args.workdir
                 : typeof args.cwd === 'string' ? args.cwd : '';
        return cmd + (cwd ? '\n(in ' + cwd + ')' : '');
      }
      case 'read':
        return typeof args.path === 'string' ? args.path : argsJson;
      case 'write':
        return typeof args.path === 'string' ? args.path : argsJson;
      case 'edit': {
        const ep = typeof args.path === 'string' ? args.path : '';
        const edits = Array.isArray(args.edits) ? args.edits.length + ' edit(s)' : '';
        return ep + (edits ? ' — ' + edits : '');
      }
      default:
        // Generic: show the raw args, but keep it compact
        return argsJson.length > 200 ? argsJson.slice(0, 200) + '…' : argsJson;
    }
  } catch {
    return argsJson;
  }
}

/**
 * Build a markdown string for one complete tool execution.
 * Called only from the tool_execution_end handler.
 *
 * VS Code Chat API's stream.markdown() ignores MarkdownString.supportHtml and
 * MarkdownString.isTrusted — the Chat panel strips ALL HTML for LLM-response
 * security.  Therefore tool output MUST be pure markdown, never HTML.
 */
function buildToolSection(buf: {
  toolName: string;
  args: string;
  partialResults: string[];
  isError: boolean;
}): string {
  const status = buf.isError ? ':x: Failed' : ':white_check_mark: Completed';
  const input = formatToolInput(buf.toolName, buf.args);
  const resultContent = buf.partialResults.join('\n') || '(no output)';

  let md = '> **' + buf.toolName + '** ' + status + '\n';
  md += '> ```\n> ' + input.replace(/\n/g, '\n> ') + '\n> ```\n';

  if (resultContent !== '(no output)') {
    md += '>\n> ```\n> ' + resultContent.replace(/\n/g, '\n> ') + '\n> ```';
  }

  return md;
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
