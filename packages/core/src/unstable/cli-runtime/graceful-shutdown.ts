// @effect-diagnostics nodeBuiltinImport:off — signal exits must bypass buffered process streams synchronously
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Cause from "effect/Cause";
import * as Fiber from "effect/Fiber";
import { writeSync } from "node:fs";

import { isEffectCliExit } from "./effect-cli-exit.js";
import { recordInterruptionSignal } from "./interruption.js";

/**
 * Wrap a program in signal-aware graceful shutdown.
 *
 * SIGTERM/SIGINT → record the signal and interrupt the running fiber with a
 * 5s bound. An operation boundary that converts the interruption into its own
 * terminal resolution completes the fiber itself (document, exit code, and
 * disposition all flow through the normal pipeline); only a fiber that ends
 * interrupted without resolving falls back to the minimal termination notice
 * here. Exit codes follow POSIX convention (128 + signum): SIGINT=130,
 * SIGTERM=143. Uses Effect.forkChild (supervised) so the fiber dies with
 * parent.
 */
export const withGracefulShutdown = <A, E, R>(
  program: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const services = yield* Effect.context<R>();
    const fiber = yield* Effect.forkChild(program);
    // eslint-disable-next-line no-restricted-syntax -- Signal callbacks are a sanctioned process-entry adapter.
    const runFork = Effect.runForkWith(services);
    let shuttingDown = false;

    const resolvedItself = (exit: Exit.Exit<unknown, unknown> | undefined): boolean => {
      if (exit === undefined) return false;
      if (Exit.isSuccess(exit)) return true;
      return isEffectCliExit(Cause.squash(exit.cause));
    };

    const fallbackTermination = (exitCode: number, signal: "SIGINT" | "SIGTERM"): void => {
      const json = process.argv.includes("--json");
      writeSync(
        2,
        json
          ? `${JSON.stringify({ type: "error", code: "interrupted", message: `Cancelled by ${signal}.`, reason: "interrupted", signal })}\n`
          : `Cancelled by ${signal}.\n`,
      );
      void process.exit(exitCode);
    };

    const interruptAndExit = (exitCode: number, signal: "SIGINT" | "SIGTERM") => {
      if (shuttingDown) return;
      shuttingDown = true;
      recordInterruptionSignal(signal);
      runFork(
        Fiber.interrupt(fiber).pipe(
          Effect.timeout("5 seconds"),
          Effect.ignore,
          Effect.andThen(
            Effect.sync(() => {
              // A fiber that terminated itself (an operation boundary resolved
              // the interruption, or the program finished first) owns its own
              // output and exit; write nothing over it.
              if (resolvedItself(fiber.pollUnsafe())) return;
              fallbackTermination(exitCode, signal);
            }),
          ),
        ),
      );
    };

    const onSigterm = () => interruptAndExit(143, "SIGTERM");
    const onSigint = () => interruptAndExit(130, "SIGINT");
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
