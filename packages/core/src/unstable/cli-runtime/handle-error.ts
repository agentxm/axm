import { CliError } from "effect/unstable/cli";
import type { OutputFormat } from "./output-mode.js";
import { isEffectCliExit } from "./effect-cli-exit.js";
import { makeJsonErrorEnvelope } from "./json-envelope.js";

/**
 * Error routing based on output mode.
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
export const handleError = (error: unknown, format: OutputFormat): never => {
  if (isEffectCliExit(error)) {
    process.exit(error.exitCode);
  }

  if (CliError.isCliError(error)) {
    // ShowHelp is control flow, not an error.
    // The framework already printed help output before this point.
    // Exit 0 for clean help, 1 if help was triggered by validation errors.
    if (error._tag === "ShowHelp") {
      process.exit(error.errors.length > 0 ? 1 : 0);
    }

    if (format !== "text") {
      // Extract human-readable messages from structured CliError errors
      const message =
        "errors" in error && Array.isArray(error.errors) && error.errors.length > 0
          ? error.errors.map((e: { message?: string }) => e.message ?? String(e)).join("; ")
          : error.message;
      process.stdout.write(
        JSON.stringify(
          makeJsonErrorEnvelope({
            code: "USAGE_ERROR",
            message,
            exitCode: 2,
          }),
          null,
          2,
        ) + "\n",
      );
    }
    process.exit(2);
  }

  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && "code" in error ? String(error.code) : "UNKNOWN_ERROR";

  if (format === "text") {
    console.error(`\u2717 ${message}`);
  } else {
    process.stdout.write(
      JSON.stringify(
        makeJsonErrorEnvelope({
          code,
          message,
          exitCode: 1,
        }),
        null,
        2,
      ) + "\n",
    );
    console.error(`\u2717 ${message}`);
  }

  process.exit(1);
};
