/**
 * Plan<StepRequirements>-family operation lifecycle wrapper.
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
  getOperationJournal,
  makeOperationJournal,
  makeOperationLifecycle,
  resolveInterruption,
  type AtomicityClass,
  type OperationMode,
  type OperationPresentation,
  type SettledOutcome,
} from "@agentxm/workspace-operations";
import { Screen } from "../../screen/index.js";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import {
  FootprintRecorder,
  makeFootprintRecorder,
  readFootprint,
} from "@agentxm/workspace-transactions";

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
                  const resolution = resolveInterruption(
                    {
                      planName: args.planName,
                      mode: args.mode,
                      ...(args.declaredAtomicity === undefined
                        ? {}
                        : { declaredAtomicity: args.declaredAtomicity }),
                      ...(args.presentation === undefined
                        ? {}
                        : { presentation: args.presentation }),
                      replayCommand: replayCommand(args.command),
                    },
                    state,
                    signal,
                    observed,
                  );
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
