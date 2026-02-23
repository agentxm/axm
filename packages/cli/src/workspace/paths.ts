/**
 * Path utilities for axm directory resolution.
 *
 * Provides functions to determine the location of axm configuration directories
 * for both user and project configuration scopes.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as os from "node:os";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Returns the user-scope axm directory path (~/.axm).
 *
 * The user-scope directory stores user-level configuration and installed skills.
 *
 * @returns Effect yielding absolute path to the user-scope axm directory
 *
 * @experimental This API is unstable and may change without notice.
 *
 * @example
 * ```typescript
 * import { getGlobalDir } from "./workspace/paths";
 *
 * const userScopeDir = yield* getGlobalDir();
 * // => "/Users/username/.axm" (macOS/Linux)
 * // => "C:\\Users\\username\\.axm" (Windows)
 * ```
 */
export const getGlobalDir = (): Effect.Effect<string, never, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* Effect.sync(() => os.homedir());
    return path.join(home, ".axm");
  });

/**
 * Returns the project-level axm directory path (./.axm).
 *
 * The project directory stores project-specific configuration and skills.
 *
 * @returns Effect yielding absolute path to the project axm directory (relative to cwd)
 *
 * @experimental This API is unstable and may change without notice.
 *
 * @example
 * ```typescript
 * import { getProjectDir } from "./workspace/paths";
 *
 * const projectDir = yield* getProjectDir();
 * // => "/path/to/project/.axm"
 * ```
 */
export const getProjectDir = (): Effect.Effect<string, never, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return path.join(process.cwd(), ".axm");
  });

/**
 * Returns the axm directory path based on configuration scope.
 *
 * - When `global` is true, returns the user-scope directory (~/.axm)
 * - When `global` is false, returns the project directory (./.axm)
 *
 * @param global - Whether to use user scope (true) or project scope (false)
 * @returns Effect yielding absolute path to the appropriate axm directory
 *
 * @experimental This API is unstable and may change without notice.
 *
 * @example
 * ```typescript
 * import { getAxmDir } from "./workspace/paths";
 *
 * // Project-level directory
 * const projectDir = yield* getAxmDir(false);
 * // => "/path/to/project/.axm"
 *
 * // User-scope directory
 * const userScopeDir = yield* getAxmDir(true);
 * // => "/Users/username/.axm"
 * ```
 */
export const getAxmDir = (global: boolean): Effect.Effect<string, never, Path.Path> =>
  global ? getGlobalDir() : getProjectDir();
