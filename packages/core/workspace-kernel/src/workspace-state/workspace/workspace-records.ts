/** Inventory and lifecycle rows for the selected workspace scope. */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { isWithinOrEqual } from "@agentxm/extension-model/unstable/path-types";
import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import { createDefaultSettings } from "../desired/settings/index.js";
import {
  ConfiguredAgentOutcomesProvider,
  genericConfiguredAgentOutcomes,
  resolveConfiguredExtensionObservations,
  type ConfiguredAgentOutcomesProviderService,
} from "./configured-agent-outcomes-provider.js";
import type { WorkspaceStateReadFailure } from "./contracts.js";
import { packMemberBindings } from "./desired-pack-members.js";
import { DesiredStateReader, type DesiredStateReaderService } from "./desired-state-reader.js";
import { observeInstallRoot, type InstallRootInventory } from "./install-root.js";
import type { WorkspaceReadModel } from "../observed/service.js";
import type { WorkspaceReadViewReaders } from "./configured-agent-outcomes-provider.js";
import { WorkspaceLocation, type WorkspaceLocationService } from "./location.js";
import { LockfileReader, type LockfileReaderService } from "./lockfile-reader.js";
import {
  countExtensionInventory,
  isDesiredInventoryLifecycle,
  projectExtensionInventory,
  type ExtensionInventory,
} from "../observed/extensions/inventory.js";
import { projectWorkspaceRecords } from "../observed/record-projection.js";
import type { WorkspaceRecordRow } from "../observed/records.js";
import type { LockfileReadError, SettingsReadError } from "../observed/errors.js";
import { readScopedModel } from "./state-cells.js";

type Read<A> = Effect.Effect<A, WorkspaceStateReadFailure, FileSystem.FileSystem | Path.Path>;

export interface WorkspaceRecordsService {
  /** Inventory across every installable extension type, or one selected type. */
  readonly getInventory: (options: {
    readonly type?: InstallableExtensionType;
  }) => Read<ExtensionInventory>;
  /** Physical inventory with configured-agent outcomes overlaid. */
  readonly getExtensionInventory: (
    type: InstallableExtensionType,
    options: { readonly agents?: ReadonlyArray<string> },
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
  const withScoped = <A>(
    use: (context: {
      readonly configuredAgents: ReadonlyArray<string>;
      readonly provider: ConfiguredAgentOutcomesProviderService;
      readonly project: (
        type: InstallableExtensionType,
      ) => Effect.Effect<ReadonlyArray<WorkspaceRecordRow>, SettingsReadError | LockfileReadError>;
    }) => Effect.Effect<A, SettingsReadError | LockfileReadError>,
  ): Read<A> =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const provider = Option.getOrElse(
        yield* Effect.serviceOption(ConfiguredAgentOutcomesProvider),
        () => ({
          byExtensionType: {},
        }),
      );
      const provide = <X, E>(effect: Effect.Effect<X, E, FileSystem.FileSystem | Path.Path>) =>
        effect.pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        );
      const graph = yield* provide(desiredState.graph());
      const layout = yield* Ref.get(location.layout);
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
              installRoot,
              configuredAgents,
              relative: (absolute) => path.relative(location.baseDir, absolute),
              isWithin: (root, target) => isWithinOrEqual(path, root, target),
            });
          return yield* use({ configuredAgents, provider, project });
        });
      return yield* provide(
        view === undefined
          ? readScopedModel(location, location.runtimeDir, useModel)
          : useModel(view.model),
      );
    });

  const inventoryFor = (
    type: InstallableExtensionType,
    rows: ReadonlyArray<WorkspaceRecordRow>,
    configuredAgents: ReadonlyArray<string>,
    provider: ConfiguredAgentOutcomesProviderService,
    agents?: ReadonlyArray<string>,
  ) =>
    Effect.gen(function* () {
      const desired = rows.filter((row) =>
        isDesiredInventoryLifecycle(row.classification.lifecycle),
      );
      const request = {
        ...(view === undefined ? {} : { readers: view.readers }),
        type,
        state: "current" as const,
        scope: location.scope,
        agentIds: configuredAgents,
        rows: (type === "skill" ? rows : desired).map((row) => ({
          name: row.name,
          targetState: !isDesiredInventoryLifecycle(row.classification.lifecycle)
            ? ("absent" as const)
            : row.enabled === false
              ? ("disabled" as const)
              : ("enabled" as const),
          installed: row.installed,
          paths: row.paths,
          observedAgentIds: row.agents,
        })),
      };
      const observations = yield* resolveConfiguredExtensionObservations(provider, request).pipe(
        Effect.catchTag("ConfiguredAgentOutcomesUnavailable", () =>
          Effect.succeed(
            new Map(
              [...genericConfiguredAgentOutcomes(request)].map(([name, outcomes]) => [
                name,
                {
                  agentOutcomes: outcomes.map((outcome) => ({
                    ...outcome,
                    outcome: "blocked" as const,
                    reasonCode: "native-observation-unavailable",
                    reason: "Native locations could not be verified.",
                  })),
                  nativeLocations: [],
                },
              ]),
            ),
          ),
        ),
      );
      return projectExtensionInventory(rows, {
        outcomes: (row) =>
          isDesiredInventoryLifecycle(row.classification.lifecycle)
            ? (observations.get(row.name)?.agentOutcomes ?? [])
            : [],
        nativeLocations: (row) =>
          provider.byExtensionType[type] === undefined
            ? undefined
            : observations.get(row.name)?.nativeLocations,
        ...(agents === undefined ? {} : { agents }),
      });
    });

  return {
    rows: (type) => withScoped(({ project }) => project(type)),
    getExtensionInventory: (type, options) =>
      withScoped(({ project, configuredAgents, provider }) =>
        project(type).pipe(
          Effect.flatMap((rows) =>
            inventoryFor(type, rows, configuredAgents, provider, options.agents),
          ),
        ),
      ),
    getInventory: (options) =>
      withScoped(({ project, configuredAgents, provider }) =>
        Effect.gen(function* () {
          const types = options.type === undefined ? installableExtensionTypes : [options.type];
          const inventories = yield* Effect.forEach(types, (type) =>
            project(type).pipe(
              Effect.flatMap((rows) => inventoryFor(type, rows, configuredAgents, provider)),
            ),
          );
          const items = inventories
            .flatMap((inventory) => inventory.items)
            .sort((left, right) =>
              left.type === right.type
                ? left.name.localeCompare(right.name)
                : left.type.localeCompare(right.type),
            );
          return countExtensionInventory(items);
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
