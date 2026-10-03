/**
 * @agentxm/workspace-kernel/workspace-state environment-backed composition.
 *
 * The workspace-state layers every entry point composes: the resolved
 * location, the narrow reader and writer services over it, the workspace
 * transaction scope anchored to its paths. Only application composition roots and named
 * test-support modules import this module; feature logic keeps the services
 * in its Effect environment.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { nativeAuthorityRoots } from "../locations/index.js";

import { WorkspaceTransactionScope, type WorkspaceFileWriteLocks } from "../settlement/index.js";
import { WorkspaceTransactionScopeLive as TransactionScopeLive } from "../settlement/live.js";
import { FilesystemPackManifests } from "./workspace/adapters/filesystem/pack-manifests.js";
import { FilesystemWorkspaceDocuments } from "./workspace/adapters/filesystem/documents.js";
import {
  AcceptedResolutionWriter,
  AcceptedResolutionWriterLive,
} from "./workspace/accepted-resolution-writer.js";
import { DesiredStateReader, DesiredStateReaderLive } from "./workspace/desired-state-reader.js";
import { DesiredStateWriter, DesiredStateWriterLive } from "./workspace/desired-state-writer.js";
import { ExtensionPaths, ExtensionPathsLive } from "./workspace/extension-paths-service.js";
import { LockfileReader, LockfileReaderLive } from "./workspace/lockfile-reader.js";
import { WorkspaceLocation, makeWorkspaceLocation } from "./workspace/location.js";
import { type WorkspaceStateError, type WorkspaceStateOptions } from "./workspace/contracts.js";
import { SettingsReader, SettingsReaderLive } from "./workspace/settings-reader.js";
import { SettingsWriter, SettingsWriterLive } from "./workspace/settings-writer.js";
import { WorkspaceStateShared, makeWorkspaceStateShared } from "./workspace/shared.js";
import { WorkspaceRecords, WorkspaceRecordsLive } from "./workspace/workspace-records.js";

import { WorkspaceReadViews, WorkspaceReadViewsLive } from "./workspace/read-view.js";

export type { WorkspaceStateOptions } from "./workspace/contracts.js";

/** The resolved location of the selected workspace scope. */
export const WorkspaceLocationLive = (
  options: WorkspaceStateOptions,
): Layer.Layer<WorkspaceLocation, WorkspaceStateError, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(WorkspaceLocation, makeWorkspaceLocation(options));

/** The narrow reader and writer services over one workspace location. */
export type WorkspaceStateServices =
  | WorkspaceReadViews
  | WorkspaceLocation
  | SettingsReader
  | LockfileReader
  | DesiredStateReader
  | WorkspaceRecords
  | ExtensionPaths
  | SettingsWriter
  | AcceptedResolutionWriter
  | DesiredStateWriter;

const stateServicesOver = (
  location: Layer.Layer<WorkspaceLocation, WorkspaceStateError, FileSystem.FileSystem | Path.Path>,
): Layer.Layer<
  WorkspaceStateServices,
  WorkspaceStateError,
  FileSystem.FileSystem | Path.Path | WorkspaceFileWriteLocks
> => {
  // The shared mutex and cache are composition-internal: one instance (the
  // layer is memoized by reference within a build) provided to every service
  // that needs it and never published to consumers.
  const shared = Layer.effect(WorkspaceStateShared, makeWorkspaceStateShared);
  const documents = Layer.provideMerge(FilesystemWorkspaceDocuments, location);
  const base = Layer.provideMerge(
    Layer.provide(DesiredStateReaderLive, FilesystemPackManifests),
    Layer.provideMerge(Layer.provide(SettingsReaderLive, shared), documents),
  );
  const readers = Layer.provideMerge(
    WorkspaceRecordsLive,
    Layer.provideMerge(LockfileReaderLive, base),
  );
  const withViews = Layer.provideMerge(
    Layer.provide(WorkspaceReadViewsLive, FilesystemPackManifests),
    readers,
  );
  const withPaths = Layer.provideMerge(ExtensionPathsLive, withViews);
  return Layer.provideMerge(
    Layer.provide(
      Layer.mergeAll(SettingsWriterLive, AcceptedResolutionWriterLive, DesiredStateWriterLive),
      shared,
    ),
    withPaths,
  );
};

/**
 * Every workspace-state service without a transaction scope. Compose a scope beside it: the
 * production one from `layer`, or a memory one from `./testing`.
 */
export const WorkspaceStateLive = (
  options: WorkspaceStateOptions,
): Layer.Layer<
  WorkspaceStateServices,
  WorkspaceStateError,
  FileSystem.FileSystem | Path.Path | WorkspaceFileWriteLocks
> => stateServicesOver(WorkspaceLocationLive(options));

/** The production transaction scope over the located workspace's paths. */
export const WorkspaceTransactionScopeLive: Layer.Layer<
  WorkspaceTransactionScope,
  never,
  WorkspaceLocation | FileSystem.FileSystem | Path.Path
> = Layer.unwrap(
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const path = yield* Path.Path;
    return TransactionScopeLive({
      workspaceDir: location.runtimeDir,
      nativeRoot: location.baseDir,
      nativeRoots: nativeAuthorityRoots(
        path,
        { workspaceRoot: location.baseDir, scope: location.scope },
        location.nativeDirectoryInputs,
      ),
      settingsPath: location.settingsPath,
      lockPath: location.lockPath,
    });
  }),
);

/**
 * The composed workspace layer every entry point provides: the state
 * services and the production transaction scope.
 */
export const layer = (
  options: WorkspaceStateOptions,
): Layer.Layer<
  WorkspaceStateServices | WorkspaceTransactionScope,
  WorkspaceStateError,
  FileSystem.FileSystem | Path.Path | WorkspaceFileWriteLocks
> => Layer.provideMerge(WorkspaceTransactionScopeLive, WorkspaceStateLive(options));
