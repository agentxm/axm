import type { NativeDirectoryInputs } from "../../locations/index.js";
import type { NativeObservationView } from "../../locations/index.js";
/**
 * Settings and lockfile cells: the scoped read model's two authoritative
 * documents, read for either runtime directory the workspace knows about.
 * Narrow document reads use the shared loaders directly; broader records use
 * the scoped read model. Both observe fresh state and retain filesystem and
 * path dependencies until composition.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { makeAbsolutePath, type AbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { LOCKFILE_VERSION } from "../desired/lockfile/index.js";
import type { Lockfile } from "../desired/lockfile/schema.js";
import { createDefaultSettings, type Settings } from "../desired/settings/index.js";
import { AgentRootResolverLive } from "../observed/agent-root-resolver.js";
import type {
  LockfileReadError,
  SettingsReadError,
  WorkspaceRootEscape,
} from "../observed/errors.js";
import {
  makeWorkspaceReadModel,
  validateWorkspaceReadRoot,
  WorkspaceReadModelConfig,
  type WorkspaceReadModel,
} from "../observed/service.js";
import { makeScopedStateApi } from "../observed/state.js";
import { resolveProjectWorkspaceStatePaths, resolveUserWorkspaceLayout } from "./layout.js";
import type {
  WorkspaceLockfileReadFailure,
  WorkspaceSettingsReadFailure,
  WorkspaceStateReadFailure,
} from "./contracts.js";

/** The runtime directories a workspace's settings sources can live in. */
export interface StateCellPaths {
  readonly initialSettings?: Settings;
  readonly observationView?: NativeObservationView;
  readonly scope: WorkspaceScope;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly projectRoot: AbsolutePath;
  readonly userHome: AbsolutePath;
  readonly projectRuntimeDir: string;
  readonly userRuntimeDir: string;
}

const createEmptyLockfile = (): Lockfile => ({
  lockfileVersion: LOCKFILE_VERSION,
  skills: {},
});

const scopeForDir = (
  cells: StateCellPaths,
  dir: string,
  sharedScope: WorkspaceScope = cells.scope,
): WorkspaceScope =>
  dir === cells.userRuntimeDir && dir === cells.projectRuntimeDir
    ? sharedScope
    : dir === cells.userRuntimeDir
      ? "user"
      : "project";

export const readModelFor = (
  cells: StateCellPaths,
  scope: WorkspaceScope,
): Effect.Effect<WorkspaceReadModel, WorkspaceRootEscape, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return yield* makeWorkspaceReadModel(scope).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(WorkspaceReadModelConfig, {
            nativeDirectoryInputs: cells.nativeDirectoryInputs,
            projectRoot: cells.projectRoot,
            userHome: cells.userHome,
            allowedRoot: makeAbsolutePath(path, "/"),
          }),
          AgentRootResolverLive,
        ),
      ),
    );
  });

/** Fresh authoritative document cells; no agent or authored-directory inventory is needed. */
const stateLoadersFor = (cells: StateCellPaths, scope: WorkspaceScope) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const allowedRoot = makeAbsolutePath(path, "/");
    yield* validateWorkspaceReadRoot(path, cells.projectRoot, allowedRoot);
    const userHome = yield* validateWorkspaceReadRoot(path, cells.userHome, allowedRoot);
    const paths =
      scope === "project"
        ? resolveProjectWorkspaceStatePaths(path, cells.projectRoot)
        : yield* resolveUserWorkspaceLayout(makeAbsolutePath(path, userHome));
    return yield* makeScopedStateApi(scope, {
      fs,
      path,
      settingsPath: paths.settingsPath,
      lockfilePath: paths.lockPath,
    });
  });

/** The settings document of one runtime directory, when present. */
export const readSettingsCell = (
  cells: StateCellPaths,
  dir: string,
  sharedScope?: WorkspaceScope,
): Effect.Effect<
  Option.Option<Settings>,
  WorkspaceSettingsReadFailure,
  FileSystem.FileSystem | Path.Path
> =>
  cells.observationView?.kind === "git-index" && scopeForDir(cells, dir, sharedScope) === "user"
    ? Effect.succeedNone
    : stateLoadersFor(cells, scopeForDir(cells, dir, sharedScope)).pipe(
        Effect.flatMap((loaders) => loaders.settings),
        Effect.map((settings) =>
          Option.isNone(settings) &&
          scopeForDir(cells, dir, sharedScope) === cells.scope &&
          cells.initialSettings !== undefined
            ? Option.some(cells.initialSettings)
            : settings,
        ),
      );

/** The settings document of one runtime directory, defaulting when absent. */
export const readSettingsOrDefault = (
  cells: StateCellPaths,
  dir: string,
  sharedScope?: WorkspaceScope,
): Effect.Effect<Settings, WorkspaceSettingsReadFailure, FileSystem.FileSystem | Path.Path> =>
  readSettingsCell(cells, dir, sharedScope).pipe(
    Effect.map(Option.getOrElse(() => createDefaultSettings())),
  );

/** The lockfile of one runtime directory, empty when absent. */
export const readLockfileCell = (
  cells: StateCellPaths,
  dir: string,
  sharedScope?: WorkspaceScope,
): Effect.Effect<Lockfile, WorkspaceLockfileReadFailure, FileSystem.FileSystem | Path.Path> =>
  cells.observationView?.kind === "git-index" && scopeForDir(cells, dir, sharedScope) === "user"
    ? Effect.sync(createEmptyLockfile)
    : stateLoadersFor(cells, scopeForDir(cells, dir, sharedScope)).pipe(
        Effect.flatMap((loaders) => loaders.lockfile),
        Effect.map(Option.getOrElse(createEmptyLockfile)),
      );

/** Run one read against the selected scope's read model. */
export const readScopedModel = <A>(
  cells: StateCellPaths,
  runtimeDir: string,
  f: (scoped: WorkspaceReadModel) => Effect.Effect<A, SettingsReadError | LockfileReadError>,
): Effect.Effect<A, WorkspaceStateReadFailure, FileSystem.FileSystem | Path.Path> =>
  readModelFor(cells, scopeForDir(cells, runtimeDir)).pipe(Effect.flatMap(f));
