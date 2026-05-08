import { CliError } from "effect/unstable/cli";
import type { OutputFormat } from "./output-mode.js";
import { isEffectCliExit } from "./effect-cli-exit.js";
import { makeJsonErrorEnvelope } from "./json-envelope.js";
import type { ErrorEvent } from "./output-mode.js";

const writeStderr = (message: string): void => {
  process.stderr.write(message.endsWith("\n") ? message : `${message}\n`);
};

/**
 * Classified error result — pure data describing what handleError should do.
 */
export interface ErrorClassification {
  readonly exitCode: number;
  readonly errorEvent?: ErrorEvent;
  readonly output?: {
    readonly channel: "stdout" | "stderr";
    readonly content: string;
  };
  readonly stderrMessage?: string;
}

/**
 * Pure error classification — determines exit code and output without side effects.
 *
 * Channel routing per format:
 * - text:        human-readable to stderr only (no stdout pollution)
 * - json:        typed error JSON to stdout + brief message to stderr
 * Exit codes:
 * - ShowHelp (no errors) → 0 (help successfully displayed)
 * - ShowHelp (with errors) → 1 (help displayed due to usage error)
 * - EffectCliExit → custom exit code
 * - CliError → 2 (usage/validation — bad flags, missing args)
 * - Other → 1 (application/runtime)
 */
export const classifyError = (error: unknown, format: OutputFormat): ErrorClassification => {
  if (isEffectCliExit(error)) {
    return { exitCode: error.exitCode };
  }

  if (CliError.isCliError(error)) {
    if (error._tag === "ShowHelp") {
      return { exitCode: error.errors.length > 0 ? 1 : 0 };
    }

    if (format !== "text") {
      const message =
        "errors" in error && Array.isArray(error.errors) && error.errors.length > 0
          ? error.errors.map((e: { message?: string }) => e.message ?? String(e)).join("; ")
          : error.message;
      return {
        exitCode: 2,
        errorEvent: {
          type: "error",
          code: "USAGE_ERROR",
          message,
          exitCode: 2,
        },
        output: {
          channel: "stdout",
          content:
            JSON.stringify(
              makeJsonErrorEnvelope({
                code: "USAGE_ERROR",
                message,
                exitCode: 2,
              }),
              null,
              2,
            ) + "\n",
        },
      };
    }

    return { exitCode: 2 };
  }

  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && "code" in error ? String(error.code) : "UNKNOWN_ERROR";

  if (format === "text") {
    return {
      exitCode: 1,
      output: { channel: "stderr", content: `\u2717 ${message}` },
    };
  }

  return {
    exitCode: 1,
    errorEvent: {
      type: "error",
      code,
      message,
      exitCode: 1,
    },
    output: {
      channel: "stdout",
      content:
        JSON.stringify(
          makeJsonErrorEnvelope({
            code,
            message,
            exitCode: 1,
          }),
          null,
          2,
        ) + "\n",
    },
    stderrMessage: `\u2717 ${message}`,
  };
};

/**
 * Error routing based on output mode.
 *
 * Classifies the error, writes output to the appropriate channel, and exits.
 */
export const handleError = (error: unknown, format: OutputFormat): never => {
  const result = classifyError(error, format);

  if (result.output) {
    if (result.output.channel === "stdout") {
      if (format !== "text" && result.errorEvent !== undefined) {
        writeStderr(JSON.stringify(result.errorEvent));
      }
      process.stdout.write(result.output.content);
      if (result.stderrMessage) {
        writeStderr(result.stderrMessage);
      }
    } else {
      writeStderr(result.output.content);
    }
  }

  process.exit(result.exitCode);
};
