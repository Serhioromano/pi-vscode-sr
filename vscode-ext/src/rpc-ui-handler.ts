import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Local interfaces matching Pi SDK types (avoid subpath import complications)
// ---------------------------------------------------------------------------

interface RpcExtensionUIRequestBase {
  type: "extension_ui_request";
  id: string;
}

type RpcExtensionUIRequest =
  | (RpcExtensionUIRequestBase & {
      method: "select";
      title: string;
      options: string[];
      timeout?: number;
    })
  | (RpcExtensionUIRequestBase & {
      method: "confirm";
      title: string;
      message: string;
      timeout?: number;
    })
  | (RpcExtensionUIRequestBase & {
      method: "input";
      title: string;
      placeholder?: string;
      timeout?: number;
    })
  | (RpcExtensionUIRequestBase & {
      method: "editor";
      title: string;
      prefill?: string;
    })
  | (RpcExtensionUIRequestBase & {
      method: "notify";
      message: string;
      notifyType?: "info" | "warning" | "error";
    })
  | (RpcExtensionUIRequestBase & {
      method: "setStatus";
      statusKey: string;
      statusText: string | undefined;
    })
  | (RpcExtensionUIRequestBase & {
      method: "setWidget";
      widgetKey: string;
      widgetLines: string[] | undefined;
      widgetPlacement?: "aboveEditor" | "belowEditor";
    })
  | (RpcExtensionUIRequestBase & { method: "setTitle"; title: string })
  | (RpcExtensionUIRequestBase & { method: "set_editor_text"; text: string });

interface RpcExtensionUIResponse {
  type: "extension_ui_response";
  id: string;
  value?: string;
  confirmed?: boolean;
  cancelled?: true;
}

/** Function type for handling RpcExtensionUIRequest events. */
export type RpcUiHandler = (request: RpcExtensionUIRequest) => void | Promise<void>;

/**
 * Factory that creates an RPC UI handler for Pi extension_ui_request events.
 *
 * Maps each RPC method to the appropriate VS Code native dialog API:
 *   select  → showQuickPick
 *   confirm → showInformationMessage (modal)
 *   input   → showInputBox
 *   editor  → showInputBox (single-line fallback, Phase 2 limitation)
 *   notify  → showInformationMessage / showWarningMessage / showErrorMessage
 *
 * Methods setStatus, setWidget, setTitle, set_editor_text are no-ops in Phase 2.
 */
export function createRpcUiHandler(
  sendResponse: (response: RpcExtensionUIResponse) => void
): RpcUiHandler {
  return async (request: RpcExtensionUIRequest) => {
    const { id } = request;

    switch (request.method) {
      case "select": {
        const result = await vscode.window.showQuickPick(request.options, {
          title: request.title,
          placeHolder: "Select an option",
          ignoreFocusOut: true,
        });
        if (result === undefined) {
          sendResponse({ type: "extension_ui_response", id, cancelled: true });
        } else {
          sendResponse({ type: "extension_ui_response", id, value: result });
        }
        break;
      }

      case "confirm": {
        const result = await vscode.window.showInformationMessage(
          request.title + ': ' + request.message,
          { modal: true },
          'Yes',
          'No'
        );
        if (result === undefined) {
          sendResponse({ type: "extension_ui_response", id, cancelled: true });
        } else {
          sendResponse({
            type: "extension_ui_response",
            id,
            confirmed: result === 'Yes',
          });
        }
        break;
      }

      case "input": {
        const result = await vscode.window.showInputBox({
          title: request.title,
          placeHolder: request.placeholder,
          ignoreFocusOut: true,
        });
        if (result === undefined) {
          sendResponse({ type: "extension_ui_response", id, cancelled: true });
        } else {
          sendResponse({ type: "extension_ui_response", id, value: result });
        }
        break;
      }

      case "editor": {
        // Single-line fallback per UI-SPEC; Phase 3 may upgrade to multi-line
        const result = await vscode.window.showInputBox({
          title: request.title,
          value: request.prefill,
          ignoreFocusOut: true,
        });
        if (result === undefined) {
          sendResponse({ type: "extension_ui_response", id, cancelled: true });
        } else {
          sendResponse({ type: "extension_ui_response", id, value: result });
        }
        break;
      }

      case "notify": {
        // Fire-and-forget — no sendResponse call
        switch (request.notifyType) {
          case "warning":
            vscode.window.showWarningMessage(request.message);
            break;
          case "error":
            vscode.window.showErrorMessage(request.message);
            break;
          default:
            vscode.window.showInformationMessage(request.message);
            break;
        }
        break;
      }

      case "setStatus":
      case "setWidget":
      case "setTitle":
      case "set_editor_text":
        // Not implemented in Phase 2
        console.warn('RPC UI method not implemented in Phase 2: ' + request.method);
        break;

      default:
        console.warn('Unknown extension UI request method: ' + (request as any).method);
        break;
    }
  };
}
