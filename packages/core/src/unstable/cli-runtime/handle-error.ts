import { CliError } from "effect/unstable/cli";
import { AppError, ExitCode, exitCodeFor, renderAppError } from "../app-error/index.js";
import type { OutputFormat } from "./output-mode.js";
import { isEffectCliExit } from "./effect-cli-exit.js";
import { makeJsonErrorEnvelope, makeJsonErrorEnvelopeFromAppError } from "./json-envelope.js";
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
 * - ShowHelp (with errors) → 2 (usage — help shown due to invocation error)
 * - EffectCliExit → custom exit code
 * - CliError → 2 (usage/validation — bad flags, missing args)
 * - Other → 10 (unexpected internal error)
 */
export const classifyError = (error: unknown, format: OutputFormat): ErrorClassification => {
  if (isEffectCliExit(error)) {
    return { exitCode: error.exitCode };
  }

  if (error instanceof AppError) {
    const exitCode = exitCodeFor(error.code);

    if (format === "text") {
      return {
        exitCode,
        output: { channel: "stderr", content: renderAppError(error) },
      };
    }

    return {
      exitCode,
      errorEvent: {
        type: "error",
        code: error.code,
        message: error.message,
      },
      output: {
        channel: "stdout",
        content: JSON.stringify(makeJsonErrorEnvelopeFromAppError(error), null, 2) + "\n",
      },
      stderrMessage: `\u2717 ${error.message}`,
    };
  }

  if (CliError.isCliError(error)) {
    if (error._tag === "ShowHelp") {
      return { exitCode: error.errors.length > 0 ? ExitCode.Usage : ExitCode.Success };
    }

    if (format !== "text") {
      const message =
        "errors" in error && Array.isArray(error.errors) && error.errors.length > 0
          ? error.errors.map((e: { message?: string }) => e.message ?? String(e)).join("; ")
          : error.message;
      return {
        exitCode: ExitCode.Usage,
        errorEvent: {
          type: "error",
          code: "usage",
          message,
        },
        output: {
          channel: "stdout",
          content:
            JSON.stringify(
              makeJsonErrorEnvelope({
                code: "usage",
                message,
              }),
              null,
              2,
            ) + "\n",
        },
      };
    }

    return { exitCode: ExitCode.Usage };
  }

  const message = error instanceof Error ? error.message : String(error);
  const code = "internal";

  if (format === "text") {
    return {
      exitCode: ExitCode.Internal,
      output: { channel: "stderr", content: `\u2717 ${message}` },
    };
  }

  return {
    exitCode: ExitCode.Internal,
    errorEvent: {
      type: "error",
      code,
      message,
    },
    output: {
      channel: "stdout",
      content:
        JSON.stringify(
          makeJsonErrorEnvelope({
            code,
            message,
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
