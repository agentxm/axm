/**
 * Shared recursive discovery walk policy for extension scanners.
 *
 * @experimental This API is unstable and may change without notice.
 */

export const DISCOVERY_SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".axm",
  "dist",
  "build",
  "__pycache__",
]);

export const DISCOVERY_MAX_DEPTH = 5;
