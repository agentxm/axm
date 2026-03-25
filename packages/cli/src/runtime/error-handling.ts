import { type AppError, renderAppError } from "@axm.sh/core/unstable/app-error";
import type { PromptCancelled } from "@axm.sh/core/unstable/prompt-cancelled";

export interface DiagnosticVerbosity {
  readonly verbose: boolean;
  readonly debug: boolean;
}

type ErrorClassification =
  | { readonly exitCode: 0 }
  | { readonly exitCode: 1; readonly message: string };

export interface VerbosityEnvValues {
  readonly AXM_VERBOSE?: string | undefined;
  readonly AXM_DEBUG?: string | undefined;
}

export const resolveDiagnosticVerbosity = (
  argv: ReadonlyArray<string> = process.argv,
  env: VerbosityEnvValues = {},
): DiagnosticVerbosity => {
  const hasVerboseFlag = argv.includes("--verbose") || argv.includes("-v");
  const hasDebugFlag = argv.includes("--debug");
  const envVerbose = env.AXM_VERBOSE === "1" || env.AXM_VERBOSE === "true";
  const envDebug = env.AXM_DEBUG === "1" || env.AXM_DEBUG === "true";
  const debug = hasDebugFlag || envDebug;
  const verbose = hasVerboseFlag || envVerbose || debug;
  return { verbose, debug };
};

export const classifyError = (
  error: AppError | PromptCancelled,
  verbosity: DiagnosticVerbosity = resolveDiagnosticVerbosity(),
): ErrorClassification => {
  switch (error._tag) {
    case "PromptCancelled":
      return { exitCode: 0 };
    case "AppError":
      return { exitCode: 1, message: renderAppError(error, verbosity) };
  }
};
