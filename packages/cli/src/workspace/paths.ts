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
import type { WorkspaceScope } from "./scope.js";

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
 * import { getUserScopeDir } from "./workspace/paths";
 *
 * const userScopeDir = yield* getUserScopeDir();
 * // => "/Users/username/.axm" (macOS/Linux)
 * // => "C:\\Users\\username\\.axm" (Windows)
 * ```
 */
export const getUserScopeDir = (): Effect.Effect<string, never, Path.Path> =>
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
    const cwd = yield* Effect.sync(() => process.cwd());
    return path.join(cwd, ".axm");
  });

/**
 * Returns the axm directory path based on configuration scope.
 *
 * - When `scope` is `"user"`, returns the user-scope directory (~/.axm)
 * - When `scope` is `"project"`, returns the project directory (./.axm)
 *
 * @param scope - Workspace scope (`"project"` or `"user"`)
 * @returns Effect yielding absolute path to the appropriate axm directory
 *
 * @experimental This API is unstable and may change without notice.
 *
 * @example
 * ```typescript
 * import { getAxmDir } from "./workspace/paths";
 *
 * // Project-level directory
 * const projectDir = yield* getAxmDir("project");
 * // => "/path/to/project/.axm"
 *
 * // User-scope directory
 * const userScopeDir = yield* getAxmDir("user");
 * // => "/Users/username/.axm"
 * ```
 */
export const getAxmDir = (scope: WorkspaceScope): Effect.Effect<string, never, Path.Path> =>
  scope === "user" ? getUserScopeDir() : getProjectDir();
