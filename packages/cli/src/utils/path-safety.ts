import * as path from "node:path";

/**
 * Validates that a resolved target path stays within a base directory.
 * Uses path separator boundary check to prevent prefix false positives.
 */
export function isPathSafe(base: string, target: string): boolean {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep);
}
