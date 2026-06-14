import * as fs from 'fs/promises';
import * as path from 'path';
import { IPC_HEARTBEAT, IPC_REVIEW_REQUESTS, IPC_REVIEW_RESULTS } from '../shared/ipc';

/**
 * Start a heartbeat timer that writes a timestamp to .pi/.vscode-ready
 * every 15 seconds, signaling to Pi that VS Code is open.
 * Fire-and-forget — failures are silently ignored (best-effort signal).
 */
export function startHeartbeat(workspaceRoot: string): { dispose: () => void } {
  const readyFile = path.join(workspaceRoot, IPC_HEARTBEAT);
  // Fire-and-forget initial write
  fs.writeFile(readyFile, Date.now().toString(), 'utf-8').catch(() => {});
  const timer = setInterval(() => {
    fs.writeFile(readyFile, Date.now().toString(), 'utf-8').catch(() => {});
  }, 15_000);
  return { dispose: () => clearInterval(timer) };
}

/**
 * Ensure the .pi/review-requests and .pi/review-results directories exist.
 */
export async function ensurePiDirs(workspaceRoot: string): Promise<void> {
  await fs.mkdir(path.join(workspaceRoot, IPC_REVIEW_REQUESTS), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, IPC_REVIEW_RESULTS), { recursive: true });
}

/**
 * Check if the Pi CLI is installed by running `pi --version`.
 */
export async function checkPiInstalled(): Promise<boolean> {
  const { execSync } = await import('child_process');
  try {
    execSync('pi --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
