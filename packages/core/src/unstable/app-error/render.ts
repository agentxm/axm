import type { SuggestedAction } from "../cli-runtime/suggested-action.js";
import { type AppError, effectiveSuggestionsFor } from "./app-error.js";
import { serializeErrorCauseChain } from "./cause-chain.js";

const defaultRenderOptions: { readonly verbose: boolean; readonly debug: boolean } = {
  verbose: false,
  debug: false,
};

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

const formatSuggestedActionTarget = (suggestion: SuggestedAction): string => {
  if (suggestion.cmd !== undefined) {
    return suggestion.cmd;
  }
  if (suggestion.url !== undefined) {
    return suggestion.url;
  }
  return "";
};

/**
 * Render suggested next actions with the same text shape as the CLI renderer's
 * `Next:` block: one action per line, optional command/URL inline.
 */
const formatSuggestions = (suggestions: ReadonlyArray<SuggestedAction>): ReadonlyArray<string> => {
  if (suggestions.length === 0) return [];

  const lines: Array<string> = ["Next:"];
  for (const suggestion of suggestions) {
    const target = formatSuggestedActionTarget(suggestion);
    lines.push(
      target.length === 0
        ? `  ${suggestion.description}`
        : `  ${suggestion.description} · ${target}`,
    );
  }
  return lines;
};

const formatCause = (
  cause: unknown,
  options: { readonly verbose: boolean; readonly debug: boolean },
): ReadonlyArray<string> => {
  const chain = serializeErrorCauseChain(cause, { debug: options.debug });
  return chain.flatMap((item) => {
    const code = item.code === undefined ? "" : ` (${item.code})`;
    const lines = [`Cause: ${item._tag}: ${item.message}${code}`];
    if (options.debug && item.stack !== undefined) {
      lines.push(...item.stack.split("\n").map((line) => `Stack: ${line}`));
    }
    return lines;
  });
};

export const renderAppError = (
  error: AppError,
  options: { readonly verbose: boolean; readonly debug: boolean } = defaultRenderOptions,
): string => {
  const lines: Array<string> = [];

  lines.push(`\u2716  ${error.detail} (${error.code})`);

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
  } else if (error.cause !== undefined && error.cause !== null) {
    lines.push("  Run with `--debug` to see error details.");
  }

  return lines.join("\n");
};

export const renderDefect = (error: unknown): string => {
  const lines: Array<string> = [];

  lines.push("\u2716  An unexpected error occurred");
  lines.push("  This is a bug. Please report it at https://github.com/agentxm/axm/issues");

  if (error instanceof Error) {
    lines.push(`  ${error.message}`);
  } else if (typeof error === "string") {
    lines.push(`  ${error}`);
  }

  return lines.join("\n");
};
