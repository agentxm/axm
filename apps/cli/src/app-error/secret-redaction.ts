import { redactRegistryText } from "@agentxm/registry-client";

import type { AppErrorMetadata } from "./app-error.js";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

const REDACTED = "[REDACTED]";
const MIN_SECRET_LENGTH = 4;

const normalizedKey = (key: string): string => key.replaceAll(/[-_]/g, "").toLowerCase();

const isSensitiveKey = (key: string): boolean => {
  const normalized = normalizedKey(key);
  return (
    normalized === "authorization" ||
    normalized === "proxyauthorization" ||
    normalized === "token" ||
    normalized === "accesstoken" ||
    normalized === "refreshtoken" ||
    normalized === "stepuptoken" ||
    normalized === "idtoken" ||
    normalized === "apikey" ||
    normalized === "clientsecret" ||
    normalized === "secret" ||
    normalized === "password" ||
    normalized === "passwd" ||
    normalized === "cookie" ||
    normalized === "setcookie" ||
    normalized === "privatekey" ||
    normalized === "initiatorproof" ||
    normalized === "codeverifier" ||
    normalized === "devicecode" ||
    normalized === "credential"
  );
};

const redactKnownSecret = (text: string, secret: string): string =>
  secret.length < MIN_SECRET_LENGTH ? text : text.replaceAll(secret, REDACTED);

/**
 * Redact common credential shapes plus exact secret values harvested from a
 * structured error boundary.
 */
export const redactSensitiveText = (
  input: string,
  options: { readonly secrets?: ReadonlyArray<string> } = {},
): string => {
  let output = redactRegistryText(input);

  for (const secret of options.secrets ?? []) {
    output = redactKnownSecret(output, secret);
  }
  return output;
};

const collectSensitiveStringsInto = (
  value: unknown,
  output: Set<string>,
  seen: WeakSet<object>,
  key?: string,
): void => {
  if (typeof value === "string") {
    if (key !== undefined && isSensitiveKey(key) && value.length >= MIN_SECRET_LENGTH) {
      output.add(value);
    }
    return;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectSensitiveStringsInto(item, output, seen, key);
    return;
  }
  for (const [entryKey, entryValue] of Object.entries(value)) {
    collectSensitiveStringsInto(entryValue, output, seen, entryKey);
  }
};

/** Exact credential values stored under known sensitive keys. */
export const collectSensitiveStrings = (value: unknown): ReadonlyArray<string> => {
  const output = new Set<string>();
  collectSensitiveStringsInto(value, output, new WeakSet());
  return [...output];
};

const redactValue = (
  value: unknown,
  secrets: ReadonlyArray<string>,
  seen: WeakSet<object>,
  key?: string,
): unknown => {
  if (typeof value === "string") {
    if (key !== undefined && isSensitiveKey(key)) return REDACTED;
    return redactSensitiveText(value, { secrets });
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }
  if (typeof value !== "object") {
    return redactSensitiveText(String(value), { secrets });
  }
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, secrets, seen, key));
  }
  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactValue(entryValue, secrets, seen, entryKey),
    ]),
  );
};

export const redactSensitiveValue = (
  value: unknown,
  options: { readonly secrets?: ReadonlyArray<string> } = {},
): unknown => redactValue(value, options.secrets ?? collectSensitiveStrings(value), new WeakSet());

export const redactAppErrorMetadata = (
  metadata: AppErrorMetadata,
  secrets: ReadonlyArray<string> = collectSensitiveStrings(metadata),
): AppErrorMetadata => ({
  ...(metadata.request === undefined
    ? {}
    : {
        request: {
          service: redactSensitiveText(metadata.request.service, { secrets }),
          ...(metadata.request.method === undefined
            ? {}
            : { method: redactSensitiveText(metadata.request.method, { secrets }) }),
          url: redactSensitiveText(metadata.request.url, { secrets }),
        },
      }),
  ...(metadata.response === undefined
    ? {}
    : {
        response: {
          status: metadata.response.status,
          ...(metadata.response.requestId === undefined
            ? {}
            : { requestId: redactSensitiveText(metadata.response.requestId, { secrets }) }),
          ...(metadata.response.problemCode === undefined
            ? {}
            : { problemCode: redactSensitiveText(metadata.response.problemCode, { secrets }) }),
          ...(metadata.response.body === undefined
            ? {}
            : { body: redactSensitiveValue(metadata.response.body, { secrets }) }),
        },
      }),
  ...(metadata.requestPolicy === undefined ? {} : { requestPolicy: metadata.requestPolicy }),
});

export const redactSuggestedAction = (
  suggestion: SuggestedAction,
  secrets: ReadonlyArray<string> = [],
): SuggestedAction => ({
  description: redactSensitiveText(suggestion.description, { secrets }),
  ...(suggestion.cmd === undefined
    ? {}
    : { cmd: redactSensitiveText(suggestion.cmd, { secrets }) }),
  ...(suggestion.url === undefined
    ? {}
    : { url: redactSensitiveText(suggestion.url, { secrets }) }),
});

/** Exposed for contract tests and diagnostics. */
export const REDACTED_SECRET = REDACTED;
