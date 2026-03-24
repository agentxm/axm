import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";

/**
 * Wrap a program in signal-aware graceful shutdown.
 *
 * SIGTERM/SIGINT → interrupt the running fiber with a 5s timeout.
 * Exit code 130 = POSIX convention for "terminated by signal" (128 + 2).
 * Uses Effect.forkChild (supervised) so the fiber dies with parent.
 */
export const withGracefulShutdown = <A, E, R>(
  program: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(program);

    const interruptAndExit = (exitCode: number) => {
      Effect.runFork(
        Fiber.interrupt(fiber).pipe(
          Effect.timeout("5 seconds"),
          Effect.ensuring(Effect.sync(() => process.exit(exitCode))),
        ),
      );
    };

    const onSigterm = () => interruptAndExit(130);
    const onSigint = () => interruptAndExit(130);
    process.on("SIGTERM", onSigterm);
    process.on("SIGINT", onSigint);

    const result = yield* Fiber.join(fiber);

    process.off("SIGTERM", onSigterm);
    process.off("SIGINT", onSigint);

    return result;
  });
