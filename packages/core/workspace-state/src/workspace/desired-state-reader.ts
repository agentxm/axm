/**
 * Desired-state reader: the graph derived from settings and installed or
 * prospective Pack manifests, validated against the accepted lock state, and
 * the Pack-membership query commands ask before removing an extension.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import type * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import {
  buildDesiredStateGraph,
  type DesiredStateGraph,
  type ProspectivePackRef,
} from "./desired-state-graph.js";
import { validateDesiredPackLock } from "./desired-pack-lock.js";
import { DesiredPackGraphIncomplete } from "./errors.js";
import { WorkspaceLocation, type WorkspaceLocationService } from "./location.js";
import type { ExtensionTarget, WorkspaceStateReadFailure } from "./service-interface.js";
import { SettingsReader, type SettingsReaderService } from "./settings-reader.js";
import { readLockfileCell } from "./state-cells.js";

export interface DesiredStateReaderService {
  /** Build desired extension state from settings and installed or prospective Pack manifests. */
  readonly graph: (options?: {
    readonly prospectivePacks?: ReadonlyArray<ProspectivePackRef>;
  }) => Effect.Effect<
    DesiredStateGraph,
    WorkspaceStateReadFailure,
    FileSystem.FileSystem | Path.Path
  >;
  /** Whether an installed Pack's dependency maps reference the target. */
  readonly isRequiredByInstalledPack: (
    target: ExtensionTarget,
  ) => Effect.Effect<
    boolean,
    WorkspaceStateReadFailure | DesiredPackGraphIncomplete,
    FileSystem.FileSystem | Path.Path
  >;
}

export class DesiredStateReader extends ServiceMap.Service<
  DesiredStateReader,
  DesiredStateReaderService
>()("@agentxm/workspace-state/DesiredStateReader") {}

export const makeDesiredStateReader = (
  location: WorkspaceLocationService,
  settings: SettingsReaderService,
): DesiredStateReaderService => {
  const graph: DesiredStateReaderService["graph"] = (options) =>
    Effect.gen(function* () {
      const current = yield* settings.settings;
      const configuredSources = yield* settings.configuredSources;
      const layout = yield* Ref.get(location.layout);
      const registryAuthorities = Object.fromEntries(
        configuredSources.flatMap((source) =>
          source.type === "registry" ? [[source.name, source.location] as const] : [],
        ),
      );
      const built = yield* buildDesiredStateGraph({
        baseDir: location.baseDir,
        settings: current,
        layout,
        registryAuthorities,
        ...(options?.prospectivePacks === undefined
          ? {}
          : { prospectivePacks: options.prospectivePacks }),
      });
      const lockfile = yield* readLockfileCell(location, location.runtimeDir);
      return yield* validateDesiredPackLock({ graph: built, lockfile, layout });
    }).pipe(Effect.withSpan("DesiredStateReader.graph"));
  return {
    graph,
    isRequiredByInstalledPack: (target) =>
      Effect.gen(function* () {
        if (target.type === "pack") return false;
        const current = yield* graph();
        if (!current.complete) {
          return yield* new DesiredPackGraphIncomplete();
        }
        return current.nodes.some(
          (node) =>
            node.type === target.type &&
            node.name === target.name &&
            node.origins.some((origin) => origin.type === "pack"),
        );
      }),
  };
};

export const DesiredStateReaderLive: Layer.Layer<
  DesiredStateReader,
  never,
  WorkspaceLocation | SettingsReader
> = Layer.effect(
  DesiredStateReader,
  Effect.gen(function* () {
    return makeDesiredStateReader(yield* WorkspaceLocation, yield* SettingsReader);
  }),
);
