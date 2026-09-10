/**
 * Workspace records: the read model's inventory and lifecycle-tagged rows
 * for every installable extension type, over the selected scope.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { DesiredStateReader, type DesiredStateReaderService } from "./desired-state-reader.js";
import { WorkspaceLocation, type WorkspaceLocationService } from "./location.js";
import type { ExtensionInventory } from "./read-model/extensions/inventory.js";
import { makeReadModelRecordReaders } from "./read-model-record-readers.js";
import type { ReadModelRecordRow } from "./read-model-record-types.js";
import type { WorkspaceStateReadFailure } from "./service-interface.js";
import { readScopedModel } from "./state-cells.js";

type Read<A> = Effect.Effect<A, WorkspaceStateReadFailure, FileSystem.FileSystem | Path.Path>;

export interface WorkspaceRecordsService {
  /** Deterministic inventory across every installable extension type or one selected type. */
  readonly getInventory: (options: {
    readonly type?: InstallableExtensionType;
  }) => Read<ExtensionInventory>;
  /** Read-only physical inventory for one extension type. */
  readonly getExtensionInventory: (
    type: InstallableExtensionType,
    options: { readonly agents?: ReadonlyArray<string> },
  ) => Read<ExtensionInventory>;
  /**
   * Every read-model row for one extension type, tagged with its lifecycle
   * (`configured` / `implicit` / `unmanaged`). Total over
   * `InstallableExtensionType` and non-throwing.
   */
  readonly rows: (type: InstallableExtensionType) => Read<ReadonlyArray<ReadModelRecordRow>>;
}

export class WorkspaceRecords extends ServiceMap.Service<
  WorkspaceRecords,
  WorkspaceRecordsService
>()("@agentxm/workspace-state/WorkspaceRecords") {}

export const makeWorkspaceRecords = (
  location: WorkspaceLocationService,
  desiredState: DesiredStateReaderService,
): WorkspaceRecordsService => {
  // The record readers take the platform path service and scoped reads with
  // the platform already discharged; bind both at each call so `FileSystem`
  // and `Path` stay requirements of every member rather than captures.
  const withReaders = <A>(
    use: (
      readers: ReturnType<typeof makeReadModelRecordReaders>,
    ) => Effect.Effect<A, WorkspaceStateReadFailure>,
  ): Read<A> =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const provide = <X, E>(effect: Effect.Effect<X, E, FileSystem.FileSystem | Path.Path>) =>
        effect.pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        );
      const readers = makeReadModelRecordReaders({
        baseDir: location.baseDir,
        path,
        readScopedContext: (f) => provide(readScopedModel(location, location.runtimeDir, f)),
        getDesiredStateGraph: () => provide(desiredState.graph()),
      });
      return yield* use(readers);
    });
  return {
    getInventory: (options) => withReaders((readers) => readers.getInventory(options)),
    getExtensionInventory: (type, options) =>
      withReaders((readers) => readers.getExtensionInventory(type, options)),
    rows: (type) => withReaders((readers) => readers.getReadModelRecordRows(type)),
  };
};

export const WorkspaceRecordsLive: Layer.Layer<
  WorkspaceRecords,
  never,
  WorkspaceLocation | DesiredStateReader
> = Layer.effect(
  WorkspaceRecords,
  Effect.gen(function* () {
    return makeWorkspaceRecords(yield* WorkspaceLocation, yield* DesiredStateReader);
  }),
);
