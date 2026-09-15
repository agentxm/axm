/**
 * Minimal TOML utilities used by AXM renderers and package metadata readers.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Serialize a TOML key, quoting keys that are not bare TOML keys.
 */
export const stringifyTomlKey = (key: string): string =>
  /^[A-Za-z0-9_-]+$/.test(key) ? key : `"${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * Serialize a TOML scalar or array value.
 */
export const stringifyTomlValue = (value: unknown): string => {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stringifyTomlValue(entry)).join(", ")}]`;
  }
  const str = typeof value === "string" ? value : String(value);
  if (str.includes("\n")) return `"""\n${str.replace(/"""/g, '"\\"\\""')}"""`;
  return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
};

/**
 * Serialize a record as TOML lines. Nested records become TOML tables.
 */
export const stringifyTomlLines = (
  object: Readonly<Record<string, unknown>>,
  path: ReadonlyArray<string> = [],
): ReadonlyArray<string> => {
  const scalarLines: Array<string> = [];
  const tableLines: Array<string> = [];

  for (const [key, value] of Object.entries(object)) {
    if (isPlainObject(value)) {
      const childPath = [...path, key];
      tableLines.push("", `[${childPath.map((part) => stringifyTomlKey(part)).join(".")}]`);
      tableLines.push(...stringifyTomlLines(value, childPath));
    } else {
      scalarLines.push(`${stringifyTomlKey(key)} = ${stringifyTomlValue(value)}`);
    }
  }

  return [...scalarLines, ...tableLines];
};

/**
 * Serialize a record as a TOML document.
 */
export const stringifyToml = (object: Readonly<Record<string, unknown>>): string =>
  stringifyTomlLines(object).join("\n");

/**
 * Parse a TOML quoted string using JSON-compatible escapes.
 */
export const parseTomlInlineString = (value: string): string | undefined => {
  try {
    const decoded: unknown = JSON.parse(value);
    return typeof decoded === "string" ? decoded : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Parse the inline array-of-tables subset used for AXM package metadata.
 */
export const parseTomlInlineTableArray = (rawValue: string): unknown => {
  if (rawValue === "[]") return [];

  try {
    return JSON.parse(rawValue);
  } catch {
    // TOML inline tables use `key = "value"`, which is not JSON.
  }

  const entries: Array<Record<string, string>> = [];
  for (const match of rawValue.matchAll(/\{([^{}]*)\}/g)) {
    const tableBody = match[1];
    if (tableBody === undefined) continue;

    const entry: Record<string, string> = {};
    for (const part of tableBody.split(",")) {
      const pair = /^\s*([A-Za-z0-9_-]+)\s*=\s*("(?:\\.|[^"\\])*")\s*$/.exec(part);
      const key = pair?.[1];
      const encodedValue = pair?.[2];
      if (key === undefined || encodedValue === undefined) continue;

      const value = parseTomlInlineString(encodedValue);
      if (value !== undefined) entry[key] = value;
    }

    if (Object.keys(entry).length > 0) entries.push(entry);
  }

  return entries.length > 0 ? entries : rawValue;
};

/**
 * Parse the scalar and inline-table-array TOML subset used by package metadata readers.
 */
export const parseTomlValue = (rawValue: string): unknown => {
  if (rawValue.startsWith("[")) {
    return parseTomlInlineTableArray(rawValue);
  }

  if (rawValue.startsWith('"')) {
    return parseTomlInlineString(rawValue) ?? rawValue.slice(1, -1);
  }

  if (rawValue === "true" || rawValue === "false") {
    return rawValue === "true";
  }

  if (/^[+-]?\d+(?:\.\d+)?$/u.test(rawValue)) {
    return Number(rawValue);
  }

  return rawValue;
};
