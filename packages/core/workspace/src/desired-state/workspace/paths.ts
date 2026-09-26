/** AXM application-home and workspace path resolution. */

import type * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import { ACQUIRED_EXTENSIONS_DIR, LOCK_FILENAME, USER_WORKSPACE_DIRECTORY } from "./constants.js";
import {
  AXM_DIR_NAME,
  resolveUserAxmHome as resolveHostUserAxmHome,
  resolveUserAxmHomePure,
  resolveUserHome as resolveHostUserHome,
} from "@agentxm/host-primitives";
import { makeAbsolutePath, type AbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import { SETTINGS_FILENAME } from "@agentxm/extension-model/unstable/workspace-files";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

export { USER_WORKSPACE_DIRECTORY } from "./constants.js";

export interface LocatedWorkspace {
  readonly scope: WorkspaceScope;
  readonly path: AbsolutePath;
  readonly baseDir: AbsolutePath;
  readonly workspaceRoot: AbsolutePath;
  readonly settingsPath: AbsolutePath;
  readonly lockPath: AbsolutePath;
  readonly acquiredRoot: AbsolutePath;
}

export const resolveUserWorkspaceRootPure = (
  pathJoin: (...segments: ReadonlyArray<string>) => string,
  homeDir: string,
): string => pathJoin(resolveUserAxmHomePure(pathJoin, homeDir), USER_WORKSPACE_DIRECTORY);

export const resolveUserHome = (): Effect.Effect<AbsolutePath, Config.ConfigError, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* resolveHostUserHome();
    return makeAbsolutePath(path, home);
  });

export const resolveUserAxmHome = (): Effect.Effect<AbsolutePath, Config.ConfigError, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* resolveHostUserAxmHome();
    return makeAbsolutePath(path, home);
  });

export const resolveUserWorkspaceRoot = (): Effect.Effect<
  AbsolutePath,
  Config.ConfigError,
  Path.Path
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* resolveUserHome();
    return makeAbsolutePath(path, resolveUserWorkspaceRootPure(path.join, home));
  });

export const getProjectRuntimeDir = (
  projectRoot: AbsolutePath,
): Effect.Effect<AbsolutePath, never, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return makeAbsolutePath(path, path.join(projectRoot, AXM_DIR_NAME));
  });

export const locateWorkspace = (
  scope: WorkspaceScope,
  projectRoot: AbsolutePath,
): Effect.Effect<LocatedWorkspace, Config.ConfigError, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const baseDir = scope === "user" ? yield* resolveUserHome() : projectRoot;
    const workspaceRoot =
      scope === "user"
        ? makeAbsolutePath(path, resolveUserWorkspaceRootPure(path.join, baseDir))
        : projectRoot;
    const runtimeDir = makeAbsolutePath(path, path.join(workspaceRoot, AXM_DIR_NAME));
    return {
      scope,
      path: runtimeDir,
      baseDir,
      workspaceRoot,
      settingsPath: makeAbsolutePath(path, path.join(workspaceRoot, SETTINGS_FILENAME)),
      lockPath: makeAbsolutePath(path, path.join(workspaceRoot, LOCK_FILENAME)),
      acquiredRoot: makeAbsolutePath(path, path.join(workspaceRoot, ACQUIRED_EXTENSIONS_DIR)),
    };
  });
