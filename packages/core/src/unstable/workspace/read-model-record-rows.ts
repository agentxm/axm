/**
 * Lifecycle views over `ReadModelRecordRow`.
 *
 * `WorkspaceReadModelRecords.rows(type)` returns every row the read model
 * projects for one extension type, tagged with its lifecycle. Callers that
 * previously reached for a per-type accessor (`getConfiguredSkills`,
 * `getInstalledPacks`, …) narrow the same rows here instead, so a new
 * extension type needs no new accessor.
 *
 * @internal
 */

import type * as Record from "effect/Record";

import type { ReadModelRecordRow } from "./read-model-record-types.js";

/** A row declared in `settings.json`, carrying a concrete source string. */
export type ConfiguredRecordRow = Extract<ReadModelRecordRow, { lifecycle: "configured" }>;

/** A row installed indirectly — a pack member or a lockfile-only entry. */
export type ImplicitRecordRow = Extract<ReadModelRecordRow, { lifecycle: "implicit" }>;

/** A row observed on disk that no settings or lockfile entry claims. */
export type UnmanagedRecordRow = Extract<ReadModelRecordRow, { lifecycle: "unmanaged" }>;

/** Configured plus implicit — everything the workspace considers installed. */
export type InstalledRecordRow = ConfiguredRecordRow | ImplicitRecordRow;

export const isConfiguredRecordRow = (row: ReadModelRecordRow): row is ConfiguredRecordRow =>
  row.lifecycle === "configured";

export const isUnmanagedRecordRow = (row: ReadModelRecordRow): row is UnmanagedRecordRow =>
  row.lifecycle === "unmanaged";

export const isInstalledRecordRow = (row: ReadModelRecordRow): row is InstalledRecordRow =>
  row.lifecycle !== "unmanaged";

export const configuredRecordRows = (
  rows: ReadonlyArray<ReadModelRecordRow>,
): ReadonlyArray<ConfiguredRecordRow> => rows.filter(isConfiguredRecordRow);

export const unmanagedRecordRows = (
  rows: ReadonlyArray<ReadModelRecordRow>,
): ReadonlyArray<UnmanagedRecordRow> => rows.filter(isUnmanagedRecordRow);

export const installedRecordRows = (
  rows: ReadonlyArray<ReadModelRecordRow>,
): ReadonlyArray<InstalledRecordRow> => rows.filter(isInstalledRecordRow);

/**
 * Index rows by workspace name. Later rows win, matching the projection order
 * where a direct declaration is emitted before any implicit or unmanaged row
 * for the same name.
 */
export const recordRowsByName = <R extends { readonly name: string }>(
  rows: ReadonlyArray<R>,
): Record.ReadonlyRecord<string, R> => {
  const result: globalThis.Record<string, R> = {};
  for (const row of rows) {
    result[row.name] = row;
  }
  return result;
};

export const configuredRowsByName = (
  rows: ReadonlyArray<ReadModelRecordRow>,
): Record.ReadonlyRecord<string, ConfiguredRecordRow> =>
  recordRowsByName(configuredRecordRows(rows));

export const installedRowsByName = (
  rows: ReadonlyArray<ReadModelRecordRow>,
): Record.ReadonlyRecord<string, InstalledRecordRow> => recordRowsByName(installedRecordRows(rows));

export const unmanagedRowsByName = (
  rows: ReadonlyArray<ReadModelRecordRow>,
): Record.ReadonlyRecord<string, UnmanagedRecordRow> => recordRowsByName(unmanagedRecordRows(rows));
