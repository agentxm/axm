// @effect-diagnostics nodeBuiltinImport:off — signal exits must bypass buffered process streams synchronously
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Cause from "effect/Cause";
import * as Fiber from "effect/Fiber";
import { writeSync } from "node:fs";

import { isEffectCliExit } from "./effect-cli-exit.js";
import { recordInterruptionSignal } from "./interruption.js";
import { interruptionFallback } from "../screen/index.js";

const resolvedItself = (exit: Exit.Exit<unknown, unknown> | undefined): boolean => {
  if (exit === undefined) return false;
  if (Exit.isSuccess(exit)) return true;
  return isEffectCliExit(Cause.squash(exit.cause));
};

const fallbackTermination = (exitCode: number, signal: "SIGINT" | "SIGTERM"): void => {
  const json = process.argv.includes("--json");
  writeSync(2, interruptionFallback(signal, json));
  void process.exit(exitCode);
};

/**
 * The per-signal shutdown decision, isolated from process wiring for direct
 * tests.
 *
 * The first signal interrupts the running fiber and waits for its finalizers
 * to finish — restoration, lock release, and settlement recording take the
 * time they take, and truncating them is what loses workspaces. A fiber whose
 * operation boundary converts the interruption into its own terminal
 * resolution completes itself (document, exit code, and disposition all flow
 * through the normal pipeline); only a fiber that ends interrupted without
 * resolving falls back to the minimal termination notice. A second signal is
 * the user's insistence: it forces the termination notice and process exit
 * without waiting for finalizers.
 *
 * @internal Exported for direct tests; not part of the module's public
 * surface.
 */
export const makeSignalShutdown = <A, E>(args: {
  readonly fiber: Fiber.Fiber<A, E>;
  readonly runFork: (effect: Effect.Effect<void>) => unknown;
  readonly terminate?: (exitCode: number, signal: "SIGINT" | "SIGTERM") => void;
}): ((exitCode: number, signal: "SIGINT" | "SIGTERM") => void) => {
  const terminate = args.terminate ?? fallbackTermination;
  let shuttingDown = false;
  return (exitCode, signal) => {
    if (shuttingDown) {
      // Second signal: force abort without waiting for finalizers.
      terminate(exitCode, signal);
      return;
    }
    shuttingDown = true;
    recordInterruptionSignal(signal);
    args.runFork(
      Fiber.interrupt(args.fiber).pipe(
        Effect.andThen(
          Effect.sync(() => {
            // A fiber that terminated itself (an operation boundary resolved
            // the interruption, or the program finished first) owns its own
            // output and exit; write nothing over it.
            if (resolvedItself(args.fiber.pollUnsafe())) return;
            terminate(exitCode, signal);
          }),
        ),
      ),
    );
  };
};

/**
 * Wrap a program in signal-aware graceful shutdown.
 *
 * SIGTERM/SIGINT → record the signal and interrupt the running fiber, letting
 * finalizers finish; a second signal forces abort. Exit codes follow POSIX
 * convention (128 + signum): SIGINT=130, SIGTERM=143. Uses Effect.forkChild
 * (supervised) so the fiber dies with parent.
 */
export const withGracefulShutdown = <A, E, R>(
  program: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const services = yield* Effect.context<R>();
    const fiber = yield* Effect.forkChild(program);
    // eslint-disable-next-line no-restricted-syntax -- Signal callbacks are a sanctioned process-entry adapter.
    const runFork = Effect.runForkWith(services);
    const onSignal = makeSignalShutdown({ fiber, runFork });

    const onSigterm = () => onSignal(143, "SIGTERM");
    const onSigint = () => onSignal(130, "SIGINT");
    process.on("SIGTERM", onSigterm);
    process.on("SIGINT", onSigint);

    return yield* Fiber.join(fiber).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          process.off("SIGTERM", onSigterm);
          process.off("SIGINT", onSigint);
        }),
      ),
    );
  });
