// @effect-diagnostics anyUnknownInErrorContext:off — the sanctioned process entry accepts and renders unknown defects
import * as Effect from "effect/Effect";

import { handleError } from "./handle-error.js";
import { isProcessOutcome, isProcessFailure } from "./process-outcome.js";
import { withGracefulShutdown } from "./graceful-shutdown.js";
import { resolveFormatFromArgv } from "./resolve-format.js";

/**
 * Run one CLI invocation. Runtime output is owned by Screen; this process
 * adapter only selects the fallback Screen used when bootstrap itself fails.
 */
export const runCliMain = async (
  execute: (args: ReadonlyArray<string>) => Effect.Effect<unknown, unknown, never>,
  options?: { readonly args?: ReadonlyArray<string> | undefined },
): Promise<void> => {
  const args = options?.args ?? process.argv.slice(2);
  const format = resolveFormatFromArgv(args);
  let outcome: unknown;

  try {
    // eslint-disable-next-line no-restricted-syntax -- runCliMain is the sanctioned CLI process-entry adapter.
    outcome = await Effect.runPromise(withGracefulShutdown(execute(args)));
  } catch (error) {
    // eslint-disable-next-line no-restricted-syntax -- runCliMain is the sanctioned CLI process-entry adapter.
    await Effect.runPromise(handleError(error, format));
  }
  if (isProcessFailure(outcome)) {
    // eslint-disable-next-line no-restricted-syntax -- The process adapter renders after invocation finalizers drain.
    await Effect.runPromise(
      handleError(outcome.error, format, {
        ...(outcome.diagnosticId === undefined ? {} : { diagnosticId: outcome.diagnosticId }),
        ...(outcome.diagnostic === undefined ? {} : { diagnostic: outcome.diagnostic }),
      }),
    );
  }
  if (isProcessOutcome(outcome) && outcome.exitCode !== 0) {
    process.exit(outcome.exitCode);
  }
};
