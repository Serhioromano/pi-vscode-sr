import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { IPC_BASE, IPC_REVIEW_REQUESTS, IPC_REVIEW_RESULTS, IPC_TMP, IPC_HEARTBEAT, ipcPath } from '../shared/ipc';

describe('IPC path constants', () => {
  it('IPC_BASE is ".pi"', () => {
    expect(IPC_BASE).toBe('.pi');
  });

  it('IPC_REVIEW_REQUESTS is ".pi/review-requests"', () => {
    expect(IPC_REVIEW_REQUESTS).toBe('.pi/review-requests');
  });

  it('IPC_REVIEW_RESULTS is ".pi/review-results"', () => {
    expect(IPC_REVIEW_RESULTS).toBe('.pi/review-results');
  });

  it('IPC_TMP is ".pi/tmp"', () => {
    expect(IPC_TMP).toBe('.pi/tmp');
  });

  it('IPC_HEARTBEAT is ".pi/.vscode-ready"', () => {
    expect(IPC_HEARTBEAT).toBe('.pi/.vscode-ready');
  });

  it('ipcPath joins workspaceRoot with subpath correctly', () => {
    expect(ipcPath('/home/user/project', IPC_REVIEW_REQUESTS)).toBe(
      path.join('/home/user/project', '.pi', 'review-requests')
    );
  });
});
