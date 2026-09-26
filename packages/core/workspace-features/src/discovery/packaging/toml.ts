/**
 * TOML document access for package metadata readers.
 *
 * `smol-toml` parses the full grammar; readers then walk plain records, so a
 * malformed file is a single `undefined` rather than a partially scanned one.
 */

import { parse } from "smol-toml";

export type TomlTable = Readonly<Record<string, unknown>>;

export const isTomlTable = (value: unknown): value is TomlTable =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Parse a TOML document, or `undefined` when it does not parse. */
export const parseTomlDocument = (content: string): TomlTable | undefined => {
  try {
    return parse(content);
  } catch {
    return undefined;
  }
};

/** The named table of a document, or `undefined` when absent or not a table. */
export const tomlTable = (document: TomlTable | undefined, key: string): TomlTable | undefined => {
  const value = document?.[key];
  return isTomlTable(value) ? value : undefined;
};

/** The `key = "string"` entries of a table, in declaration order. */
export const tomlStringEntries = (
  table: TomlTable | undefined,
): ReadonlyArray<{ readonly key: string; readonly value: string }> =>
  table === undefined
    ? []
    : Object.entries(table).flatMap(([key, value]) =>
        typeof value === "string" ? [{ key, value }] : [],
      );
