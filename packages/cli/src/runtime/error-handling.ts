import { type CliError, renderCliError } from "../cli-error/index.js";
import type { PromptCancelled } from "../tui/index.js";

export interface DiagnosticVerbosity {
  readonly verbose: boolean;
  readonly debug: boolean;
}

type ErrorClassification =
  | { readonly exitCode: 0 }
  | { readonly exitCode: 1; readonly message: string };

export const resolveDiagnosticVerbosity = (
  argv: ReadonlyArray<string> = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): DiagnosticVerbosity => {
  const hasVerboseFlag = argv.includes("--verbose") || argv.includes("-v");
  const hasDebugFlag = argv.includes("--debug");
  const envVerbose = env["AXM_VERBOSE"] === "1" || env["AXM_VERBOSE"] === "true";
  const envDebug = env["AXM_DEBUG"] === "1" || env["AXM_DEBUG"] === "true";
  const debug = hasDebugFlag || envDebug;
  const verbose = hasVerboseFlag || envVerbose || debug;
  return { verbose, debug };
};

export const classifyError = (
  error: CliError | PromptCancelled,
  verbosity: DiagnosticVerbosity = resolveDiagnosticVerbosity(),
): ErrorClassification => {
  switch (error._tag) {
    case "PromptCancelled":
      return { exitCode: 0 };
    case "CliError":
      return { exitCode: 1, message: renderCliError(error, verbosity) };
  }
};
