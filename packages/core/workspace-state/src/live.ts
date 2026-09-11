/**
 * @agentxm/workspace-state environment-backed composition.
 *
 * The workspace-state layers every entry point composes: the resolved
 * location, the narrow reader and writer services over it, the workspace
 * transaction scope anchored to its paths, and — transitionally — the
 * `WorkspaceMutations` facade. Only application composition roots and named
 * test-support modules import this module; feature logic keeps the services
 * in its Effect environment.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import type * as Path from "effect/Path";

import { WorkspaceTransactionScope } from "@agentxm/workspace-transactions";
import {
  AcceptedResolutionWriter,
  AcceptedResolutionWriterLive,
} from "./workspace/accepted-resolution-writer.js";
import { DesiredStateReader, DesiredStateReaderLive } from "./workspace/desired-state-reader.js";
import { DesiredStateWriter, DesiredStateWriterLive } from "./workspace/desired-state-writer.js";
import { ExtensionPaths, ExtensionPathsLive } from "./workspace/extension-paths-service.js";
import { LockfileReader, LockfileReaderLive } from "./workspace/lockfile-reader.js";
import { WorkspaceLocation, makeWorkspaceLocation } from "./workspace/location.js";
import { makeWorkspaceMutationsFacade } from "./workspace/service.js";
import {
  WorkspaceMutations,
  type WorkspaceMutationsError,
  type WorkspaceMutationsOptions,
} from "./workspace/service-interface.js";
import { SettingsReader, SettingsReaderLive } from "./workspace/settings-reader.js";
import { SettingsWriter, SettingsWriterLive } from "./workspace/settings-writer.js";
import { WorkspaceStateShared, makeWorkspaceStateShared } from "./workspace/shared.js";
import { WorkspaceRecords, WorkspaceRecordsLive } from "./workspace/workspace-records.js";

export type { WorkspaceMutationsOptions } from "./workspace/service-interface.js";

/** The resolved location of the selected workspace scope. */
export const WorkspaceLocationLive = (
  options: WorkspaceMutationsOptions,
): Layer.Layer<WorkspaceLocation, WorkspaceMutationsError, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(WorkspaceLocation, makeWorkspaceLocation(options));

/** The narrow reader and writer services over one workspace location. */
export type WorkspaceStateServices =
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
  location: Layer.Layer<
    WorkspaceLocation,
    WorkspaceMutationsError,
    FileSystem.FileSystem | Path.Path
  >,
): Layer.Layer<
  WorkspaceStateServices,
  WorkspaceMutationsError,
  FileSystem.FileSystem | Path.Path
> => {
  // The shared mutex and cache are composition-internal: one instance (the
  // layer is memoized by reference within a build) provided to every service
  // that needs it and never published to consumers.
  const shared = Layer.effect(WorkspaceStateShared, makeWorkspaceStateShared);
  const readers = Layer.provideMerge(
    Layer.mergeAll(WorkspaceRecordsLive, LockfileReaderLive),
    Layer.provideMerge(
      DesiredStateReaderLive,
      Layer.provideMerge(Layer.provide(SettingsReaderLive, shared), location),
    ),
  );
  const withPaths = Layer.provideMerge(ExtensionPathsLive, readers);
  return Layer.provideMerge(
    Layer.provide(
      Layer.mergeAll(SettingsWriterLive, AcceptedResolutionWriterLive, DesiredStateWriterLive),
      shared,
    ),
    withPaths,
  );
};

/**
 * Every workspace-state service plus the transitional `WorkspaceMutations`
 * facade, without a transaction scope. Compose a scope beside it: the
 * production one from `layer`, or a memory one from `./testing`.
 */
export const WorkspaceStateLive = (
  options: WorkspaceMutationsOptions,
): Layer.Layer<
  WorkspaceStateServices | WorkspaceMutations,
  WorkspaceMutationsError,
  FileSystem.FileSystem | Path.Path
> =>
  // TRANSITIONAL: the facade layer is removed when the last domain package
  // reads and writes through the services.
  Layer.provideMerge(
    Layer.effect(WorkspaceMutations, makeWorkspaceMutationsFacade),
    stateServicesOver(WorkspaceLocationLive(options)),
  );

/** The production transaction scope over the located workspace's paths. */
export const WorkspaceTransactionScopeLive: Layer.Layer<
  WorkspaceTransactionScope,
  never,
  WorkspaceLocation
> = Layer.unwrap(
  Effect.map(WorkspaceLocation, (location) =>
    WorkspaceTransactionScope.layer({
      workspaceDir: location.runtimeDir,
      settingsPath: location.settingsPath,
      lockPath: location.lockPath,
    }),
  ),
);

/**
 * The composed workspace layer every entry point provides: the state
 * services, the transitional facade, and the production transaction scope.
 */
export const layer = (
  options: WorkspaceMutationsOptions,
): Layer.Layer<
  WorkspaceStateServices | WorkspaceMutations | WorkspaceTransactionScope,
  WorkspaceMutationsError,
  FileSystem.FileSystem | Path.Path
> => Layer.provideMerge(WorkspaceTransactionScopeLive, WorkspaceStateLive(options));
