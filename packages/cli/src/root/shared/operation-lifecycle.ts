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
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  effectCliExit,
  recordCommandCompletion,
  requestedInterruptionSignal,
} from "@agentxm/client-core/unstable/cli-runtime";
import {
  OperationJournal,
  OperationLifecycle,
  executedUnits,
  getOperationJournal,
  makeOperationJournal,
  makeOperationLifecycle,
  makeOperationResolution,
  unitIdOf,
  type OperationPresentation,
  type OperationRecovery,
  type OperationResolution,
  type ResolvedUnit,
  type OperationJournalState,
} from "@agentxm/client-core/unstable/plan";
import {
  FootprintRecorder,
  WorkspaceMutations,
  makeFootprintRecorder,
  readFootprint,
} from "@agentxm/client-core/unstable/workspace";

import { emitOperationResolution } from "../../operation-output.js";

export interface OperationLifecycleArgs {
  /** Command identity, dot-separated as elsewhere (e.g. "skills.update"). */
  readonly command: string;
  readonly mode: "preview" | "apply";
  /** Operation name for a resolution produced before planning completes. */
  readonly planName: string;
  readonly presentation?: OperationPresentation;
}

const replayCommand = (command: string): string => `axm ${command.split(".").join(" ")}`;

const interruptionResolution = (
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
      mode: "apply",
      atomicity: { declared: "candidate-atomic", applied: "candidate-atomic" },
      units: [],
      presentation: args.presentation,
      interruption: { signal, disposition: "none" },
      ...observedFootprint,
    });
  }
  const state = journal.value;
  const completedUnits = executedUnits(
    {
      _tag: "ExecutedPlan",
      name: state.name,
      description: state.description,
      jobs: [{ concurrency: 1, steps: state.completed }],
    },
    { restored: state.restoresOnFailure },
  );
  const completedIds = new Set(state.completed.map((step) => unitIdOf(step)));
  const notRun: ReadonlyArray<ResolvedUnit<unknown>> = state.applying
    ? state.plannedUnits
        .filter((unit) => !completedIds.has(unit.id))
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
        }))
    : state.plannedUnits;
  const units = [...completedUnits, ...notRun];
  const committed = completedUnits.filter((unit) => unit.state === "committed");
  const disposition = state.restoresOnFailure
    ? state.applying
      ? "restored"
      : "none"
    : committed.length > 0
      ? "retained"
      : "none";
  const recovery: OperationRecovery | undefined =
    disposition === "retained"
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
      applied: disposition === "retained" ? "non-rollbackable" : "candidate-atomic",
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
        const lifecycle = yield* makeOperationLifecycle;
        const path = yield* Path.Path;
        return yield* restore(
          body.pipe(
            Effect.provideService(OperationJournal, journal),
            Effect.provideService(FootprintRecorder, footprint),
            Effect.provideService(OperationLifecycle, lifecycle),
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
