/**
 * Plan-family operation lifecycle wrapper.
 *
 * Owns the lifecycle fact a handler body cannot own for itself:
 * **interruption**. An external termination request resolves through the
 * normal lifecycle: the body's interruption is converted — from the operation
 * journal the resolution boundary maintains — into a terminal resolution with
 * outcome `interrupted`, a contract-valid document, a stated durable-state
 * disposition, and the signal's exit code.
 *
 * Mutual exclusion is not acquired here: planning, network acquisition,
 * preview, and confirmation run lock-free, and the plan-family apply (or the
 * workspace transaction it delegates to) acquires the workspace transition
 * after confirmation, for revalidation through apply.
 */

import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  effectCliExit,
  observeLifecycleForTelemetry,
  recordCommandCompletion,
  requestedInterruptionSignal,
} from "../../cli-runtime/index.js";
import {
  OperationJournal,
  OperationLifecycle,
  executedUnits,
  getOperationJournal,
  makeOperationJournal,
  makeOperationLifecycle,
  makeOperationResolution,
  unitIdOf,
  type AtomicityClass,
  type OperationMode,
  type OperationPresentation,
  type OperationRecovery,
  type OperationResolution,
  type ResolvedUnit,
  type OperationJournalState,
  type SettledOutcome,
} from "@agentxm/workspace-operations";
import { Screen } from "../../screen/index.js";
import {
  FootprintRecorder,
  WorkspaceMutations,
  makeFootprintRecorder,
  readFootprint,
} from "@agentxm/workspace-state";

import { emitOperationResolution } from "../../operation-output.js";

export interface OperationLifecycleArgs {
  /** Command identity, dot-separated as elsewhere (e.g. "skills.update"). */
  readonly command: string;
  readonly mode: "preview" | "apply";
  /** Operation name for a resolution produced before planning completes. */
  readonly planName: string;
  /**
   * The command family's statically declared atomicity, for a resolution
   * produced before the journal exists. Defaults to `closure-atomic`.
   */
  readonly declaredAtomicity?: AtomicityClass;
  readonly presentation?: OperationPresentation;
}

const replayCommand = (command: string): string => `axm ${command.split(".").join(" ")}`;

/**
 * Derive the terminal resolution for an externally interrupted invocation.
 * Before the journal exists nothing was planned or attempted: the resolution
 * carries the requested mode and the command family's declared atomicity —
 * never a hardcoded apply/closure-atomic claim. Exported for direct tests
 * of this mapping; not part of the module's public surface.
 *
 * @internal
 */
export const interruptionResolution = (
  args: OperationLifecycleArgs,
  journal: Option.Option<OperationJournalState>,
  signal: "SIGINT" | "SIGTERM",
  footprint: ReadonlyArray<{
    readonly path: string;
    readonly change: "created" | "modified" | "removed" | "restored";
  }>,
): OperationResolution<unknown> => {
  const observedFootprint = footprint.length === 0 ? {} : { footprint };
  if (Option.isNone(journal)) {
    return makeOperationResolution<unknown>({
      name: args.planName,
      description: Option.none(),
      mode: args.mode,
      atomicity: {
        declared: args.declaredAtomicity ?? "closure-atomic",
        // Nothing was attempted, so no durable effect was made or retained.
        applied: "closure-atomic",
      },
      units: [],
      presentation: args.presentation,
      interruption: { signal, disposition: "none" },
      ...observedFootprint,
    });
  }
  const state = journal.value;
  const applying = state.phase === "apply" || state.phase === "restoration";
  if (!applying) {
    // Planning, preview, confirmation, or validation: nothing was attempted
    // and the planned units stand as planned.
    return makeOperationResolution<unknown>({
      name: state.name,
      description: state.description,
      mode: state.mode,
      candidateId: state.candidateId,
      atomicity: { declared: state.atomicity.declared, applied: "closure-atomic" },
      units: state.plannedUnits,
      presentation: state.presentation ?? args.presentation,
      releaseAge: state.releaseAge,
      preconditions: state.preconditions,
      riskConditions: state.riskConditions,
      interruption: { signal, disposition: "none" },
      ...observedFootprint,
    });
  }
  const resolvedUnits = executedUnits({
    _tag: "ExecutedPlan",
    name: state.name,
    description: state.description,
    jobs: [{ concurrency: 1, steps: state.resolved }],
  });
  // Closures settle independently: a settled commit stands as retained
  // durable state regardless of the interruption, and a settled failure of a
  // restoring apply had already rolled back only its own closure.
  const settledUnits = resolvedUnits.map((unit) =>
    unit.state === "committed"
      ? { ...unit, disposition: "retained" as const }
      : unit.state === "failed" && state.restoresOnFailure
        ? { ...unit, disposition: "restored" as const }
        : unit,
  );
  const resolvedIds = new Set(state.resolved.map((step) => unitIdOf(step)));
  const startedIds = new Set(state.startedUnitIds);
  // A started unit missing a settlement fact was in flight at the stopping
  // point: its effects were restored by the closure's rollback, or their
  // settlement was simply not observed — never "not attempted".
  const inFlight: ReadonlyArray<ResolvedUnit<unknown>> = state.plannedUnits
    .filter((unit) => startedIds.has(unit.id) && !resolvedIds.has(unit.id))
    .map((unit) => ({
      ...unit,
      state: "interrupted",
      disposition: state.restoresOnFailure ? "restored" : "unknown",
      message: state.restoresOnFailure
        ? "interrupted while in flight; effects were restored"
        : "interrupted while in flight; settlement was not observed",
    }));
  const notStarted: ReadonlyArray<ResolvedUnit<unknown>> = state.plannedUnits
    .filter((unit) => !startedIds.has(unit.id) && !resolvedIds.has(unit.id))
    .map((unit) => ({
      ...unit,
      state: "blocked",
      message: "not attempted: the operation was interrupted",
      blocking: {
        class: "operation-aborted",
        subject: unit.id,
        phase: "apply",
        detail: "not attempted: the operation was interrupted",
        reference: "interruption",
      },
    }));
  const units = [...settledUnits, ...inFlight, ...notStarted];
  const committed = settledUnits.filter((unit) => unit.state === "committed");
  // Unknown dominates — durable state may exist beyond what settled. With
  // everything settled or restored, retained commits are the headline;
  // restored in-flight work without commits reports restored.
  const disposition =
    inFlight.length > 0 && !state.restoresOnFailure
      ? "unknown"
      : committed.length > 0
        ? "retained"
        : inFlight.length > 0 || (state.resolved.length > 0 && state.restoresOnFailure)
          ? "restored"
          : "none";
  const recovery: OperationRecovery | undefined =
    disposition === "retained" || disposition === "unknown"
      ? {
          retained: committed.flatMap((unit) =>
            unit.artifact === undefined ? [unit.id] : [unit.artifact.path],
          ),
          actions: [
            {
              description: "Re-run the command to continue the remaining units.",
              cmd: replayCommand(args.command),
            },
          ],
        }
      : undefined;
  return makeOperationResolution<unknown>({
    name: state.name,
    description: state.description,
    mode: state.mode,
    candidateId: state.candidateId,
    atomicity: {
      declared: state.atomicity.declared,
      // A restoring apply keeps its closure-atomic promise: settled commits
      // stand and everything else was restored. Only unobserved settlement
      // or non-rollbackable retention downgrade the applied class.
      applied: state.restoresOnFailure
        ? "closure-atomic"
        : disposition === "retained" || disposition === "unknown"
          ? "non-rollbackable"
          : "closure-atomic",
    },
    units,
    presentation: state.presentation ?? args.presentation,
    releaseAge: state.releaseAge,
    preconditions: state.preconditions,
    riskConditions: state.riskConditions,
    interruption: { signal, disposition },
    recovery,
    ...observedFootprint,
  });
};

export interface LiveOperationArgs {
  /** Command identity, dot-separated as elsewhere (e.g. "cache.prune"). */
  readonly command: string;
  /** Operation name observers render; never a formatted phrase. */
  readonly name: string;
  readonly mode: OperationMode;
  /** Outcome a successful body settles with; `completed` for non-plan operations. */
  readonly successOutcome?: SettledOutcome;
}

const settledOutcomeForExit = (
  exit: Exit.Exit<unknown, unknown>,
  success: SettledOutcome,
): SettledOutcome =>
  Exit.isSuccess(exit) ? success : Cause.hasInterruptsOnly(exit.cause) ? "interrupted" : "failed";

/**
 * Run a body as one observed operation: create the lifecycle broadcast,
 * attach the Screen's observer and telemetry before anything publishes,
 * announce the start, and on every exit settle (unless the body already did)
 * and wait for lossless observers to drain, bounded so exit never hangs.
 *
 * Non-plan commands wrap their work — not their result rendering — so the
 * live frame collapses before the settled document prints.
 */
export const withLiveOperation = <A, E, R>(
  args: LiveOperationArgs,
  body: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, OperationLifecycle> | Screen> =>
  Effect.scoped(
    Effect.gen(function* () {
      const screen = yield* Screen;
      const lifecycle = yield* makeOperationLifecycle({ name: args.name, mode: args.mode });
      yield* screen.observe(lifecycle);
      yield* observeLifecycleForTelemetry(lifecycle);
      yield* lifecycle.publish((seq, atMs) => ({
        _tag: "OperationStarted",
        seq,
        atMs,
        operationId: lifecycle.operationId,
        name: args.name,
        mode: args.mode,
      }));
      return yield* body.pipe(
        Effect.provideService(OperationLifecycle, lifecycle),
        Effect.onExit((exit) =>
          lifecycle
            .settle(settledOutcomeForExit(exit, args.successOutcome ?? "completed"))
            .pipe(
              Effect.andThen(
                lifecycle.drained.await.pipe(
                  Effect.timeoutOrElse({ duration: "5 seconds", orElse: () => Effect.void }),
                ),
              ),
            ),
        ),
      );
    }),
  );

/**
 * Run a plan-family handler body under the operation lifecycle. The body owns
 * planning, confirmation, apply (which acquires the workspace transition
 * after confirmation), and emit; interruption resolves through the same emit
 * boundary as every other termination.
 */
export const withOperationLifecycle = <A, E, R>(
  args: OperationLifecycleArgs,
  body: Effect.Effect<A, E, R>,
) =>
  Effect.scoped(
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const journal = yield* makeOperationJournal;
        const footprint = yield* makeFootprintRecorder;
        const path = yield* Path.Path;
        return yield* restore(
          withLiveOperation(
            { command: args.command, name: args.planName, mode: args.mode },
            body.pipe(
              Effect.provideService(OperationJournal, journal),
              Effect.provideService(FootprintRecorder, footprint),
            ),
          ),
        ).pipe(
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.gen(function* () {
                  const state = yield* getOperationJournal.pipe(
                    Effect.provideService(OperationJournal, journal),
                  );
                  const signal = requestedInterruptionSignal() ?? "SIGINT";
                  // The observed footprint travels with the interruption: what
                  // was durably touched before the signal landed.
                  const wsForFootprint = yield* WorkspaceMutations;
                  const observed = (yield* readFootprint.pipe(
                    Effect.provideService(FootprintRecorder, footprint),
                  ))
                    .map((entry) => ({
                      path: path.isAbsolute(entry.path)
                        ? path.relative(wsForFootprint.baseDir, entry.path)
                        : entry.path,
                      change: entry.change,
                    }))
                    .filter((entry) => !entry.path.startsWith(".."))
                    .filter(
                      (entry, index, entries) =>
                        entries.findIndex(
                          (other) => other.path === entry.path && other.change === entry.change,
                        ) === index,
                    )
                    .sort((left, right) =>
                      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
                    );
                  // An interruption leaves nothing behind in the workspace:
                  // the terminal report's recovery content and the next
                  // run's ordinary convergence carry the retained work. A
                  // restoration failure reports through the transaction's
                  // typed error instead, on this same emit boundary.
                  const resolution = interruptionResolution(args, state, signal, observed);
                  const { exitCode } = yield* emitOperationResolution(args.command, resolution);
                  // Inside the uninterruptible mask: the completion event must
                  // land before the die releases the pending interrupt.
                  yield* recordCommandCompletion(exitCode);
                  return yield* Effect.die(effectCliExit(exitCode));
                })
              : Effect.failCause(cause),
          ),
        );
      }),
    ),
  );
