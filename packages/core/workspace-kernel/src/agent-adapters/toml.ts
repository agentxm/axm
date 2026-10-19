/**
 * Minimal TOML serialization used by AXM renderers and native config edits.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const namedEscapes: Readonly<Record<string, string>> = {
  "\b": "\\b",
  "\t": "\\t",
  "\n": "\\n",
  "\f": "\\f",
  "\r": "\\r",
};

/**
 * Escape backslashes, quotes and every control character TOML basic strings
 * forbid literally. Tab is always admitted; line feed only in the multi-line
 * form, where quotes stay literal and runs are handled by the caller.
 */
const escapeBasic = (value: string, multiline: boolean): string =>
  Array.from(value, (char) => {
    if (char === "\\") return "\\\\";
    if (char === '"' && !multiline) return '\\"';
    const code = char.charCodeAt(0);
    const literal = code >= 0x20 ? code !== 0x7f : char === "\t" || (multiline && char === "\n");
    if (literal) return char;
    return namedEscapes[char] ?? `\\u${code.toString(16).padStart(4, "0")}`;
  }).join("");

const oneLineBasicString = (value: string): string => `"${escapeBasic(value, false)}"`;

/**
 * Serialize a TOML key, quoting keys that are not bare TOML keys.
 */
export const stringifyTomlKey = (key: string): string =>
  /^[A-Za-z0-9_-]+$/.test(key) ? key : oneLineBasicString(key);

/**
 * Serialize a TOML basic string. A value with a line break becomes a
 * multi-line basic string so authored prose stays readable, and every other
 * value a one-line basic string. The multi-line form escapes the third quote
 * of every run so no run closes the string early.
 */
const stringifyTomlString = (value: string): string =>
  value.includes("\n")
    ? `"""\n${escapeBasic(value, true).replace(/"""/g, '""\\"')}"""`
    : oneLineBasicString(value);

/**
 * Serialize a TOML scalar or array value.
 */
export const stringifyTomlValue = (value: unknown): string => {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stringifyTomlValue(entry)).join(", ")}]`;
  }
  return stringifyTomlString(typeof value === "string" ? value : String(value));
};

/**
 * Serialize a record as TOML lines. Nested records become TOML tables.
 */
const stringifyTomlLines = (
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
