import * as Effect from "effect/Effect";

import { handleError } from "./handle-error.js";
import { withGracefulShutdown } from "./graceful-shutdown.js";
import { resolveFormatFromArgv } from "./resolve-format.js";
import { resolveVerbosityFromArgv } from "../cli-flags/resolve-verbosity.js";
import type { VerbosityLevel } from "../verbosity/verbosity.js";

export interface CliMainContext {
  readonly verbosityLevel: VerbosityLevel;
}

/**
 * Resolve CLI context from argv before Effect runs.
 * These values are passed into `makeFoundationLayer` by callers.
 */
export const resolveCliContext = (args: ReadonlyArray<string>): CliMainContext => ({
  verbosityLevel: resolveVerbosityFromArgv(args),
});

export const runCliMain = async (
  execute: (args: ReadonlyArray<string>) => Effect.Effect<void, unknown, never>,
  options?: {
    readonly args?: ReadonlyArray<string> | undefined;
  },
): Promise<void> => {
  const args = options?.args ?? process.argv.slice(2);
  const format = resolveFormatFromArgv(args);

  try {
    await Effect.runPromise(withGracefulShutdown(execute(args)));
  } catch (error) {
    handleError(error, format);
  }
};
