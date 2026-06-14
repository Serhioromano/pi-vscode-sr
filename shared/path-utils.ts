import { resolve } from 'node:path';

/**
 * Normalize a file path from review request, handling LLM paths without leading /.
 * Also guards against path traversal outside the workspace directory.
 */
export function resolveSafe(cwd: string, filePath: string): string {
  // Absolute path: return as-is
  if (filePath.startsWith('/')) {
    return filePath;
  }
  // Strip leading/trailing slashes from cwd for comparison
  const cwdClean = cwd.replace(/\/+$/, '').replace(/^\//, '');
  // If filePath equals cwdClean exactly, return cwd directly
  if (filePath === cwdClean) {
    return cwd.replace(/\/+$/, '');
  }
  // If filePath starts with cwdClean/ (LLM forgot the leading /),
  // strip it so resolve doesn't double.
  if (filePath.startsWith(cwdClean + '/')) {
    filePath = filePath.substring(cwdClean.length + 1);
  }
  const result = resolve(cwd, filePath);
  // Guard against path traversal outside the workspace directory
  if (!result.startsWith(cwd.replace(/\/+$/, '') + '/') && result !== cwd.replace(/\/+$/, '')) {
    return resolve(cwd, ''); // Fall back to cwd if traversal detected
  }
  return result;
}
