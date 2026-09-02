// @effect-diagnostics anyUnknownInErrorContext:off — the sanctioned process entry accepts and renders unknown defects
import * as Effect from "effect/Effect";

import { handleError } from "./handle-error.js";
import { withGracefulShutdown } from "./graceful-shutdown.js";
import { resolveFormatFromArgv } from "./resolve-format.js";
import { resolveVerbosityFromArgv } from "../cli-flags/resolve-verbosity.js";
import type { VerbosityLevel } from "../cli-flags/verbosity.js";

export interface CliMainContext {
  readonly verbosityLevel: VerbosityLevel;
}

/** Resolve CLI context from argv before Effect runs. */
export const resolveCliContext = (args: ReadonlyArray<string>): CliMainContext => ({
  verbosityLevel: resolveVerbosityFromArgv(args),
});

/**
 * Run one CLI invocation. Runtime output is owned by Screen; this process
 * adapter only selects the fallback Screen used when bootstrap itself fails.
 */
export const runCliMain = async (
  execute: (args: ReadonlyArray<string>) => Effect.Effect<void, unknown, never>,
  options?: { readonly args?: ReadonlyArray<string> | undefined },
): Promise<void> => {
  const args = options?.args ?? process.argv.slice(2);
  const format = resolveFormatFromArgv(args);

  try {
    // eslint-disable-next-line no-restricted-syntax -- runCliMain is the sanctioned CLI process-entry adapter.
    await Effect.runPromise(withGracefulShutdown(execute(args)));
  } catch (error) {
    // eslint-disable-next-line no-restricted-syntax -- runCliMain is the sanctioned CLI process-entry adapter.
    await Effect.runPromise(handleError(error, format));
  }
};
