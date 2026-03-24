import { CliError } from "effect/unstable/cli";
import type { OutputFormat } from "../output-format.js";
import { isEffectCliExit } from "./effect-cli-exit.js";

/**
 * Three-channel error routing based on output format.
 *
 * Channel routing per format:
 * - text:        human-readable to stderr only (no stdout pollution)
 * - json:        typed error JSON to stdout + brief message to stderr
 * - stream-json: error event in NDJSON stream + brief message to stderr
 *
 * Exit codes:
 * - EffectCliExit → custom exit code (e.g., 1 for help display)
 * - CliError → 2 (usage/validation — bad flags, missing args)
 * - Other → 1 (application/runtime)
 */
export const handleError = (error: unknown, format: OutputFormat): never => {
  if (isEffectCliExit(error)) {
    process.exit(error.exitCode);
  }

  if (CliError.isCliError(error)) {
    if (format !== "text") {
      // Extract human-readable messages from structured CliError errors
      const message =
        "errors" in error && Array.isArray(error.errors) && error.errors.length > 0
          ? error.errors.map((e: { message?: string }) => e.message ?? String(e)).join("; ")
          : error.message;
      const errorObj = { type: "error", code: "USAGE_ERROR", message };
      process.stdout.write(JSON.stringify(errorObj) + "\n");
    }
    process.exit(2);
  }

  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && "code" in error ? String(error.code) : "UNKNOWN_ERROR";

  if (format === "text") {
    console.error(`\u2717 ${message}`);
  } else {
    const errorObj = { type: "error", code, message };
    process.stdout.write(JSON.stringify(errorObj) + "\n");
    console.error(`\u2717 ${message}`);
  }

  process.exit(1);
};
