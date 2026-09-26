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
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import {
  applyProjectionPlans,
  projectionPlanExclusionWarnings,
  type ProjectionPlan,
} from "../planning.js";

import {
  SettingsReader,
  SettingsWriter,
  WorkspaceLocation,
  type WorkspaceSettingsMutationFailure,
  type WorkspaceSettingsReadFailure,
} from "../../desired-state/index.js";

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
  FileSystem.FileSystem | Path.Path | SettingsReader | WorkspaceLocation
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
  R | FileSystem.FileSystem | Path.Path
>;
export function reconcileInstructions(
  args: ReconcileInstructionsArgs & { readonly transition?: undefined },
): Effect.Effect<
  InstructionsReconciliation<void>,
  InstructionMaintenanceFailure,
  FileSystem.FileSystem | Path.Path
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
    return { ...syncResult({ snapshot: after, ...applied }), transition };
  }).pipe(Effect.withSpan("Instructions.reconcile"));
}

/** Bring owned aliases current after a shared-surface write, when management is enabled. */
export const reconcileInstructionAliases = (): Effect.Effect<
  Option.Option<InstructionsSyncResult>,
  WorkspaceSettingsReadFailure | InstructionMaintenanceFailure,
  FileSystem.FileSystem | Path.Path | SettingsReader | WorkspaceLocation
> =>
  Effect.gen(function* () {
    const config = yield* activeInstructionsConfig();
    if (Option.isNone(config)) return Option.none<InstructionsSyncResult>();
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const result = yield* reconcileInstructions({
      workspaceRoot: location.baseDir,
      scope: location.scope,
      configuredAgents: yield* settings.configuredAgents,
      config: config.value,
    });
    return Option.some<InstructionsSyncResult>(result);
  });

/** Apply shared instruction-surface regions, then the aliases depending on their content. */
export const applyInstructionSurfacePlans = <E, R>(
  plans: ReadonlyArray<ProjectionPlan<void, E, R>>,
): Effect.Effect<
  ReadonlyArray<string>,
  E | WorkspaceSettingsReadFailure | InstructionMaintenanceFailure,
  R | FileSystem.FileSystem | Path.Path | SettingsReader | WorkspaceLocation
> =>
  Effect.gen(function* () {
    yield* applyProjectionPlans(plans);
    yield* reconcileInstructionAliases();
    return projectionPlanExclusionWarnings(plans);
  });

/** What disabling instruction management removed. */
export interface DisabledInstructionManagement {
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
  FileSystem.FileSystem | Path.Path | SettingsReader | SettingsWriter | WorkspaceLocation
> =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settingsWriter = yield* SettingsWriter;
    yield* assertInstructionsGitignoreSafe(location.baseDir);
    const removed = yield* removeInstructionTargetsFor(args);
    const gitignore = yield* removeInstructionsGitignore({
      workspaceRoot: location.baseDir,
      dryRun: false,
    });
    yield* settingsWriter.setInstructionsConfig(false);
    return {
      removed,
      gitignore: Option.getOrUndefined(gitignore),
    };
  }).pipe(Effect.withSpan("Instructions.disableManagement"));
