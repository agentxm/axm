/** Inventory and lifecycle rows for the selected workspace scope. */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { isLexicallyWithin } from "@agentxm/host-primitives";
import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import { createDefaultSettings } from "../desired/settings/index.js";
import type { WorkspaceStateReadFailure } from "./contracts.js";
import { packMemberBindings } from "./desired-pack-members.js";
import { DesiredStateReader, type DesiredStateReaderService } from "./desired-state-reader.js";
import { observeInstallRoot, type InstallRootInventory } from "./install-root.js";
import type { WorkspaceReadModel } from "../observed/service.js";
import { canonicalPathForAcceptedExtension } from "./canonical-observation.js";
import { acceptedRowKey } from "./accepted-reachability.js";
import { lockEntries } from "./entry-accessors.js";
import type { Warning } from "../observed/diagnostics.js";
import { WorkspaceLocation, type WorkspaceLocationService } from "./location.js";
import { LockfileReader, type LockfileReaderService } from "./lockfile-reader.js";
import {
  countExtensionInventory,
  projectExtensionInventory,
  type ExtensionInventory,
} from "../observed/extensions/inventory.js";
import { projectWorkspaceRecords } from "../observed/record-projection.js";
import type { WorkspaceRecordRow } from "../observed/records.js";
import type { LockfileReadError } from "../desired/lockfile/errors.js";
import type { SettingsReadError } from "../desired/settings/errors.js";
import { inspectExtensionInventory } from "./inventory-inspection.js";
import {
  ConfiguredAgentOutcomesProvider,
  type ConfiguredAgentOutcomesProviderService,
  type WorkspaceReadViewReaders,
} from "./configured-agent-outcomes-provider.js";
import { readScopedModel } from "./state-cells.js";

type Read<A> = Effect.Effect<A, WorkspaceStateReadFailure, FileSystem.FileSystem | Path.Path>;

export interface WorkspaceRecordsService {
  /** Inventory across every installable extension type, or a selected set of types. */
  readonly getInventory: (options: {
    readonly types?: ReadonlyArray<InstallableExtensionType>;
  }) => Read<ExtensionInventory>;
  /** Physical inventory and associations; native currency requires explicit details. */
  readonly getExtensionInventory: (
    type: InstallableExtensionType,
    options: { readonly agents?: ReadonlyArray<string>; readonly details?: boolean },
  ) => Read<ExtensionInventory>;
  /** Lifecycle records without configured-agent outcomes. */
  readonly rows: (type: InstallableExtensionType) => Read<ReadonlyArray<WorkspaceRecordRow>>;
}

export class WorkspaceRecords extends ServiceMap.Service<
  WorkspaceRecords,
  WorkspaceRecordsService
>()("@agentxm/workspace-kernel/workspace-state/WorkspaceRecords") {}

export const makeWorkspaceRecords = (
  location: WorkspaceLocationService,
  desiredState: DesiredStateReaderService,
  locks: Pick<LockfileReaderService, "lockfile">,
  view?: {
    readonly model: WorkspaceReadModel;
    readonly installRoot: Read<InstallRootInventory>;
    readonly readers: WorkspaceReadViewReaders;
  },
): WorkspaceRecordsService => {
  const rowCells = new Map<
    InstallableExtensionType,
    Effect.Effect<ReadonlyArray<WorkspaceRecordRow>, SettingsReadError | LockfileReadError>
  >();
  const withScoped = <A>(
    use: (context: {
      readonly configuredAgents: ReadonlyArray<string>;
      readonly provider: ConfiguredAgentOutcomesProviderService;
      readonly diagnostics: Effect.Effect<ReadonlyArray<Warning>>;
      readonly project: (
        type: InstallableExtensionType,
      ) => Effect.Effect<ReadonlyArray<WorkspaceRecordRow>, SettingsReadError | LockfileReadError>;
    }) => Effect.Effect<A, SettingsReadError | LockfileReadError>,
  ): Read<A> =>
    Effect.gen(function* () {
      const provider: ConfiguredAgentOutcomesProviderService = Option.getOrElse(
        yield* Effect.serviceOption(ConfiguredAgentOutcomesProvider),
        () => ({ byExtensionType: {} }),
      );
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const provide = <X, E>(effect: Effect.Effect<X, E, FileSystem.FileSystem | Path.Path>) =>
        effect.pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        );
      const graph = yield* provide(desiredState.graph());
      const layout = yield* Ref.get(location.layout);
      const accepted = yield* locks.lockfile;
      const expectedPaths = new Map<string, string>();
      for (const node of graph.nodes) {
        const key = acceptedRowKey(node);
        const entry = Option.isNone(key)
          ? undefined
          : Option.getOrUndefined(lockEntries[node.type].entry(accepted, key.value));
        const expected = canonicalPathForAcceptedExtension(path, layout, node, entry);
        if (expected !== undefined) expectedPaths.set(`${node.type}:${node.name}`, expected);
      }
      const installRoot = yield* provide(
        view?.installRoot ?? observeInstallRoot({ layout, graph, locks }),
      );
      const useModel = (scoped: WorkspaceReadModel) =>
        Effect.gen(function* () {
          const settings = Option.getOrElse(yield* scoped.state.settings, () =>
            createDefaultSettings(),
          );
          const configuredAgents = settings.agents ?? [];
          const project = (type: InstallableExtensionType) =>
            projectWorkspaceRecords(scoped, type, {
              bindings: packMemberBindings(graph, location.scope, type),
              expectedPaths,
              installRoot,
              configuredAgents,
              relative: (absolute) => path.relative(location.baseDir, absolute),
              isWithin: (root, target) => isLexicallyWithin(path, root, target),
            });
          const shared = (type: InstallableExtensionType) =>
            Effect.gen(function* () {
              if (view === undefined) return yield* project(type);
              const created = yield* Effect.cached(project(type));
              const selected = rowCells.get(type) ?? created;
              rowCells.set(type, selected);
              return yield* selected;
            });
          return yield* use({
            configuredAgents,
            provider,
            diagnostics: scoped.diagnostics,
            project: shared,
          });
        });
      return yield* provide(
        view === undefined
          ? readScopedModel(location, location.runtimeDir, useModel)
          : useModel(view.model),
      );
    });

  const inventoryFor = (rows: ReadonlyArray<WorkspaceRecordRow>, agents?: ReadonlyArray<string>) =>
    projectExtensionInventory(rows, {
      outcomes: () => [],
      ...(agents === undefined ? {} : { agents }),
    });

  return {
    rows: (type) => withScoped(({ project }) => project(type)),
    getExtensionInventory: (type, options) =>
      withScoped(({ project, diagnostics, configuredAgents, provider }) =>
        Effect.gen(function* () {
          const base = inventoryFor(yield* project(type), options.agents);
          const inventory =
            options.details === true
              ? yield* inspectExtensionInventory(base, provider, {
                  scope: location.scope,
                  agentIds: configuredAgents,
                  ...(view === undefined ? {} : { readers: view.readers }),
                })
              : base;
          const warnings = yield* diagnostics;
          return {
            ...inventory,
            ...(warnings.length === 0 ? {} : { observationDiagnostics: warnings }),
          };
        }),
      ),
    getInventory: (options) =>
      withScoped(({ project, diagnostics }) =>
        Effect.gen(function* () {
          const types =
            options.types === undefined || options.types.length === 0
              ? installableExtensionTypes
              : [...new Set(options.types)];
          const inventories = yield* Effect.forEach(types, (type) =>
            project(type).pipe(Effect.map((rows) => inventoryFor(rows))),
          );
          const items = inventories
            .flatMap((inventory) => inventory.items)
            .sort((left, right) =>
              left.type === right.type
                ? left.name.localeCompare(right.name)
                : left.type.localeCompare(right.type),
            );
          const warnings = yield* diagnostics;
          return {
            ...countExtensionInventory(items),
            ...(warnings.length === 0 ? {} : { observationDiagnostics: warnings }),
          };
        }),
      ),
  };
};

export const WorkspaceRecordsLive: Layer.Layer<
  WorkspaceRecords,
  never,
  WorkspaceLocation | DesiredStateReader | LockfileReader
> = Layer.effect(
  WorkspaceRecords,
  Effect.gen(function* () {
    return makeWorkspaceRecords(
      yield* WorkspaceLocation,
      yield* DesiredStateReader,
      yield* LockfileReader,
    );
  }),
);
