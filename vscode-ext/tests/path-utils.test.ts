import { describe, it, expect } from 'vitest';
import { resolveSafe } from '../shared/path-utils';

describe('resolveSafe', () => {
  it('returns absolute path unchanged when filePath starts with /', () => {
    expect(resolveSafe('/home/user/project', '/absolute/path.ts')).toBe('/absolute/path.ts');
  });

  it('joins relative path with cwd', () => {
    expect(resolveSafe('/home/user/project', 'relative/path.ts')).toBe('/home/user/project/relative/path.ts');
  });

  it('handles LLM-mangled path (cwd without leading / prepended)', () => {
    expect(resolveSafe('/home/user/project', 'home/user/project/src/file.ts')).toBe('/home/user/project/src/file.ts');
  });

  it('handles LLM-mangled path with trailing slash on cwd', () => {
    expect(resolveSafe('/home/user/project/', 'home/user/project/src/file.ts')).toBe('/home/user/project/src/file.ts');
  });

  it('handles empty filePath returns cwd', () => {
    expect(resolveSafe('/home/user/project', '')).toBe('/home/user/project');
  });

  it('handles filePath matching cwd exactly without leading slash', () => {
    expect(resolveSafe('/home/user/project', 'home/user/project')).toBe('/home/user/project');
  });
});
