/**
 * Instruction reconciliation over the workspace: the one observation a
 * caller derives its views from, the readiness preflight that decides
 * whether AXM may write at all, the transaction-scoped transition that
 * reconciles every alias, and the removal that turns management off.
 *
 * These facts live in the projection capability because Rules, Hooks, and
 * Knowledge all contribute to the canonical instruction file. Every writer
 * reconciles the aliases after its shared region changes.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { instructionChangeLocations } from "./native-outcomes.js";
import {
  combineNativeLocationOutcomes,
  nativeUnitKey,
  type NativeLocationOutcome,
} from "../../locations/index.js";
import type { ConfiguredAgentOutcome } from "../../operations/index.js";
import type { ProjectionUnitObservation } from "../units.js";
import type { NativeWriteAuthority } from "../../agent-adapters/index.js";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  applyProjectionPlans,
  observeProjectionPlans,
  projectionPlanExclusionWarnings,
  type ProjectionPlan,
} from "../planning.js";

import {
  configuredAgentLifecycleOutcomes,
  SettingsReader,
  SettingsWriter,
  WorkspaceLocation,
  type WorkspaceSettingsMutationFailure,
  type WorkspaceSettingsReadFailure,
} from "../../workspace-state/index.js";

import { InstructionMaintenanceFailed, type InstructionMaintenanceFailure } from "./errors.js";
import {
  applyInstructionProjection,
  assertInstructionTargetsSafe,
  assertInstructionsGitignoreSafe,
  instructionProjectionIsCurrent,
  observeInstructionProjection,
  removeInstructionsGitignore,
  removeManagedInstructionTargets,
  resolveInstructionsConfig,
  syncResult,
  type InstructionProjectionSnapshot,
  type InstructionsSyncResult,
  type ObserveInstructionProjectionArgs,
  type ResolvedInstructionsConfig,
} from "./instructions.js";

/** The one observation a caller's planning derives its views from. */
export const observeInstructions = (args: {
  readonly config: ResolvedInstructionsConfig;
}): Effect.Effect<
  InstructionProjectionSnapshot,
  WorkspaceSettingsReadFailure,
  FileSystem.FileSystem | Path.Path | SettingsReader | WorkspaceLocation
> =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const agents = yield* settings.configuredAgents;
    return yield* observeInstructionProjection({
      workspaceRoot: location.baseDir,
      scope: location.scope,
      nativeDirectoryInputs: location.nativeDirectoryInputs,
      configuredAgents: agents,
      config: args.config,
    });
  }).pipe(Effect.withSpan("Instructions.observe"));

/**
 * The instruction configuration this workspace propagates today, or none
 * when it does not manage instruction files.
 */
export const activeInstructionsConfig = (): Effect.Effect<
  Option.Option<ResolvedInstructionsConfig>,
  WorkspaceSettingsReadFailure,
  SettingsReader
> =>
  Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const value = yield* settings.instructionsConfig;
    if (Option.isNone(value) || value.value === false) {
      return Option.none<ResolvedInstructionsConfig>();
    }
    return Option.some(resolveInstructionsConfig(value.value));
  }).pipe(Effect.withSpan("Instructions.activeConfig"));

/** Whether the observed arrangement already matches the recorded choice. */
export const instructionStateIsCurrent = (snapshot: InstructionProjectionSnapshot): boolean =>
  snapshot.status.missingSources.length === 0 && instructionProjectionIsCurrent(snapshot);

/** The typed failure a readiness preflight can surface. */
export type InstructionReadinessFailure = InstructionMaintenanceFailure;

export const instructionReadinessDetail = (failure: InstructionReadinessFailure): string =>
  failure._tag === "InstructionMaintenanceFailed"
    ? failure.detail
    : "Instruction reconciliation cannot proceed against the current workspace";

/**
 * The one readiness gate every instruction transition passes. It decides
 * whether AXM may write at all: an unowned target or an unrecognized
 * `.gitignore` region means the workspace holds a file AXM did not create,
 * and reconciliation stops before it can overwrite it.
 */
export const instructionReconciliationReadiness = (args: {
  readonly snapshot: InstructionProjectionSnapshot;
  readonly workspaceRoot: string;
}): Effect.Effect<
  Option.Option<InstructionReadinessFailure>,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const result = yield* Effect.result(
      Effect.all(
        [
          assertInstructionTargetsSafe(args.snapshot.status),
          assertInstructionsGitignoreSafe(args.workspaceRoot),
        ],
        { concurrency: 1, discard: true },
      ),
    );
    return result._tag === "Success"
      ? Option.none<InstructionReadinessFailure>()
      : Option.some(result.failure);
  }).pipe(Effect.withSpan("Instructions.reconciliationReadiness"));

/**
 * Remove every alias the given configuration owns, observing fresh so the
 * decision reflects the workspace at the moment of removal. Used before a new
 * configuration is reconciled, so a changed source filename or alias policy
 * never leaves the old arrangement behind. Refuses on an unowned target like
 * every other path.
 */
export const removeInstructionTargetsFor = (args: {
  readonly config: ResolvedInstructionsConfig;
}): Effect.Effect<
  ReadonlyArray<string>,
  WorkspaceSettingsReadFailure | InstructionMaintenanceFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority | SettingsReader | WorkspaceLocation
> =>
  Effect.gen(function* () {
    const snapshot = yield* observeInstructions(args);
    return yield* removeManagedInstructionTargets({ snapshot, dryRun: false });
  });

export interface InstructionsReconciliation<A> extends InstructionsSyncResult {
  readonly transition: A;
}

type ReconcileInstructionsArgs = ObserveInstructionProjectionArgs & {
  readonly preflightConfig?: ResolvedInstructionsConfig;
};

/** Gate, transition, apply, and read back one instruction projection. */
export function reconcileInstructions<A, E, R>(
  args: ReconcileInstructionsArgs & { readonly transition: Effect.Effect<A, E, R> },
): Effect.Effect<
  InstructionsReconciliation<A>,
  E | InstructionMaintenanceFailure,
  R | FileSystem.FileSystem | Path.Path | NativeWriteAuthority
>;
export function reconcileInstructions(
  args: ReconcileInstructionsArgs & { readonly transition?: undefined },
): Effect.Effect<
  InstructionsReconciliation<void>,
  InstructionMaintenanceFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
>;
export function reconcileInstructions(
  args: ReconcileInstructionsArgs & {
    readonly transition?: Effect.Effect<unknown, unknown, unknown> | undefined;
  },
): Effect.Effect<InstructionsReconciliation<unknown>, unknown, unknown> {
  return Effect.gen(function* () {
    const preflight = yield* observeInstructionProjection({
      ...args,
      config: args.preflightConfig ?? args.config,
    });
    yield* assertInstructionTargetsSafe(preflight.status);
    yield* assertInstructionsGitignoreSafe(args.workspaceRoot);
    const transition = yield* args.transition ?? Effect.void;
    const snapshot =
      args.transition === undefined && args.preflightConfig === undefined
        ? preflight
        : yield* observeInstructionProjection({
            ...args,
            symlinkSupported: preflight.symlinkSupported,
          });
    const applied = yield* applyInstructionProjection({
      workspaceRoot: args.workspaceRoot,
      config: args.config,
      snapshot,
      dryRun: false,
    });
    const after = yield* observeInstructionProjection({
      ...args,
      symlinkSupported: preflight.symlinkSupported,
    });
    if (!instructionProjectionIsCurrent(after)) {
      return yield* new InstructionMaintenanceFailed({
        category: "internal",
        detail: "Instruction reconciliation did not reach the desired state",
      });
    }
    return { ...syncResult({ snapshot: after, before: snapshot, ...applied }), transition };
  }).pipe(Effect.withSpan("Instructions.reconcile"));
}

/** Bring owned aliases current after a shared-surface write, when management is enabled. */
export const reconcileInstructionAliases = (options?: {
  readonly configuredAgents?: ReadonlyArray<string>;
  readonly eligibleAgentIds?: ReadonlyArray<string>;
  readonly eligibleTargets?: ReadonlyArray<string>;
}): Effect.Effect<
  Option.Option<InstructionsSyncResult>,
  WorkspaceSettingsReadFailure | InstructionMaintenanceFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority | SettingsReader | WorkspaceLocation
> =>
  Effect.gen(function* () {
    const config = yield* activeInstructionsConfig();
    if (Option.isNone(config)) return Option.none<InstructionsSyncResult>();
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const result = yield* reconcileInstructions({
      workspaceRoot: location.baseDir,
      scope: location.scope,
      nativeDirectoryInputs: location.nativeDirectoryInputs,
      configuredAgents: options?.configuredAgents ?? (yield* settings.configuredAgents),
      config: config.value,
      ...(options?.eligibleAgentIds === undefined
        ? {}
        : { eligibleAgentIds: options.eligibleAgentIds }),
      ...(options?.eligibleTargets === undefined
        ? {}
        : { eligibleTargets: options.eligibleTargets }),
    });
    return Option.some<InstructionsSyncResult>(result);
  });

/**
 * Observe shared instruction content with the routes owned by instruction
 * management. The current view reports actual alias entries; only the proposed
 * view includes future alias readers after a declared shared-surface write.
 */
export const observeInstructionSurfacePlans = <E, R>(
  plans: ReadonlyArray<ProjectionPlan<void, E, R>>,
  options?: {
    readonly view?: "current" | "proposed";
    readonly configuredAgents?: ReadonlyArray<string>;
  },
): Effect.Effect<
  ReadonlyArray<ProjectionUnitObservation>,
  E | WorkspaceSettingsReadFailure | InstructionMaintenanceFailure,
  R | FileSystem.FileSystem | Path.Path | SettingsReader | WorkspaceLocation
> =>
  Effect.gen(function* () {
    const observations = yield* observeProjectionPlans(plans);
    const proposedLocations = observations
      .filter(
        (observation) =>
          !observation.current &&
          (observation.unitId === "rule:instructions-region" ||
            observation.unitId === "knowledge:discovery-region"),
      )
      .flatMap((observation) => observation.nativeLocations ?? [])
      .filter(
        (unit) =>
          unit.address.kind === "region" && (unit.state === "created" || unit.state === "updated"),
      );
    const requiredLocations = observations
      .filter(
        (observation) =>
          (observation.unitId === "rule:instructions-region" ||
            observation.unitId === "knowledge:discovery-region") &&
          observation.expectedContributors.length > 0 &&
          (options?.view === "current" || observation.current),
      )
      .flatMap((observation) => observation.nativeLocations ?? [])
      .filter((unit) => unit.address.kind === "region");
    const routeLocations =
      options?.view === "current"
        ? requiredLocations
        : [...proposedLocations, ...requiredLocations];
    if (routeLocations.length === 0) return observations;
    const config = yield* activeInstructionsConfig();
    if (Option.isNone(config)) return observations;
    const path = yield* Path.Path;
    const prospectiveRoots = [
      ...new Set(
        routeLocations.flatMap((unit) =>
          unit.aliases
            .filter((alias) => path.basename(alias) === config.value.fileName)
            .map((alias) => path.dirname(alias)),
        ),
      ),
    ];
    if (prospectiveRoots.length === 0) return observations;
    const location = yield* WorkspaceLocation;
    const configuredAgents =
      options?.configuredAgents ?? (yield* (yield* SettingsReader).configuredAgents);
    const snapshot = yield* observeInstructionProjection({
      workspaceRoot: location.baseDir,
      scope: location.scope,
      nativeDirectoryInputs: location.nativeDirectoryInputs,
      configuredAgents,
      config: config.value,
      prospectiveRoots,
    });
    const requiredRoutes = snapshot.status.items.filter(
      (item) =>
        routeLocations.some(
          (unit) => item.sourceFile === unit.address.path || unit.aliases.includes(item.sourceFile),
        ) &&
        (item.mechanism === "native" || item.mechanism === "symlink" || item.mechanism === "copy"),
    );
    const withCurrentRoutes = (
      observation: ProjectionUnitObservation,
    ): ProjectionUnitObservation => {
      const targets = new Set(
        requiredRoutes
          .filter((route) =>
            (observation.nativeLocations ?? []).some(
              (unit) =>
                unit.address.kind === "region" &&
                (route.sourceFile === unit.address.path || unit.aliases.includes(route.sourceFile)),
            ),
          )
          .map((route) => route.targetFile),
      );
      // A healthy link is already represented by the region it makes readable.
      // Missing routes and separate copies retain their own instruction entry facts.
      const routes = snapshot.nativeLocations.filter(
        (unit) =>
          unit.address.kind === "entry" &&
          unit.aliases.some((alias) => targets.has(alias)) &&
          (unit.ownership !== "owned" ||
            unit.state !== "unchanged" ||
            unit.proof !== "exact-canonical-source-link"),
      );
      return {
        ...observation,
        nativeLocations: combineNativeLocationOutcomes([
          ...(observation.nativeLocations ?? []),
          ...routes,
        ]),
      };
    };
    if (options?.view === "current") return observations.map(withCurrentRoutes);
    const refusal = yield* instructionReconciliationReadiness({
      snapshot,
      workspaceRoot: location.baseDir,
    });
    if (Option.isSome(refusal)) return yield* refusal.value;
    const willReconcile = proposedLocations.length > 0;
    for (const route of requiredRoutes) {
      const target = snapshot.nativeLocations.find(
        (unit) =>
          unit.address.kind === (route.mechanism === "native" ? "file" : "entry") &&
          unit.aliases.includes(route.targetFile),
      );
      if (
        target === undefined ||
        target.ownership === "unverified" ||
        target.ownership === "unowned"
      )
        return yield* new InstructionMaintenanceFailed({
          category: "conflict",
          detail: `Cannot establish the proposed instruction route at ${route.targetFile}`,
        });
      if (
        !willReconcile &&
        (route.health !== "ok" || target.ownership !== "owned" || target.state !== "unchanged")
      )
        return yield* new InstructionMaintenanceFailed({
          category: "conflict",
          detail: `Required instruction route is not current at ${route.targetFile}; run axm sync to restore the configured instruction files.`,
        });
    }
    const proposedRoutes = requiredRoutes.filter((route) =>
      proposedLocations.some(
        (unit) => route.sourceFile === unit.address.path || unit.aliases.includes(route.sourceFile),
      ),
    );
    return observations.map((observation): ProjectionUnitObservation => {
      if (observation.current) return withCurrentRoutes(observation);
      const nativeLocations = (observation.nativeLocations ?? []).flatMap(
        (unit): ReadonlyArray<NativeLocationOutcome> => {
          if (
            unit.address.kind !== "region" ||
            (unit.state !== "created" && unit.state !== "updated")
          )
            return [unit];
          const routes = proposedRoutes.filter(
            (item) =>
              item.sourceFile === unit.address.path || unit.aliases.includes(item.sourceFile),
          );
          // Existing direct links remain links even when a new link probe fails.
          // A planned copy has its own physical entry and never aliases this region.
          const linked = routes.filter(
            (item) =>
              item.mechanism !== "copy" ||
              item.observedForm === "symlink" ||
              item.observedForm === "broken-link",
          );
          const consumers = [
            ...new Set([...unit.configuredConsumers, ...linked.map((item) => item.agentId)]),
          ].sort();
          const copies = routes
            .filter((item) => !linked.includes(item))
            .flatMap((item) =>
              snapshot.nativeLocations
                .filter(
                  (target) =>
                    target.address.kind === "entry" && target.aliases.includes(item.targetFile),
                )
                .map((target): NativeLocationOutcome => ({
                  ...target,
                  state: target.ownership === "absent" ? "created" : "updated",
                  reason:
                    "The instruction owner will copy the proposed canonical content to this separate native entry.",
                })),
            );
          return [
            {
              ...unit,
              aliases: [
                ...new Set([...unit.aliases, ...linked.map((item) => item.targetFile)]),
              ].sort(),
              configuredConsumers: consumers,
              potentialReaders: unit.potentialReaders.filter(
                (agentId) => !consumers.includes(agentId),
              ),
              availability: [
                ...unit.availability,
                ...consumers
                  .filter(
                    (agentId) => !unit.availability.some((entry) => entry.agentId === agentId),
                  )
                  .map((agentId) => ({
                    agentId,
                    state: "unverified" as const,
                    reason:
                      "The instruction owner has planned this native route; it is not current before apply.",
                  })),
              ],
            },
            ...copies,
          ];
        },
      );
      return { ...observation, nativeLocations: combineNativeLocationOutcomes(nativeLocations) };
    });
  });

/** Link one selected contributor to the instruction owner's proposed physical units. */
export const plannedInstructionContributorObservation = (args: {
  readonly type: "rule" | "knowledge";
  readonly name: string;
  readonly contributor: string;
  readonly observations: ReadonlyArray<ProjectionUnitObservation>;
  readonly agentIds: ReadonlyArray<string>;
  readonly scope: "project" | "user";
}) => {
  const nativeLocations = combineNativeLocationOutcomes(
    args.observations
      .filter((observation) => observation.expectedContributors.includes(args.contributor))
      .flatMap((observation) => observation.nativeLocations ?? []),
  );
  const agentOutcomes = configuredAgentLifecycleOutcomes({
    type: args.type,
    name: args.name,
    agentIds: args.agentIds,
    scope: args.scope,
    state: "projected",
    targetState: "enabled",
    installed: true,
  }).map((outcome): ConfiguredAgentOutcome => {
    const units = nativeLocations.filter((unit) =>
      unit.configuredConsumers.includes(outcome.agentId),
    );
    if (units.length === 0)
      return outcome.outcome === "unsupported"
        ? outcome
        : {
            ...outcome,
            outcome: "not-applicable",
            reasonCode: "no-applicable-native-unit",
            reason: "The prepared projection has no applicable native unit for this agent.",
            nativeUnitKeys: [],
          };
    return {
      ...outcome,
      outcome: "projected",
      reasonCode: "planned-native-unit",
      reason:
        "The owner has validated the proposed native realization; runtime selection remains unverified.",
      nativeUnitKeys: units.map(nativeUnitKey),
    };
  });
  return { nativeLocations, agentOutcomes };
};

/** Apply shared instruction-surface regions, then the aliases depending on their content. */
export const applyInstructionSurfacePlans = <E, R>(
  plans: ReadonlyArray<ProjectionPlan<void, E, R>>,
): Effect.Effect<
  ReadonlyArray<string>,
  E | WorkspaceSettingsReadFailure | InstructionMaintenanceFailure,
  R | FileSystem.FileSystem | Path.Path | NativeWriteAuthority | SettingsReader | WorkspaceLocation
> =>
  Effect.gen(function* () {
    const instructionPlans = plans.filter(
      ({ unitId }) =>
        unitId === "rule:instructions-region" || unitId === "knowledge:discovery-region",
    );
    const instructionChanges = yield* observeProjectionPlans(instructionPlans);
    yield* applyProjectionPlans(plans);
    // A native-only projection does not introduce instruction routing intent.
    // Repairing a previously missing alias belongs to explicit instruction sync.
    if (instructionChanges.some((observation) => !observation.current))
      yield* reconcileInstructionAliases();
    return projectionPlanExclusionWarnings(plans);
  });

/** What disabling instruction management removed. */
export interface DisabledInstructionManagement {
  readonly nativeLocations: ReadonlyArray<NativeLocationOutcome>;
  readonly removed: ReadonlyArray<string>;
  readonly gitignore: string | undefined;
}

/**
 * Turn instruction-file management off: refuse on a `.gitignore` region AXM
 * did not write, remove the aliases the recorded configuration owns, drop the
 * ignore region, and record that the workspace no longer propagates
 * instructions.
 */
export const disableInstructionManagement = (args: {
  readonly config: ResolvedInstructionsConfig;
}): Effect.Effect<
  DisabledInstructionManagement,
  WorkspaceSettingsReadFailure | WorkspaceSettingsMutationFailure | InstructionMaintenanceFailure,
  | FileSystem.FileSystem
  | Path.Path
  | NativeWriteAuthority
  | SettingsReader
  | SettingsWriter
  | WorkspaceLocation
> =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settingsWriter = yield* SettingsWriter;
    yield* assertInstructionsGitignoreSafe(location.baseDir);
    const snapshot = yield* observeInstructions(args);
    const removed = yield* removeManagedInstructionTargets({ snapshot, dryRun: false });
    const gitignore = yield* removeInstructionsGitignore({
      workspaceRoot: location.baseDir,
      dryRun: false,
    });
    yield* settingsWriter.setInstructionsConfig(false);
    return {
      removed,
      nativeLocations: instructionChangeLocations({
        snapshot,
        removed: [...removed, ...Option.toArray(gitignore)],
        written: [],
      }),
      gitignore: Option.getOrUndefined(gitignore),
    };
  }).pipe(Effect.withSpan("Instructions.disableManagement"));
