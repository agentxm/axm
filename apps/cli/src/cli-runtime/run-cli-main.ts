// @effect-diagnostics anyUnknownInErrorContext:off — the sanctioned process entry accepts and renders unknown defects
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";

import { handleError } from "./handle-error.js";
import { isProcessOutcome, isProcessFailure } from "./process-outcome.js";
import { withGracefulShutdown } from "./graceful-shutdown.js";
import { resolveVerbosityFromArgv } from "../cli-flags/resolve-verbosity.js";
import { resolveFormatFromArgv } from "./resolve-format.js";
import { withLocalTracing } from "./local-tracing.js";
import { annotateInvocationTrace } from "./trace-invocation.js";
import { appErrorCodeForExit } from "../app-error/index.js";

/**
 * Run one CLI invocation. Runtime output is owned by Screen; this process
 * adapter only selects the fallback Screen used when bootstrap itself fails.
 */
export const runCliMain = async (
  execute: (args: ReadonlyArray<string>) => Effect.Effect<unknown, unknown, never>,
  options?: {
    readonly args?: ReadonlyArray<string> | undefined;
    readonly traceCommandRoutes?: ReadonlyArray<string>;
    readonly version?: string;
  },
): Promise<void> => {
  const args = options?.args ?? process.argv.slice(2);
  const format = resolveFormatFromArgv(args);
  const verbosity = resolveVerbosityFromArgv(args);
  const detail = { verbose: verbosity === "verbose", debug: verbosity === "debug" };
  const invocation = Effect.gen(function* () {
    // Bootstrap failures precede command parsing and have no accepted route/mode.
    yield* annotateInvocationTrace({
      "axm.command.route": "unresolved",
      "axm.operation.mode": "unresolved",
    });
    const executed = yield* Effect.exit(
      Effect.suspend(() => execute(args)).pipe(
        Effect.withSpan("axm.cli.execution", {}, { captureStackTrace: false }),
      ),
    );
    if (Exit.isFailure(executed) && Cause.hasInterruptsOnly(executed.cause))
      return yield* Effect.failCause(executed.cause);
    const result = Exit.isSuccess(executed) ? executed.value : undefined;
    let exitCode = isProcessOutcome(result) ? result.exitCode : 0;
    const terminate = Exit.isFailure(executed) || isProcessFailure(result);
    if (Exit.isFailure(executed)) {
      exitCode = yield* handleError(Cause.squash(executed.cause), format, detail).pipe(
        Effect.withSpan("axm.cli.error-render", {}, { captureStackTrace: false }),
      );
    } else if (isProcessFailure(result)) {
      exitCode = yield* handleError(result.error, format, {
        ...detail,
        ...(result.diagnosticId === undefined ? {} : { diagnosticId: result.diagnosticId }),
        ...(result.diagnostic === undefined ? {} : { diagnostic: result.diagnostic }),
      }).pipe(Effect.withSpan("axm.cli.error-render", {}, { captureStackTrace: false }));
    }
    const category = appErrorCodeForExit(exitCode);
    yield* annotateInvocationTrace({
      "axm.exit.code": exitCode,
      "axm.outcome": exitCode === 0 ? "success" : "failure",
      ...(category === undefined
        ? {}
        : {
            "axm.failure.category": category,
            "axm.failure.kind":
              Exit.isFailure(executed) && Cause.hasDies(executed.cause)
                ? "defect"
                : category === "conflict"
                  ? "conflict"
                  : category === "timeout"
                    ? "timeout"
                    : category === "forbidden" || category === "auth_denied"
                      ? "denied"
                      : category === "not_found"
                        ? "not-found"
                        : "failure",
          }),
    });
    return { exitCode, terminate };
  });
  // eslint-disable-next-line no-restricted-syntax -- The sanctioned process entry owns this runtime.
  const outcome = await Effect.runPromise(
    withGracefulShutdown(
      // eslint-disable-next-line no-restricted-properties -- Explicit process-owned diagnostic activation.
      withLocalTracing(invocation, process.env, {
        commandRoutes: options?.traceCommandRoutes,
        version: options?.version,
      }),
    ),
  );
  if (outcome.exitCode !== 0 || ("terminate" in outcome && outcome.terminate)) {
    process.exit(outcome.exitCode);
  }
};
