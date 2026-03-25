import * as Effect from "effect/Effect";

import { handleError } from "./handle-error.js";
import { withGracefulShutdown } from "./graceful-shutdown.js";
import { resolveFormatFromArgv } from "./resolve-format.js";
import { resolveVerbosityFromArgv } from "../cli-flags/resolve-verbosity.js";
import {
  resolveTerminalCapabilities,
  type TerminalCapabilities,
} from "../cli-renderer/terminal-capabilities.js";
import type { VerbosityLevel } from "../verbosity/verbosity.js";

/**
 * Resolve `--json` from raw argv before Effect runs.
 * Follows the same argv-scanning pattern as `resolveFormatFromArgv`.
 */
export const resolveJsonFromArgv = (args: ReadonlyArray<string>): boolean =>
  args.includes("--json");

export interface CliMainContext {
  readonly verbosityLevel: VerbosityLevel;
  readonly terminalCapabilities: TerminalCapabilities;
  readonly json: boolean;
}

/**
 * Resolve CLI context from argv before Effect runs.
 * These values are passed into `makeFoundationLayer` by callers.
 */
export const resolveCliContext = (args: ReadonlyArray<string>): CliMainContext => ({
  verbosityLevel: resolveVerbosityFromArgv(args),
  terminalCapabilities: resolveTerminalCapabilities(),
  json: resolveJsonFromArgv(args),
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
