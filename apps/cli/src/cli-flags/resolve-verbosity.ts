import type { VerbosityLevel } from "./verbosity.js";

/**
 * Quiet always wins over diagnostic verbosity so mixed flag combinations
 * cannot leak verbose diagnostics.
 */
export const resolveVerbosityFromArgv = (argv: ReadonlyArray<string>): VerbosityLevel => {
  if (argv.includes("--quiet") || argv.includes("-q")) return "quiet";
  for (let i = argv.length - 1; i >= 0; i--) {
    const arg = argv[i];
    if (arg === "--debug") return "debug";
    if (arg === "--verbose" || arg === "-v") return "verbose";
  }
  return "normal";
};

/**
 * Whether a diagnostic environment request is enabled. Only the exact values
 * `1` and `true` enable one; every other value, including `TRUE`, `yes`, `0`
 * and the empty string, leaves the request off.
 */
export const isEnabledEnvRequest = (value: string | undefined): boolean =>
  value === "1" || value === "true";

/** The diagnostic detail a run asks for, across flags and the environment. */
export interface DiagnosticRequest {
  readonly flagQuiet: boolean;
  readonly flagDebug: boolean;
  readonly flagVerbose: boolean;
  readonly envDebug: boolean;
  readonly envVerbose: boolean;
}

/**
 * The detail level a diagnostic request selects: quiet before debug before
 * verbose before ordinary detail, with a flag and its environment request
 * carrying the same weight.
 */
export const resolveVerbosityLevel = (request: DiagnosticRequest): VerbosityLevel =>
  request.flagQuiet
    ? "quiet"
    : request.flagDebug || request.envDebug
      ? "debug"
      : request.flagVerbose || request.envVerbose
        ? "verbose"
        : "normal";
