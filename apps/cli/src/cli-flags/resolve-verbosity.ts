import * as Option from "effect/Option";
import { booleanOptionFromArgv } from "./argv-boolean.js";
import type { VerbosityLevel } from "./verbosity.js";

/**
 * Quiet always wins over diagnostic verbosity so mixed flag combinations
 * cannot leak verbose diagnostics.
 */
export const resolveVerbosityFromArgv = (argv: ReadonlyArray<string>): VerbosityLevel => {
  if (Option.getOrElse(booleanOptionFromArgv(argv, ["--quiet", "-q"]), () => false)) return "quiet";
  if (Option.getOrElse(booleanOptionFromArgv(argv, ["--debug"]), () => false)) return "debug";
  if (Option.getOrElse(booleanOptionFromArgv(argv, ["--verbose", "-v"]), () => false))
    return "verbose";
  return "normal";
};

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
