import { RegistryClientFactory, type RegistryClientFactoryService } from "@agentxm/registry-client";
import { annotateWork, withWork } from "@agentxm/host-primitives/work-observation";
import { makeObservationReadView } from "./observation-read-view.js";
import { CanonicalNativePath } from "../../locations/index.js";
/** Explicitly bounded read views. A view ends before any workspace mutation. */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
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
import {
  WorkspaceDocuments,
  pendingAcceptedResolutions,
  type WorkspaceDocumentsService,
} from "./documents.js";
import { CurrentWorkspaceReadPhase, CurrentWorkspaceReadRequest } from "./read-phase.js";
import { CurrentWorkspaceReadPhaseInvalidation } from "./read-phase-lifetime.js";
import { DesiredStateReader, makeDesiredStateReader } from "./desired-state-reader.js";
import { WorkspaceLocation } from "./location.js";
import { LockfileReader, makeLockfileReader } from "./lockfile-reader.js";
import { SettingsReader, makeSettingsReader } from "./settings-reader.js";
import { PackManifests } from "./pack-manifests.js";
import { observeInstallRoot } from "./install-root.js";
import { readModelFor } from "./state-cells.js";
import { WorkspaceRecords, makeWorkspaceRecords } from "./workspace-records.js";

type ReadServices =
  | SettingsReader
  | LockfileReader
  | DesiredStateReader
  | WorkspaceRecords
  | ExtensionPaths
  | FileSystem.FileSystem;

export class WorkspaceReadViews extends Context.Service<
  WorkspaceReadViews,
  {
    readonly withRegistryReadPhase: RegistryClientFactoryService["withReadPhase"];
    /** Capture once per pure query or stable planning phase; never retain across writes. */
    readonly capture: (options?: {
      readonly observations?: boolean;
      /** An invocation may supply a more constrained read port before capture. */
      readonly fileSystem?: FileSystem.FileSystem;
    }) => Effect.Effect<Context.Context<ReadServices>, WorkspaceStateReadFailure>;
  }
>()("@agentxm/workspace-kernel/workspace-state/WorkspaceReadViews") {}

/**
 * Production composition supplies the factory. Narrow service test doubles can
 * exercise a query directly without replacing their deliberately supplied facts.
 */
const withReadView = <A, E, R>(effect: Effect.Effect<A, E, R>, observations: boolean) =>
  Effect.gen(function* () {
    const current = yield* CurrentWorkspaceReadPhase;
    if (current !== undefined && current.isActive()) {
      yield* Effect.annotateCurrentSpan("axm.work.reused", true);
      return yield* effect;
    }
    const factory = yield* Effect.serviceOption(WorkspaceReadViews);
    if (Option.isNone(factory)) return yield* effect;
    const readers = yield* factory.value.capture({ observations });
    yield* Effect.annotateCurrentSpan("axm.work.reused", false);
    const phase = Context.get(readers, CurrentWorkspaceReadPhase);
    return yield* effect.pipe(
      Effect.provideContext(readers),
      factory.value.withRegistryReadPhase,
      Effect.ensuring(
        Effect.suspend(() => {
          const reason = phase?.isActive() === false ? "mutation" : "phase-exit";
          phase?.close();
          return Effect.annotateCurrentSpan({
            "axm.work.invalidated": true,
            "axm.invalidation.reason": reason,
          });
        }),
      ),
    );
  }).pipe(Effect.withSpan("axm.observation.phase"));

/** Stable documents for a planning phase; live filesystem ports remain available. */
export const withWorkspaceReadView = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  withReadView(effect, false);

/** Pure queries may additionally share physical observations until the query returns. */
export const withWorkspaceObservationReadView = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  withReadView(effect, true);

/** Mutation/no-op verification must never inherit preparation's observations. */
export const withFreshWorkspaceObservationReadView = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  withReadView(effect, true).pipe(Effect.provideService(CurrentWorkspaceReadPhase, undefined));

export const WorkspaceReadViewsLive = Layer.effect(
  WorkspaceReadViews,
  Effect.gen(function* () {
    const registry = yield* RegistryClientFactory;
    const location = yield* WorkspaceLocation;
    const documents = yield* WorkspaceDocuments;
    const manifests = yield* PackManifests;
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const canonical = yield* CanonicalNativePath;
    return {
      withRegistryReadPhase: registry.withReadPhase,
      capture: (options) =>
        Effect.suspend(() => {
          let active = true;
          const close = () => {
            active = false;
          };
          const readFileSystem = options?.fileSystem ?? fs;
          const observation =
            options?.observations === true
              ? makeObservationReadView(readFileSystem, canonical, () => active, close)
              : Context.make(FileSystem.FileSystem, readFileSystem).pipe(
                  Context.add(CanonicalNativePath, canonical),
                );
          const io = observation.pipe(Context.add(Path.Path, path));
          return Effect.gen(function* () {
            const pending = yield* pendingAcceptedResolutions(documents);
            const model = yield* readModelFor(location, location.scope);
            const inheritedScope = location.scope === "project" ? "user" : "project";
            const inherited = yield* Effect.cached(readModelFor(location, inheritedScope));
            const capturedDocuments: WorkspaceDocumentsService = {
              ...documents,
              settings: (scope?: "project" | "user") =>
                Effect.gen(function* () {
                  if (!active) return yield* documents.settings(scope);
                  if (location.observationView?.kind === "git-index" && scope === "user") {
                    return createDefaultSettings();
                  }
                  const selected =
                    scope === undefined || scope === location.scope ? model : yield* inherited;
                  return Option.getOrElse(yield* selected.state.settings, () =>
                    (scope === undefined || scope === location.scope) &&
                    location.initialSettings !== undefined
                      ? location.initialSettings
                      : createDefaultSettings(),
                  );
                }).pipe(Effect.provideContext(io)),
              acceptedResolutionState: Effect.suspend(() =>
                !active
                  ? documents.acceptedResolutionState
                  : model.state.lockfile.pipe(
                      Effect.map((value) =>
                        Option.isSome(value) ? ("ok" as const) : ("missing" as const),
                      ),
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
              ),
              acceptedResolutions: Effect.suspend(() =>
                !active
                  ? documents.acceptedResolutions
                  : Option.isSome(pending)
                    ? Effect.succeed(pending.value)
                    : model.state.lockfile.pipe(
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
              ),
            };
            const base = makeDesiredStateReader(location, capturedDocuments, manifests, path);
            const observeEvaluation = (evaluation: ReturnType<typeof base.evaluate>) =>
              Effect.annotateCurrentSpan("axm.work.count", 1).pipe(
                Effect.andThen(evaluation),
                Effect.withSpan("axm.resolve.desired-state"),
              );
            const cacheEvaluation = (evaluation: ReturnType<typeof base.evaluate>) =>
              Effect.gen(function* () {
                let outcome: "miss" | "coalesced" | "hit" = "miss";
                let generation = 0;
                const work = observeEvaluation(evaluation);
                const cached = yield* Effect.cached(
                  Effect.gen(function* () {
                    const request = yield* CurrentWorkspaceReadRequest;
                    if (request !== undefined) request.executed = true;
                    const current = ++generation;
                    outcome = "coalesced";
                    return yield* annotateWork({
                      "axm.cache.outcome": "miss",
                      "axm.work.executed": 1,
                    }).pipe(
                      Effect.andThen(work),
                      Effect.onExit((exit) =>
                        Effect.sync(() => {
                          if (generation === current)
                            outcome = Exit.hasInterrupts(exit) ? "miss" : "hit";
                        }),
                      ),
                    );
                  }),
                );
                return Effect.gen(function* () {
                  const request = { executed: false };
                  const selected = outcome;
                  yield* annotateWork({
                    "axm.cache.outcome": selected,
                    "axm.work.requested": 1,
                    "axm.work.executed": 0,
                    "axm.work.reused-count": 0,
                  });
                  return yield* cached.pipe(
                    Effect.provideService(CurrentWorkspaceReadRequest, request),
                    Effect.onExit((exit) =>
                      Exit.hasInterrupts(exit) || request.executed
                        ? Effect.void
                        : annotateWork({ "axm.work.reused-count": 1 }),
                    ),
                  );
                }).pipe((effect) => withWork("axm.resolve.desired-state-reuse", effect));
              });
            const evaluation = yield* cacheEvaluation(base.evaluate());
            const candidates: Array<{
              readonly inputs: NonNullable<Parameters<typeof base.evaluate>[0]>;
              readonly evaluation: ReturnType<typeof base.evaluate>;
            }> = [];
            const evaluate: DesiredStateReaderService["evaluate"] = (options) =>
              Effect.suspend(() =>
                !active
                  ? annotateWork({
                      "axm.cache.outcome": "bypass",
                      "axm.work.requested": 1,
                      "axm.work.executed": 1,
                      "axm.work.reused-count": 0,
                    }).pipe(Effect.andThen(observeEvaluation(base.evaluate(options))), (effect) =>
                      withWork("axm.resolve.desired-state-reuse", effect),
                    )
                  : options === undefined
                    ? evaluation
                    : Effect.gen(function* () {
                        // Retain immutable input identities without serializing whole
                        // caller values or collapsing distinct candidate documents.
                        const existing = () =>
                          candidates.find(
                            ({ inputs }) =>
                              inputs.settings === options.settings &&
                              inputs.acceptedResolutions === options.acceptedResolutions &&
                              inputs.prospectivePacks === options.prospectivePacks,
                          );
                        const prior = existing();
                        if (prior !== undefined) return yield* prior.evaluation;
                        const created = yield* cacheEvaluation(base.evaluate(options));
                        const selected = existing()?.evaluation ?? created;
                        if (existing() === undefined)
                          candidates.push({ inputs: options, evaluation: selected });
                        return yield* selected;
                      }),
              );
            const desired: DesiredStateReaderService = {
              ...base,
              evaluate,
              graph: (options) => evaluate(options).pipe(Effect.map((value) => value.graph)),
              isRequiredByInstalledPack: (target) =>
                Effect.gen(function* () {
                  if (target.type === "pack") return false;
                  const { graph } = yield* evaluate();
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
              () => active,
            );
            // Only MCP alias lookup needs the graph; a lock-only query must not
            // evaluate every authored Pack while acquiring its readers.
            const locks = makeLockfileReader(capturedDocuments, desired);
            const layout = yield* Ref.get(location.layout);
            const installRoot = yield* Effect.cached(
              desired
                .graph()
                .pipe(Effect.flatMap((graph) => observeInstallRoot({ layout, graph, locks }))),
            );
            const capturedRecords = makeWorkspaceRecords(location, desired, locks, {
              model,
              installRoot,
              readers: { desired, settings, locks },
            });
            const liveRecords = makeWorkspaceRecords(location, desired, locks);
            const records: typeof capturedRecords = {
              getInventory: (options) =>
                Effect.suspend(() =>
                  (active ? capturedRecords : liveRecords).getInventory(options),
                ),
              getExtensionInventory: (type, options) =>
                Effect.suspend(() =>
                  (active ? capturedRecords : liveRecords).getExtensionInventory(type, options),
                ),
              rows: (type) =>
                Effect.suspend(() => (active ? capturedRecords : liveRecords).rows(type)),
            };
            return Context.make(DesiredStateReader, desired).pipe(
              Context.add(SettingsReader, settings),
              Context.add(LockfileReader, locks),
              Context.add(WorkspaceRecords, records),
              Context.add(ExtensionPaths, makeExtensionPaths(location, settings, locks)),
              Context.add(
                CurrentWorkspaceReadPhaseInvalidation,
                Effect.andThen(Effect.sync(close), registry.invalidateReadPhase),
              ),
              Context.add(CurrentWorkspaceReadPhase, {
                fileSystem: Context.get(observation, FileSystem.FileSystem),
                readers: { desired, settings, locks },
                packDocuments: new Map(),
                isActive: () => active,
                close,
              }),
              Context.merge(observation),
            );
          }).pipe(Effect.provideContext(io));
        }),
    };
  }),
);
