/**
 * Credential redaction for text and values that came off the wire.
 *
 * Registry problem details, response bodies, and request URLs can quote a
 * credential back at the caller, either in a recognizable shape (a bearer
 * token, a query parameter, a well-known key prefix) or as the exact value the
 * Registry returned under a sensitive key (`token`, `password`, `device_code`
 * and the like). Every surface that copies such text or structure into
 * durable or machine-readable output redacts it through this module first:
 * `collectSensitiveStrings` harvests the exact values a structured boundary
 * carries, and the two redactors erase both the shapes and those values.
 *
 * @experimental This API is unstable and may change without notice.
 */

/** The replacement every redacted credential leaves behind. */
export const REDACTED_SECRET = "[REDACTED]";

const MIN_SECRET_LENGTH = 4;

const normalizedKey = (key: string): string => key.replaceAll(/[-_]/g, "").toLowerCase();

const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  "authorization",
  "proxyauthorization",
  "token",
  "accesstoken",
  "refreshtoken",
  "stepuptoken",
  "idtoken",
  "apikey",
  "clientsecret",
  "secret",
  "password",
  "passwd",
  "cookie",
  "setcookie",
  "privatekey",
  "initiatorproof",
  "codeverifier",
  "devicecode",
  "credential",
]);

const isSensitiveKey = (key: string): boolean => SENSITIVE_KEYS.has(normalizedKey(key));

const redactCredentialShapes = (input: string): string =>
  input
    .replaceAll(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED_SECRET}`)
    .replaceAll(
      /([?&](?:access_token|refresh_token|token|api_key|apikey|key|secret|password|code|initiator_proof|code_verifier|device_code)=)[^&#\s]*/gi,
      `$1${REDACTED_SECRET}`,
    )
    .replaceAll(
      /((?:access_token|refresh_token|step_up_token|token|api_key|apikey|client_secret|secret|password|authorization|initiator_?proof|code_?verifier|device_?code)["']?\s*[:=]\s*["']?)[^"',\s&}]+/gi,
      `$1${REDACTED_SECRET}`,
    )
    .replaceAll(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, REDACTED_SECRET)
    .replaceAll(/\b(?:sk|npm)_[A-Za-z0-9_-]{16,}\b/g, REDACTED_SECRET)
    .replaceAll(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, REDACTED_SECRET);

const redactKnownSecret = (text: string, secret: string): string =>
  secret.length < MIN_SECRET_LENGTH ? text : text.replaceAll(secret, REDACTED_SECRET);

/**
 * Redact common credential shapes in registry-supplied text, plus the exact
 * secret values harvested from a structured boundary with
 * `collectSensitiveStrings`.
 */
export const redactRegistryText = (
  input: string,
  options: { readonly secrets?: ReadonlyArray<string> } = {},
): string => {
  let output = redactCredentialShapes(input);
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

/** Exact credential values a structure stores under known sensitive keys. */
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
    if (key !== undefined && isSensitiveKey(key)) return REDACTED_SECRET;
    return redactRegistryText(value, { secrets });
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
    return redactRegistryText(String(value), { secrets });
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

/**
 * Redact a structure the way its text is redacted: every string under a
 * sensitive key is replaced whole, every other string loses credential
 * shapes and the harvested secrets, and circular references are cut. The
 * secrets default to the ones the structure itself carries.
 */
export const redactRegistryValue = (
  value: unknown,
  options: { readonly secrets?: ReadonlyArray<string> } = {},
): unknown => redactValue(value, options.secrets ?? collectSensitiveStrings(value), new WeakSet());
