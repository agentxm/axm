/**
 * Plan-family operation lifecycle wrapper.
 *
 * Owns the two lifecycle facts a handler body cannot own for itself:
 *
 * - **Mutual exclusion.** Apply-mode invocations acquire the workspace
 *   transition lock before the workspace read model is consulted for
 *   mutation, hold it through apply, and release it with the resolution. A
 *   contending invocation waits with a visible reason up to a bound, then
 *   terminates blocked with class `resource-conflict` and a machine-readable
 *   reference to the holder.
 * - **Interruption.** An external termination request resolves through the
 *   normal lifecycle: the body's interruption is converted — from the
 *   operation journal the resolution boundary maintains — into a terminal
 *   resolution with outcome `interrupted`, a contract-valid document, a
 *   stated durable-state disposition, and the signal's exit code.
 */

import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import {
  effectCliExit,
  recordCommandCompletion,
  requestedInterruptionSignal,
  type SuggestedAction,
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
  acquireWorkspaceTransitionLock,
  isWorkspaceTransitionHeldByThisInvocation,
  makeFootprintRecorder,
  readFootprint,
  writeOperationRecoveryRecord,
  type TransitionContention,
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

const holderReference = (contention: TransitionContention): string | undefined =>
  Option.match(contention.holder, {
    onNone: () => undefined,
    onSome: (holder) => `${holder.command} (pid ${holder.pid})`,
  });

const contentionResolution = (
  args: OperationLifecycleArgs,
  contention: TransitionContention,
): OperationResolution => {
  const reference = holderReference(contention);
  const escape: SuggestedAction = {
    description: "Wait for the holding operation to finish, then rerun.",
    cmd: replayCommand(args.command),
  };
  return makeOperationResolution({
    name: args.planName,
    description: Option.none(),
    mode: "apply",
    atomicity: { declared: "candidate-atomic", applied: "candidate-atomic" },
    units: [],
    presentation: args.presentation,
    blocking: {
      class: "resource-conflict",
      subject: args.planName,
      phase: "planning",
      detail: `another operation holds the workspace transition${
        reference === undefined ? "" : ` (${reference})`
      }; waited ${Math.round(contention.waitedMillis / 1000)}s`,
      causeCode: "conflict",
      ...(reference === undefined ? {} : { reference }),
      escape,
    },
    suggestions: [escape],
  });
};

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
          blocksNormalOperation: false,
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
 * Run a plan-family handler body under the operation lifecycle. The body's
 * planning, confirmation, apply, and emit all run while the workspace
 * transition is held (apply mode); interruption resolves through the same
 * emit boundary as every other termination.
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
        const ws = yield* WorkspaceMutations;
        const path = yield* Path.Path;
        const alreadyHeld = isWorkspaceTransitionHeldByThisInvocation(path.resolve(ws.path));
        if (args.mode === "apply" && !alreadyHeld) {
          const renderer = yield* CliRenderer;
          const contention = yield* acquireWorkspaceTransitionLock({
            workspaceDir: ws.path,
            holder: { command: args.command, pid: process.pid },
            onWaiting: (holder) =>
              renderer.step(
                `Waiting: resource-conflict — workspace transition held by ${Option.match(holder, {
                  onNone: () => "another operation",
                  onSome: (value) => `${value.command} (pid ${value.pid})`,
                })}`,
              ),
          });
          if (Option.isSome(contention)) {
            const { exitCode } = yield* emitOperationResolution(
              args.command,
              contentionResolution(args, contention.value),
            );
            yield* recordCommandCompletion(exitCode);
            return yield* Effect.die(effectCliExit(exitCode));
          }
        }
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
                  const resolution = interruptionResolution(args, state, signal, observed);
                  if (
                    resolution.recovery !== undefined &&
                    resolution.recovery.retained.length > 0
                  ) {
                    const ws = yield* WorkspaceMutations;
                    yield* writeOperationRecoveryRecord({
                      workspaceDir: ws.path,
                      kind: "interruption",
                      command: args.command,
                      signal,
                      retained: resolution.recovery.retained,
                      resolveBy: `Re-run ${replayCommand(args.command)} to continue the remaining units.`,
                      ...(resolution.candidateId === undefined
                        ? {}
                        : { candidateId: resolution.candidateId }),
                    });
                  }
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
