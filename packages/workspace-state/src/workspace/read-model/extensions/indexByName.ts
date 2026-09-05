/**
 * Pure `indexByName` / `findByName` helpers for projection rows carrying an
 * `ExtensionKey`. Exported once from this shared utility; per-subject modules
 * re-use the same shape so command handlers can lookup a row by name without
 * each subject re-implementing the operation.
 *
 * Rows are read-only inputs; the helpers do not mutate or copy beyond what is
 * needed to build a `Map`. First-seen wins on duplicate names — duplicates are
 * rare in projection output (the projection helper deduplicates by name) but
 * the contract is explicit.
 */

import * as Option from "effect/Option";
import type { ExtensionKey } from "../types.js";

/**
 * Minimal row shape the helpers operate on. Subjects whose row carries
 * `key: ExtensionKey<TType>` for any `TType` satisfies this constraint.
 */
export interface RowWithKey {
  readonly key: ExtensionKey;
}

/**
 * Build a name-indexed read-only map from a row array. First row with a given
 * `key.name` wins; subsequent rows with the same name are dropped.
 */
export const indexByName = <Row extends RowWithKey>(
  rows: ReadonlyArray<Row>,
): ReadonlyMap<string, Row> => {
  const map = new Map<string, Row>();
  for (const row of rows) {
    if (!map.has(row.key.name)) map.set(row.key.name, row);
  }
  return map;
};

/**
 * Look up one row by name. Returns `Option.none()` when the name is not
 * indexed.
 */
export const findByName = <Row extends RowWithKey>(
  rows: ReadonlyArray<Row>,
  name: string,
): Option.Option<Row> => Option.fromUndefinedOr(indexByName(rows).get(name));
