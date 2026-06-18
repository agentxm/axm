import type { VerbosityLevel } from "./verbosity.js";

/**
 * Scans raw argv right-to-left to determine verbosity level.
 * Last flag wins — allows users to override earlier flags.
 */
export const resolveVerbosityFromArgv = (argv: ReadonlyArray<string>): VerbosityLevel => {
  for (let i = argv.length - 1; i >= 0; i--) {
    const arg = argv[i];
    if (arg === "--debug" || arg === "-vv") return "debug";
    if (arg === "--verbose") return "verbose";
    if (arg === "--quiet" || arg === "-q") return "quiet";
  }
  return "normal";
};
