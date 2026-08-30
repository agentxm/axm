/** AXM application-home and workspace path resolution. */

import * as os from "node:os";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { ACQUIRED_EXTENSIONS_DIR } from "../extensions/constants.js";
import { makeAbsolutePath, type AbsolutePath } from "../utils/path-types.js";
import { AXM_DIR_NAME, LOCK_FILENAME, USER_WORKSPACE_DIRECTORY } from "./constants.js";
import { SETTINGS_FILENAME } from "@agentxm/extension-model/unstable/workspace-files";
import type { WorkspaceScope } from "./scope.js";

export { AXM_DIR_NAME, USER_WORKSPACE_DIRECTORY } from "./constants.js";

export interface WorkspaceLocation {
  readonly scope: WorkspaceScope;
  readonly path: AbsolutePath;
  readonly baseDir: AbsolutePath;
  readonly workspaceRoot: AbsolutePath;
  readonly settingsPath: AbsolutePath;
  readonly lockPath: AbsolutePath;
  readonly acquiredRoot: AbsolutePath;
}

const axmUserHomeConfig = Config.option(Config.string("AXM_USER_HOME"));

export const resolveUserHomePure = (configuredHome: string | undefined): string =>
  configuredHome ?? os.homedir();

export const resolveUserAxmHomePure = (
  pathJoin: (...segments: ReadonlyArray<string>) => string,
  homeDir: string,
): string => pathJoin(homeDir, AXM_DIR_NAME);

export const resolveUserWorkspaceRootPure = (
  pathJoin: (...segments: ReadonlyArray<string>) => string,
  homeDir: string,
): string => pathJoin(resolveUserAxmHomePure(pathJoin, homeDir), USER_WORKSPACE_DIRECTORY);

export const resolveUserHome = (): Effect.Effect<AbsolutePath, never, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    // eslint-disable-next-line no-restricted-syntax -- Optional string decoding is total, so failure means the Config provider violated its contract.
    const configuredHome = yield* Effect.orDie(axmUserHomeConfig);
    return makeAbsolutePath(path, resolveUserHomePure(Option.getOrUndefined(configuredHome)));
  });

export const resolveUserAxmHome = (): Effect.Effect<AbsolutePath, never, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* resolveUserHome();
    return makeAbsolutePath(path, resolveUserAxmHomePure(path.join, home));
  });

export const resolveUserWorkspaceRoot = (): Effect.Effect<AbsolutePath, never, Path.Path> =>
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
): Effect.Effect<WorkspaceLocation, never, Path.Path> =>
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
