// @effect-diagnostics nodeBuiltinImport:off — signal exits must bypass buffered process streams synchronously
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { writeSync } from "node:fs";

/**
 * Wrap a program in signal-aware graceful shutdown.
 *
 * SIGTERM/SIGINT → interrupt the running fiber with a 5s timeout.
 * Exit code follows POSIX convention (128 + signum): SIGINT=130, SIGTERM=143.
 * Uses Effect.forkChild (supervised) so the fiber dies with parent.
 */
export const withGracefulShutdown = <A, E, R>(
  program: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const services = yield* Effect.context<R>();
    const fiber = yield* Effect.forkChild(program);
    const runFork = Effect.runForkWith(services);
    let shuttingDown = false;

    const interruptAndExit = (exitCode: number, signal: "SIGINT" | "SIGTERM") => {
      if (shuttingDown) return;
      shuttingDown = true;
      runFork(
        Fiber.interrupt(fiber).pipe(
          Effect.timeout("5 seconds"),
          Effect.ensuring(
            Effect.sync(() => {
              const json = process.argv.includes("--json");
              writeSync(
                2,
                json
                  ? `${JSON.stringify({ type: "error", code: "interrupted", reason: "interrupted", signal })}\n`
                  : `Cancelled by ${signal}.\n`,
              );
              if (json) {
                writeSync(
                  1,
                  `${JSON.stringify(
                    {
                      ok: false,
                      result: { outcome: "failed", reason: "interrupted", signal },
                    },
                    undefined,
                    2,
                  )}\n`,
                );
              }
              void process.exit(exitCode);
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
