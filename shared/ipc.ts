import { join } from 'node:path';

export const IPC_BASE = '.pi';
export const IPC_REVIEW_REQUESTS = '.pi/review-requests';
export const IPC_REVIEW_RESULTS = '.pi/review-results';
export const IPC_TMP = '.pi/tmp';
export const IPC_HEARTBEAT = '.pi/.vscode-ready';

export function ipcPath(workspaceRoot: string, subpath: string): string {
  return join(workspaceRoot, subpath);
}
