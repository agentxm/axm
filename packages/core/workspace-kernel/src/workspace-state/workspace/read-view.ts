/** Explicitly bounded read views. A view ends before any workspace mutation. */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { LOCKFILE_VERSION, type Lockfile } from "../desired/lockfile/index.js";
import { createDefaultSettings, type SourceHostConfig } from "../desired/settings/index.js";
import type { WorkspaceStateReadFailure } from "./contracts.js";
import type { DesiredStateReaderService } from "./desired-state-reader.js";
import { ExtensionPaths, makeExtensionPaths } from "./extension-paths-service.js";
import { unresolvedPackRoutes } from "./desired-state-queries.js";
import { DesiredPackGraphIncomplete } from "./errors.js";
import { WorkspaceDocuments, type WorkspaceDocumentsService } from "./documents.js";
import { DesiredStateReader, makeDesiredStateReader } from "./desired-state-reader.js";
import { WorkspaceLocation } from "./location.js";
import { LockfileReader, makeLockfileReader } from "./lockfile-reader.js";
import { SettingsReader, makeSettingsReader } from "./settings-reader.js";
import { PackManifests } from "./pack-manifests.js";
import { observeInstallRoot } from "./install-root.js";
import { readModelFor } from "./state-cells.js";
import { WorkspaceRecords, makeWorkspaceRecords } from "./workspace-records.js";

type ReadServices =
  SettingsReader | LockfileReader | DesiredStateReader | WorkspaceRecords | ExtensionPaths;

export class WorkspaceReadViews extends Context.Service<
  WorkspaceReadViews,
  {
    /** Capture once per pure query or stable planning phase; never retain across writes. */
    readonly capture: Effect.Effect<Context.Context<ReadServices>, WorkspaceStateReadFailure>;
  }
>()("@agentxm/workspace-kernel/workspace-state/WorkspaceReadViews") {}

/**
 * Production composition supplies the factory. Narrow service test doubles can
 * exercise a query directly without replacing their deliberately supplied facts.
 */
export const withWorkspaceReadView = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const factory = yield* Effect.serviceOption(WorkspaceReadViews);
    if (Option.isNone(factory)) return yield* effect;
    const readers = yield* factory.value.capture;
    return yield* effect.pipe(Effect.provideContext(readers));
  });

export const WorkspaceReadViewsLive = Layer.effect(
  WorkspaceReadViews,
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const documents = yield* WorkspaceDocuments;
    const manifests = yield* PackManifests;
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const io = Context.make(FileSystem.FileSystem, fs).pipe(Context.add(Path.Path, path));
    return {
      capture: Effect.gen(function* () {
        const model = yield* readModelFor(location, location.scope);
        const inheritedScope = location.scope === "project" ? "user" : "project";
        const inherited = yield* Effect.cached(readModelFor(location, inheritedScope));
        const capturedDocuments: WorkspaceDocumentsService = {
          ...documents,
          settings: (scope?: "project" | "user") =>
            Effect.gen(function* () {
              if (location.observationView?.kind === "git-index" && scope === "user") {
                return createDefaultSettings();
              }
              const selected =
                scope === undefined || scope === location.scope ? model : yield* inherited;
              return Option.getOrElse(yield* selected.state.settings, createDefaultSettings);
            }).pipe(Effect.provideContext(io)),
          acceptedResolutionState: model.state.lockfile.pipe(
            Effect.map((value) => (Option.isSome(value) ? ("ok" as const) : ("missing" as const))),
            Effect.catchTag(
              [
                "LockfileIoError",
                "LockfileParseError",
                "LockfileDecodeError",
                "LockfileVersionUnsupported",
              ],
              () => Effect.succeed("invalid" as const),
            ),
          ),
          acceptedResolutions: model.state.lockfile.pipe(
            Effect.map(
              Option.getOrElse(
                () =>
                  ({
                    lockfileVersion: LOCKFILE_VERSION,
                    skills: {},
                  }) satisfies Lockfile,
              ),
            ),
          ),
        };
        const base = makeDesiredStateReader(location, capturedDocuments, manifests, path);
        const evaluation = yield* Effect.cached(base.evaluate());
        const desired: DesiredStateReaderService = {
          ...base,
          evaluate: (options) => (options === undefined ? evaluation : base.evaluate(options)),
          graph: (options) =>
            options === undefined
              ? evaluation.pipe(Effect.map((value) => value.graph))
              : base.graph(options),
          isRequiredByInstalledPack: (target) =>
            Effect.gen(function* () {
              if (target.type === "pack") return false;
              const { graph } = yield* evaluation;
              if (unresolvedPackRoutes(graph).length > 0)
                return yield* new DesiredPackGraphIncomplete();
              return graph.nodes.some(
                (node) =>
                  node.type === target.type &&
                  node.name === target.name &&
                  node.origins.some((origin) => origin.type === "pack"),
              );
            }),
        };
        const settings = makeSettingsReader(
          location,
          capturedDocuments,
          yield* Ref.make(Option.none<ReadonlyArray<SourceHostConfig>>()),
        );
        const locks = makeLockfileReader(capturedDocuments, desired, (yield* evaluation).graph);
        const layout = yield* Ref.get(location.layout);
        const installRoot = yield* Effect.cached(
          desired
            .graph()
            .pipe(Effect.flatMap((graph) => observeInstallRoot({ layout, graph, locks }))),
        );
        const readers = { desired, settings, locks };
        const records = makeWorkspaceRecords(location, desired, locks, {
          model,
          installRoot,
          readers,
        });
        return Context.make(DesiredStateReader, desired).pipe(
          Context.add(SettingsReader, settings),
          Context.add(LockfileReader, locks),
          Context.add(WorkspaceRecords, records),
          Context.add(ExtensionPaths, makeExtensionPaths(location, settings, locks)),
        );
      }).pipe(Effect.provideContext(io)),
    };
  }),
);
