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
import * as Config from "effect/Config";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAbsolutePath, type AbsolutePath } from "../utils/path-types.js";
import type { WorkspaceScope } from "./scope.js";

export interface WorkspaceLocation {
  readonly scope: WorkspaceScope;
  readonly path: AbsolutePath;
  readonly baseDir: AbsolutePath;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Returns the user-scope axm directory path.
 *
 * The user-scope directory stores user-level configuration and installed skills.
 * When `AXM_USER_HOME` is set, it is treated as the home-directory override
 * and the returned path becomes `$AXM_USER_HOME/.axm`; otherwise the path
 * falls back to `$HOME/.axm`.
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
const axmUserHomeConfig = Config.option(Config.string("AXM_USER_HOME"));

export const getUserScopeDir = (): Effect.Effect<AbsolutePath, never, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const axmUserHome = yield* Effect.orDie(axmUserHomeConfig.asEffect());
    const home = Option.match(axmUserHome.pipe(Option.filter((value) => value.length > 0)), {
      onNone: () => os.homedir(),
      onSome: (value) => value,
    });
    return makeAbsolutePath(path, path.join(home, ".axm"));
  });

/**
 * Returns the project-level axm directory path (./.axm).
 *
 * The project directory stores project-specific configuration and skills.
 *
 * @param projectRoot - Explicit project root; defaults to process.cwd()
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
export const getProjectDir = (
  projectRoot?: string,
): Effect.Effect<AbsolutePath, never, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const baseDir = projectRoot ?? (yield* Effect.sync(() => process.cwd()));
    return makeAbsolutePath(path, path.join(baseDir, ".axm"));
  });

/**
 * Returns the axm directory path based on configuration scope.
 *
 * - When `scope` is `"user"`, returns the user-scope directory (~/.axm)
 * - When `scope` is `"project"`, returns the project directory (./.axm)
 *
 * @param scope - WorkspaceMutations scope (`"project"` or `"user"`)
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
export const getAxmDir = (
  scope: WorkspaceScope,
  projectRoot?: string,
): Effect.Effect<AbsolutePath, never, Path.Path> =>
  scope === "user" ? getUserScopeDir() : getProjectDir(projectRoot);

export const locateWorkspace = (
  scope: WorkspaceScope,
  projectRoot?: string,
): Effect.Effect<WorkspaceLocation, never, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const workspacePath = yield* getAxmDir(scope, projectRoot);

    return {
      scope,
      path: workspacePath,
      baseDir: makeAbsolutePath(path, path.dirname(workspacePath)),
    } satisfies WorkspaceLocation;
  });
