import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import {
  assertInstructionTargetsSafe,
  assertInstructionsGitignoreSafe,
  instructionProjectionIsCurrent,
  observeInstructionProjection,
  removeManagedInstructionTargets,
  removeInstructionsGitignore,
  resolveInstructionsConfig,
  syncInstructions,
  type InstructionProjectionSnapshot,
  type ResolvedInstructionsConfig,
} from "@agentxm/extension-management/unstable/agents";
import type { WorkspaceMutationsService } from "@agentxm/extension-management/unstable/workspace";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";

const configuredAgents = (ws: WorkspaceMutationsService) =>
  ws.getConfiguredAgents().pipe(Effect.mapError(toAppError));

/** The one observation a command's planning derives its views from. */
export const observeInstructions = Effect.fn("Instructions.observe")(function* (args: {
  readonly ws: WorkspaceMutationsService;
  readonly config: ResolvedInstructionsConfig;
}) {
  const agents = yield* configuredAgents(args.ws);
  return yield* observeInstructionProjection({
    workspaceRoot: args.ws.baseDir,
    scope: args.ws.scope,
    configuredAgents: agents,
    config: args.config,
  });
});

export const activeInstructionsConfig = Effect.fn("Instructions.activeConfig")(function* (
  ws: WorkspaceMutationsService,
) {
  const value = yield* ws.getInstructionsConfig().pipe(Effect.mapError(toAppError));
  if (Option.isNone(value) || value.value === false) {
    return Option.none<ResolvedInstructionsConfig>();
  }
  return Option.some(resolveInstructionsConfig(value.value));
});

export const instructionStateIsCurrent = (snapshot: InstructionProjectionSnapshot): boolean =>
  snapshot.status.missingSources.length === 0 && instructionProjectionIsCurrent(snapshot);

export const instructionReconciliationReadiness = Effect.fn("Instructions.reconciliationReadiness")(
  function* (args: {
    readonly ws: WorkspaceMutationsService;
    readonly snapshot: InstructionProjectionSnapshot;
  }) {
    return yield* Effect.result(
      Effect.all(
        [
          assertInstructionTargetsSafe(args.snapshot.status),
          assertInstructionsGitignoreSafe(args.ws.baseDir),
        ],
        { concurrency: 1, discard: true },
      ),
    ).pipe(
      Effect.map((result) =>
        result._tag === "Success" ? Option.none<AppError>() : Option.some(result.failure),
      ),
    );
  },
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
}) =>
  Effect.gen(function* () {
    const snapshot = yield* observeInstructions(args);
    return yield* removeManagedInstructionTargets({ snapshot, dryRun: false });
  });

/**
 * Runs inside the workspace transaction: preflight against a fresh
 * observation (the plan's readiness check ran before the transaction opened),
 * apply the transition, reconcile, and verify from the sync's own readback.
 */
export const reconcileInstructionTransition = <A>(args: {
  readonly ws: WorkspaceMutationsService;
  readonly config: ResolvedInstructionsConfig;
  readonly preflightConfig?: ResolvedInstructionsConfig;
  readonly transition: Effect.Effect<A, AppError>;
}): Effect.Effect<A, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const agents = yield* configuredAgents(args.ws);
    const preflight = yield* observeInstructions({
      ws: args.ws,
      config: args.preflightConfig ?? args.config,
    });
    yield* assertInstructionTargetsSafe(preflight.status);
    yield* assertInstructionsGitignoreSafe(args.ws.baseDir);
    const transitionResult = yield* args.transition;
    const syncResult = yield* syncInstructions({
      workspaceRoot: args.ws.baseDir,
      scope: args.ws.scope,
      configuredAgents: agents,
      config: args.config,
      dryRun: false,
    });
    if (!instructionProjectionIsCurrent(syncResult.snapshot)) {
      return yield* makeAppError({
        code: "internal",
        detail: "Instruction reconciliation did not reach the desired state",
      });
    }
    return transitionResult;
  }).pipe(Effect.withSpan("Instructions.reconcileTransition"));

export const disableInstructionManagement = Effect.fn("Instructions.disableManagement")(
  function* (args: {
    readonly ws: WorkspaceMutationsService;
    readonly config: ResolvedInstructionsConfig;
  }) {
    yield* assertInstructionsGitignoreSafe(args.ws.baseDir);
    const removed = yield* removeInstructionTargetsFor(args);
    const gitignore = yield* removeInstructionsGitignore({
      workspaceRoot: args.ws.baseDir,
      dryRun: false,
    });
    yield* args.ws.setInstructionsConfig(false).pipe(Effect.mapError(toAppError));
    return {
      removed,
      gitignore: Option.getOrUndefined(gitignore),
    };
  },
);
