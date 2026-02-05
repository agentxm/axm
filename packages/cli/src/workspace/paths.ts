/**
 * Path utilities for axm directory resolution.
 *
 * Provides functions to determine the location of axm configuration directories
 * for both global (user-level) and project-level scopes.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as os from "node:os";
import * as path from "node:path";

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Returns the global axm directory path (~/.axm).
 *
 * The global directory stores user-level configuration and globally installed skills.
 *
 * @returns Absolute path to the global axm directory
 *
 * @experimental This API is unstable and may change without notice.
 *
 * @example
 * ```typescript
 * import { getGlobalDir } from "./workspace/paths";
 *
 * const globalDir = getGlobalDir();
 * // => "/Users/username/.axm" (macOS/Linux)
 * // => "C:\\Users\\username\\.axm" (Windows)
 * ```
 */
export const getGlobalDir = (): string => {
  return path.join(os.homedir(), ".axm");
};

/**
 * Returns the project-level axm directory path (./.axm).
 *
 * The project directory stores project-specific configuration and skills.
 *
 * @returns Absolute path to the project axm directory (relative to cwd)
 *
 * @experimental This API is unstable and may change without notice.
 *
 * @example
 * ```typescript
 * import { getProjectDir } from "./workspace/paths";
 *
 * const projectDir = getProjectDir();
 * // => "/path/to/project/.axm"
 * ```
 */
export const getProjectDir = (): string => {
  return path.join(process.cwd(), ".axm");
};

/**
 * Returns the axm directory path based on scope.
 *
 * - When `global` is true, returns the global directory (~/.axm)
 * - When `global` is false, returns the project directory (./.axm)
 *
 * @param global - Whether to use global scope (true) or project scope (false)
 * @returns Absolute path to the appropriate axm directory
 *
 * @experimental This API is unstable and may change without notice.
 *
 * @example
 * ```typescript
 * import { getAxmDir } from "./workspace/paths";
 *
 * // Project-level directory
 * const projectDir = getAxmDir(false);
 * // => "/path/to/project/.axm"
 *
 * // Global directory
 * const globalDir = getAxmDir(true);
 * // => "/Users/username/.axm"
 * ```
 */
export const getAxmDir = (global: boolean): string => {
  return global ? getGlobalDir() : getProjectDir();
};
