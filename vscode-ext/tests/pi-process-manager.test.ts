import { describe, it, expect } from 'vitest';
import { createPiProcessManager } from '../src/pi-process-manager';

describe('createPiProcessManager', () => {
  it('returns an object with expected methods', () => {
    const mgr = createPiProcessManager({ cwd: '/tmp' });
    expect(mgr).toBeDefined();
    expect(typeof mgr.start).toBe('function');
    expect(typeof mgr.stop).toBe('function');
    expect(typeof mgr.restart).toBe('function');
    expect(typeof mgr.prompt).toBe('function');
    expect(typeof mgr.promptAndWait).toBe('function');
    expect(typeof mgr.abort).toBe('function');
    expect(typeof mgr.onEvent).toBe('function');
    expect(typeof mgr.getState).toBe('function');
  });

  it('factory returns synchronously without creating RpcClient', () => {
    // The factory must not throw during construction (lazy allocation per D-05)
    expect(() => {
      createPiProcessManager({ cwd: '/tmp', model: 'deepseek-v4-flash' });
    }).not.toThrow();
  });
});
