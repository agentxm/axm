import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { type AppError, effectiveSuggestionsFor } from "./app-error.js";
import { serializeErrorCauseChain } from "./cause-chain.js";
import {
  collectSensitiveStrings,
  redactSensitiveText,
  redactSensitiveValue,
  redactSuggestedAction,
} from "./secret-redaction.js";

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

const formatRegistryLocation = (url: string, secrets: ReadonlyArray<string>): string => {
  try {
    return redactSensitiveText(new URL(url).origin, { secrets });
  } catch {
    return redactSensitiveText(url, { secrets });
  }
};

const formatRegistryRequest = (
  error: AppError,
  secrets: ReadonlyArray<string>,
): string | undefined => {
  const request = error.metadata?.request;
  if (request === undefined || request.service !== "registry") {
    return undefined;
  }
  return redactSensitiveText(
    request.method === undefined ? request.url : `${request.method} ${request.url}`,
    { secrets },
  );
};

const formatResponseBody = (
  body: unknown,
  secrets: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  try {
    return JSON.stringify(redactSensitiveValue(body, { secrets }), null, 2).split("\n");
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
const formatSuggestions = (
  suggestions: ReadonlyArray<SuggestedAction>,
  secrets: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  if (suggestions.length === 0) return [];

  const lines: Array<string> = ["Next:"];
  for (const rawSuggestion of suggestions) {
    const suggestion = redactSuggestedAction(rawSuggestion, secrets);
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
  secrets: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const chain = serializeErrorCauseChain(cause, { debug: options.debug, secrets });
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
  const secrets = collectSensitiveStrings(error.metadata);

  lines.push(`\u2716  ${redactSensitiveText(error.detail, { secrets })} (${error.code})`);

  const requestId = getRequestId(error);
  const registryUrl = getRegistryUrl(error);

  if (registryUrl !== undefined) {
    lines.push(`  Registry: ${formatRegistryLocation(registryUrl, secrets)}`);
  }

  if (options.verbose || options.debug) {
    lines.push(`  Title: ${redactSensitiveText(error.title, { secrets })}`);

    const registryRequest = formatRegistryRequest(error, secrets);
    if (registryRequest !== undefined) {
      lines.push(`  Request: ${registryRequest}`);
    }

    if (requestId !== undefined) {
      lines.push(`  Request ID: ${redactSensitiveText(requestId, { secrets })}`);
    }

    const responseBody = error.metadata?.response?.body;
    if (responseBody !== undefined) {
      lines.push("  Response:");
      for (const line of formatResponseBody(responseBody, secrets)) {
        lines.push(`    ${line}`);
      }
    }
  } else if (error.code === "internal" && requestId !== undefined) {
    lines.push(`  Request ID: ${redactSensitiveText(requestId, { secrets })}`);
  }

  for (const line of formatSuggestions(effectiveSuggestionsFor(error), secrets)) {
    lines.push(line);
  }

  if (options.verbose || options.debug) {
    for (const line of formatCause(error.cause, options, secrets)) {
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
    lines.push(`  ${redactSensitiveText(error.message)}`);
  } else if (typeof error === "string") {
    lines.push(`  ${redactSensitiveText(error)}`);
  }

  return lines.join("\n");
};
