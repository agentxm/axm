import * as Option from "effect/Option";
import type { CliError } from "./cli-error.js";

export interface RenderCliErrorOptions {
  readonly verbose: boolean;
  readonly debug: boolean;
}

const defaultRenderCliErrorOptions: RenderCliErrorOptions = {
  verbose: false,
  debug: false,
};

const isCliError = (cause: unknown): cause is CliError =>
  typeof cause === "object" &&
  cause !== null &&
  "_tag" in cause &&
  cause._tag === "CliError" &&
  "what" in cause &&
  "code" in cause;

const formatCause = (cause: unknown, options: RenderCliErrorOptions): ReadonlyArray<string> => {
  if (cause === undefined || cause === null) return [];

  if (isCliError(cause)) {
    const lines = [`Cause: ${cause.what} (${cause.code})`];
    if (options.debug) {
      for (const detail of cause.details) {
        lines.push(`Cause detail: ${detail}`);
      }
    }
    return lines;
  }

  if (cause instanceof Error) {
    const lines = [`Cause: ${cause.message}`];
    if (options.debug && cause.stack) {
      lines.push(...cause.stack.split("\n").map((line) => `Stack: ${line}`));
    }
    return lines;
  }

  if (typeof cause === "string" || typeof cause === "number" || typeof cause === "boolean") {
    return [`Cause: ${String(cause)}`];
  }

  if (!options.debug) {
    return ["Cause: non-error object (re-run with --debug for full details)"];
  }

  try {
    return [`Cause: ${JSON.stringify(cause)}`];
  } catch {
    return ["Cause: [unserializable object]"];
  }
};

export const renderCliError = (
  error: CliError,
  options: RenderCliErrorOptions = defaultRenderCliErrorOptions,
): string => {
  const lines: Array<string> = [];

  lines.push(`\u2717 ${error.what} (${error.code})`);

  for (const detail of error.details) {
    lines.push(`  ${detail}`);
  }

  if (Option.isSome(error.howToFix)) {
    lines.push(`  ${error.howToFix.value}`);
  }

  if (options.verbose || options.debug) {
    for (const line of formatCause(error.cause, options)) {
      lines.push(`  ${line}`);
    }
  }

  return lines.join("\n");
};

export const renderDefect = (error: unknown): string => {
  const lines: Array<string> = [];

  lines.push("\u2717 An unexpected error occurred");
  lines.push("  This is a bug. Please report it at https://github.com/agentxm/axm/issues");

  if (error instanceof Error) {
    lines.push(`  ${error.message}`);
  } else if (typeof error === "string") {
    lines.push(`  ${error}`);
  }

  return lines.join("\n");
};
