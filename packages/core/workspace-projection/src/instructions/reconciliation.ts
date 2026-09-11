/**
 * Instruction reconciliation over the workspace: the one observation a
 * caller derives its views from, the readiness preflight that decides
 * whether AXM may write at all, the transaction-scoped transition that
 * reconciles every alias, and the removal that turns management off.
 *
 * These facts live in the projection capability rather than in a feature
 * because more than one use case reconciles instruction files: managing the
 * instruction configuration itself, and activating or deactivating a rule
 * (whose projection contributes to the same alias set). A feature may not
 * import a peer feature, so the shared facts belong underneath both.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";

import type {
  WorkspaceMutationsService,
  WorkspaceSettingsMutationFailure,
  WorkspaceSettingsReadFailure,
} from "@agentxm/workspace-state";

import { InstructionMaintenanceFailed, type InstructionMaintenanceFailure } from "./errors.js";
import {
  assertInstructionTargetsSafe,
  assertInstructionsGitignoreSafe,
  instructionProjectionIsCurrent,
  observeInstructionProjection,
  removeInstructionsGitignore,
  removeManagedInstructionTargets,
  resolveInstructionsConfig,
  syncInstructions,
  type InstructionProjectionSnapshot,
  type InstructionsSyncResult,
  type ResolvedInstructionsConfig,
} from "./instructions.js";

/** The one observation a caller's planning derives its views from. */
export const observeInstructions = (args: {
  readonly ws: WorkspaceMutationsService;
  readonly config: ResolvedInstructionsConfig;
}): Effect.Effect<
  InstructionProjectionSnapshot,
  WorkspaceSettingsReadFailure,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const agents = yield* args.ws.getConfiguredAgents();
    return yield* observeInstructionProjection({
      workspaceRoot: args.ws.baseDir,
      scope: args.ws.scope,
      configuredAgents: agents,
      config: args.config,
    });
  }).pipe(Effect.withSpan("Instructions.observe"));

/**
 * The instruction configuration this workspace propagates today, or none
 * when it does not manage instruction files.
 */
export const activeInstructionsConfig = (
  ws: WorkspaceMutationsService,
): Effect.Effect<Option.Option<ResolvedInstructionsConfig>, WorkspaceSettingsReadFailure> =>
  Effect.gen(function* () {
    const value = yield* ws.getInstructionsConfig();
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

/**
 * The one readiness gate every instruction transition passes. It decides
 * whether AXM may write at all: an unowned target or an unrecognized
 * `.gitignore` region means the workspace holds a file AXM did not create,
 * and reconciliation stops before it can overwrite it.
 */
export const instructionReconciliationReadiness = (args: {
  readonly ws: WorkspaceMutationsService;
  readonly snapshot: InstructionProjectionSnapshot;
}): Effect.Effect<
  Option.Option<InstructionReadinessFailure>,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.result(
    Effect.all(
      [
        assertInstructionTargetsSafe(args.snapshot.status),
        assertInstructionsGitignoreSafe(args.ws.baseDir),
      ],
      { concurrency: 1, discard: true },
    ),
  ).pipe(
    Effect.map((result) =>
      result._tag === "Success"
        ? Option.none<InstructionReadinessFailure>()
        : Option.some(result.failure),
    ),
    Effect.withSpan("Instructions.reconciliationReadiness"),
  );

/**
 * Remove every alias the given configuration owns, observing fresh so the
 * decision reflects the workspace at the moment of removal. Used before a new
 * configuration is reconciled, so a changed source filename or alias policy
 * never leaves the old arrangement behind. Refuses on an unowned target like
 * every other path.
 */
export const removeInstructionTargetsFor = (args: {
  readonly ws: WorkspaceMutationsService;
  readonly config: ResolvedInstructionsConfig;
}): Effect.Effect<
  ReadonlyArray<string>,
  WorkspaceSettingsReadFailure | InstructionMaintenanceFailure,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const snapshot = yield* observeInstructions(args);
    return yield* removeManagedInstructionTargets({ snapshot, dryRun: false });
  });

/**
 * Runs inside the workspace transaction: preflight against a fresh
 * observation (the plan's readiness check ran before the transaction opened),
 * apply the transition, reconcile, and verify from the sync's own readback.
 */
export const reconcileInstructionTransition = <A, E, R = never>(args: {
  readonly ws: WorkspaceMutationsService;
  readonly config: ResolvedInstructionsConfig;
  readonly preflightConfig?: ResolvedInstructionsConfig;
  readonly transition: Effect.Effect<A, E, R>;
}): Effect.Effect<
  A,
  E | WorkspaceSettingsReadFailure | InstructionMaintenanceFailure,
  R | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const agents = yield* args.ws.getConfiguredAgents();
    const preflight = yield* observeInstructions({
      ws: args.ws,
      config: args.preflightConfig ?? args.config,
    });
    yield* assertInstructionTargetsSafe(preflight.status);
    yield* assertInstructionsGitignoreSafe(args.ws.baseDir);
    const transitionResult = yield* args.transition;
    const syncResult: InstructionsSyncResult = yield* syncInstructions({
      workspaceRoot: args.ws.baseDir,
      scope: args.ws.scope,
      configuredAgents: agents,
      config: args.config,
      dryRun: false,
    });
    if (!instructionProjectionIsCurrent(syncResult.snapshot)) {
      return yield* new InstructionMaintenanceFailed({
        category: "internal",
        detail: "Instruction reconciliation did not reach the desired state",
      });
    }
    return transitionResult;
  }).pipe(Effect.withSpan("Instructions.reconcileTransition"));

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
  readonly ws: WorkspaceMutationsService;
  readonly config: ResolvedInstructionsConfig;
}): Effect.Effect<
  DisabledInstructionManagement,
  WorkspaceSettingsReadFailure | WorkspaceSettingsMutationFailure | InstructionMaintenanceFailure,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    yield* assertInstructionsGitignoreSafe(args.ws.baseDir);
    const removed = yield* removeInstructionTargetsFor(args);
    const gitignore = yield* removeInstructionsGitignore({
      workspaceRoot: args.ws.baseDir,
      dryRun: false,
    });
    yield* args.ws.setInstructionsConfig(false);
    return {
      removed,
      gitignore: Option.getOrUndefined(gitignore),
    };
  }).pipe(Effect.withSpan("Instructions.disableManagement"));
