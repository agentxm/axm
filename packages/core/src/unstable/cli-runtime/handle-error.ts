import { CliError } from "effect/unstable/cli";
import {
  AppError,
  ExitCode,
  exitCodeFor,
  effectiveSuggestionsFor,
  makeAppError,
  renderAppError,
} from "../app-error/index.js";
import type { OutputFormat } from "./output-mode.js";
import { isEffectCliExit } from "./effect-cli-exit.js";
import { makeJsonErrorEnvelope, makeJsonErrorEnvelopeFromAppError } from "./json-envelope.js";
import { makeErrorEvent, makeSuggestionEvent } from "./output-mode.js";

const writeStderr = (message: string): void => {
  process.stderr.write(message.endsWith("\n") ? message : `${message}\n`);
};

const cliErrorMessage = (errors: ReadonlyArray<{ readonly message?: string }>): string =>
  errors.map((error) => error.message ?? String(error)).join("; ");

/**
 * Classified error result — pure data describing what handleError should do.
 *
 * `stderr` holds the lines to write to stderr in order (human text in text
 * mode; NDJSON event lines in json mode). `stdout` is the final structured
 * document (json mode only). Both are optional — usage/help-only errors emit
 * neither.
 */
export interface ErrorClassification {
  readonly exitCode: number;
  readonly stderr?: ReadonlyArray<string>;
  readonly stdout?: string;
}

/**
 * Channel outputs for a handled `AppError` — the single source of truth for how
 * an AppError appears across surfaces, shared by the outer
 * (`classifyError`/`handleError`) and inner (`writeExpectedCliError`) error
 * paths so the two cannot drift:
 * - text: human-readable `renderAppError` (including its single `Next:`
 *   block) on stderr.
 * - json: NDJSON `suggestion` events followed by the `error` event on stderr
 *   (the live stream, mirroring the success renderer), plus the structured
 *   envelope (which also carries the suggestions) on stdout.
 *
 * Suggestions appear once per channel: the stderr stream and the stdout
 * envelope are distinct surfaces, never a doubled block on the same one.
 */
export const renderAppErrorChannels = (
  error: AppError,
  format: OutputFormat,
  options: { readonly verbose: boolean; readonly debug: boolean } = {
    verbose: false,
    debug: false,
  },
): { readonly stderr: ReadonlyArray<string>; readonly stdout?: string } =>
  format === "text"
    ? { stderr: [renderAppError(error, options)] }
    : {
        stderr: [
          ...effectiveSuggestionsFor(error).map((s) => JSON.stringify(makeSuggestionEvent(s))),
          JSON.stringify(makeErrorEvent(error.code, error.detail)),
        ],
        stdout: JSON.stringify(makeJsonErrorEnvelopeFromAppError(error, options), null, 2) + "\n",
      };

/**
 * Pure error classification — determines exit code and output without side effects.
 *
 * Channel routing per format:
 * - text:        human-readable to stderr only (no stdout pollution)
 * - json:        typed error JSON to stdout + NDJSON error event to stderr
 * Exit codes:
 * - ShowHelp (no errors) → 0 (help successfully displayed)
 * - ShowHelp (with errors) → 2 (usage — help shown due to invocation error)
 * - EffectCliExit → custom exit code
 * - CliError → 2 (usage/validation — bad flags, missing args)
 * - Other → 10 (unexpected internal error)
 */
export const classifyError = (
  error: unknown,
  format: OutputFormat,
  options: { readonly verbose: boolean; readonly debug: boolean } = {
    verbose: false,
    debug: false,
  },
): ErrorClassification => {
  if (isEffectCliExit(error)) {
    return { exitCode: error.exitCode };
  }

  if (error instanceof AppError) {
    return {
      exitCode: exitCodeFor(error.code),
      ...renderAppErrorChannels(error, format, options),
    };
  }

  if (CliError.isCliError(error)) {
    if (error._tag === "ShowHelp") {
      if (error.errors.length === 0) {
        return { exitCode: ExitCode.Success };
      }

      if (format !== "text") {
        const message = cliErrorMessage(error.errors);
        return {
          exitCode: ExitCode.Usage,
          stdout:
            JSON.stringify(
              makeJsonErrorEnvelope({
                code: "usage",
                title: "Usage Error",
                detail: message,
              }),
              null,
              2,
            ) + "\n",
        };
      }

      return { exitCode: ExitCode.Usage };
    }

    if (format !== "text") {
      const message =
        "errors" in error && Array.isArray(error.errors) && error.errors.length > 0
          ? cliErrorMessage(error.errors)
          : error.message;
      return {
        exitCode: ExitCode.Usage,
        stderr: [JSON.stringify(makeErrorEvent("usage", message))],
        stdout:
          JSON.stringify(
            makeJsonErrorEnvelope({
              code: "usage",
              title: "Usage Error",
              detail: message,
            }),
            null,
            2,
          ) + "\n",
      };
    }

    return { exitCode: ExitCode.Usage };
  }

  const message = error instanceof Error ? error.message : String(error);
  const wrapped = makeAppError({
    code: "internal",
    detail: message,
    cause: error,
  });
  return {
    exitCode: ExitCode.Internal,
    ...renderAppErrorChannels(wrapped, format, options),
  };
};

/**
 * Error routing based on output mode.
 *
 * Classifies the error, writes its stderr lines and optional stdout document,
 * and exits.
 */
export const handleError = (error: unknown, format: OutputFormat): never => {
  const { exitCode, stderr, stdout } = classifyError(error, format);

  for (const line of stderr ?? []) {
    writeStderr(line);
  }
  if (stdout !== undefined) {
    process.stdout.write(stdout);
  }

  process.exit(exitCode);
};
