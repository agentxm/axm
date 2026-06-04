import type { SuggestedAction } from "../cli-runtime/suggested-action.js";
import { type AppError, effectiveSuggestionsFor } from "./app-error.js";

const defaultRenderOptions: { readonly verbose: boolean; readonly debug: boolean } = {
  verbose: false,
  debug: false,
};

const isAppError = (cause: unknown): cause is AppError =>
  typeof cause === "object" &&
  cause !== null &&
  "_tag" in cause &&
  cause._tag === "AppError" &&
  "detail" in cause &&
  "code" in cause;

const getStringField = (value: unknown, field: string): string | undefined => {
  if (value === null || value === undefined || typeof value !== "object") {
    return undefined;
  }

  const fieldValue: unknown = Reflect.get(value, field);
  return typeof fieldValue === "string" ? fieldValue : undefined;
};

const getRequestId = (error: AppError): string | undefined =>
  error.metadata?.response?.requestId ??
  getStringField(error.metadata?.response?.body, "requestId");

const getRegistryUrl = (error: AppError): string | undefined =>
  error.metadata?.request?.service === "registry" ? error.metadata.request.url : undefined;

const formatRegistryLocation = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
};

const formatRegistryRequest = (error: AppError): string | undefined => {
  const request = error.metadata?.request;
  if (request === undefined || request.service !== "registry") {
    return undefined;
  }
  return request.method === undefined ? request.url : `${request.method} ${request.url}`;
};

const formatResponseBody = (body: unknown): ReadonlyArray<string> => {
  try {
    return JSON.stringify(body, null, 2).split("\n");
  } catch {
    return ["[unserializable response body]"];
  }
};

/**
 * Render the suggested next actions as an indented `Next steps:` block. Each
 * suggestion is a bullet with its optional `cmd` / `url` on a follow-on line.
 */
const formatSuggestions = (suggestions: ReadonlyArray<SuggestedAction>): ReadonlyArray<string> => {
  if (suggestions.length === 0) return [];

  const lines: Array<string> = ["  Next steps:"];
  for (const suggestion of suggestions) {
    lines.push(`    • ${suggestion.description}`);
    if (suggestion.cmd !== undefined) {
      lines.push(`      ${suggestion.cmd}`);
    }
    if (suggestion.url !== undefined) {
      lines.push(`      ${suggestion.url}`);
    }
  }
  return lines;
};

const formatCause = (
  cause: unknown,
  options: { readonly verbose: boolean; readonly debug: boolean },
): ReadonlyArray<string> => {
  if (cause === undefined || cause === null) return [];

  if (isAppError(cause)) {
    const causeHeadline = `${cause.detail} (${cause.code})`;
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

  lines.push(`\u2716 ${error.detail} (${error.code})`);

  const requestId = getRequestId(error);
  const registryUrl = getRegistryUrl(error);

  if (registryUrl !== undefined) {
    lines.push(`  Registry: ${formatRegistryLocation(registryUrl)}`);
  }

  if (options.verbose || options.debug) {
    lines.push(`  Title: ${error.title}`);

    const registryRequest = formatRegistryRequest(error);
    if (registryRequest !== undefined) {
      lines.push(`  Request: ${registryRequest}`);
    }

    if (requestId !== undefined) {
      lines.push(`  Request ID: ${requestId}`);
    }

    const responseBody = error.metadata?.response?.body;
    if (responseBody !== undefined) {
      lines.push("  Response:");
      for (const line of formatResponseBody(responseBody)) {
        lines.push(`    ${line}`);
      }
    }
  } else if (error.code === "internal" && requestId !== undefined) {
    lines.push(`  Request ID: ${requestId}`);
  }

  for (const line of formatSuggestions(effectiveSuggestionsFor(error))) {
    lines.push(line);
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

  lines.push("\u2716 An unexpected error occurred");
  lines.push("  This is a bug. Please report it at https://github.com/agentxm/axm/issues");

  if (error instanceof Error) {
    lines.push(`  ${error.message}`);
  } else if (typeof error === "string") {
    lines.push(`  ${error}`);
  }

  return lines.join("\n");
};
