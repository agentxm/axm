import type { AppError } from "./app-error.js";

const defaultRenderOptions: { readonly verbose: boolean; readonly debug: boolean } = {
  verbose: false,
  debug: false,
};

const isAppError = (cause: unknown): cause is AppError =>
  typeof cause === "object" &&
  cause !== null &&
  "_tag" in cause &&
  cause._tag === "AppError" &&
  "what" in cause &&
  "code" in cause;

const formatCause = (
  cause: unknown,
  options: { readonly verbose: boolean; readonly debug: boolean },
): ReadonlyArray<string> => {
  if (cause === undefined || cause === null) return [];

  if (isAppError(cause)) {
    const causeHeadline = `${cause.what} (${cause.code})`;
    return [`Cause: ${causeHeadline}`];
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

export const renderAppError = (
  error: AppError,
  options: { readonly verbose: boolean; readonly debug: boolean } = defaultRenderOptions,
): string => {
  const lines: Array<string> = [];

  lines.push(`\u2717 ${error.what} (${error.code})`);

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
