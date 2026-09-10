/**
 * Settings and lockfile cells: the scoped read model's two authoritative
 * documents, read for either runtime directory the workspace knows about.
 * Every narrow state service reads through these two functions, so the
 * read-model configuration and agent-root resolution are composed in exactly
 * one place and `FileSystem`/`Path` stay in `R`.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { makeAbsolutePath, type AbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { LOCKFILE_VERSION } from "../lockfile/index.js";
import type { Lockfile } from "../lockfile/schema.js";
import { createDefaultSettings, type Settings } from "../settings/index.js";
import { AgentRootResolverLive } from "./read-model/agent-root-resolver.js";
import type {
  LockfileReadError,
  SettingsReadError,
  WorkspaceRootEscape,
} from "./read-model/errors.js";
import {
  makeWorkspaceReadModel,
  WorkspaceReadModelConfig,
  type WorkspaceReadModel,
} from "./read-model/service.js";
import type {
  WorkspaceLockfileReadFailure,
  WorkspaceSettingsReadFailure,
  WorkspaceStateReadFailure,
} from "./service-interface.js";

/** The runtime directories a workspace's settings sources can live in. */
export interface StateCellPaths {
  readonly scope: WorkspaceScope;
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

const readModelFor = (
  cells: StateCellPaths,
  scope: WorkspaceScope,
): Effect.Effect<WorkspaceReadModel, WorkspaceRootEscape, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return yield* makeWorkspaceReadModel(scope).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(WorkspaceReadModelConfig, {
            projectRoot: cells.projectRoot,
            userHome: cells.userHome,
            allowedRoot: makeAbsolutePath(path, "/"),
          }),
          AgentRootResolverLive,
        ),
      ),
    );
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
  readModelFor(cells, scopeForDir(cells, dir, sharedScope)).pipe(
    Effect.flatMap((readModel) => readModel.state.settings),
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
  readModelFor(cells, scopeForDir(cells, dir, sharedScope)).pipe(
    Effect.flatMap((readModel) => readModel.state.lockfile),
    Effect.map(Option.getOrElse(createEmptyLockfile)),
  );

/** Run one read against the selected scope's read model. */
export const readScopedModel = <A>(
  cells: StateCellPaths,
  runtimeDir: string,
  f: (scoped: WorkspaceReadModel) => Effect.Effect<A, SettingsReadError | LockfileReadError>,
): Effect.Effect<A, WorkspaceStateReadFailure, FileSystem.FileSystem | Path.Path> =>
  readModelFor(cells, scopeForDir(cells, runtimeDir)).pipe(Effect.flatMap(f));
