import type { VerbosityLevel } from "./verbosity.js";

/**
 * Quiet always wins over diagnostic verbosity so mixed flag combinations
 * cannot leak verbose diagnostics.
 */
export const resolveVerbosityFromArgv = (argv: ReadonlyArray<string>): VerbosityLevel => {
  if (argv.includes("--quiet") || argv.includes("-q")) return "quiet";
  for (let i = argv.length - 1; i >= 0; i--) {
    const arg = argv[i];
    if (arg === "--debug" || arg === "-vv") return "debug";
    if (arg === "--verbose") return "verbose";
  }
  return "normal";
};
