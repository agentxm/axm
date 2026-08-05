/**
 * Compile-time assertions for the `WorkspaceReadModelRecords` surface.
 *
 * Pure type-level. Excluded from vitest's runtime suite and included in
 * `tsconfig.spec.json`, so these assertions are checked when typecheck runs.
 *
 * The point is to keep the facade collapsed to two readers. Before the
 * read-model families covered every extension type, this interface carried
 * fourteen per-type accessors (`getConfiguredSkills`, `getInstalledPacks`, …)
 * that had to grow by three whenever a type was added. `rows(type)` is total
 * over `InstallableExtensionType`, so a new type needs no new member — and
 * this file fails compile if one is reintroduced.
 */

import type { InstallableExtensionType } from "../extensions/installable-types.js";
import type { WorkspaceReadModelRecords } from "./service-interface.js";

// The facade SHALL expose exactly `getExtensionInventory` and `rows`.
type _RecordsKeys = keyof WorkspaceReadModelRecords;
type _NoExtraKeys = [Exclude<_RecordsKeys, "getExtensionInventory" | "rows">] extends [never]
  ? true
  : false;
type _NoMissingKeys = [Exclude<"getExtensionInventory" | "rows", _RecordsKeys>] extends [never]
  ? true
  : false;
const _noExtraKeys = true as const satisfies _NoExtraKeys;
const _noMissingKeys = true as const satisfies _NoMissingKeys;

// `rows` SHALL accept every installable extension type, not a narrower subset.
type _RowsParam = Parameters<WorkspaceReadModelRecords["rows"]>[0];
type _RowsIsTotal = [Exclude<InstallableExtensionType, _RowsParam>] extends [never] ? true : false;
const _rowsIsTotal = true as const satisfies _RowsIsTotal;

export type _RecordsFacadeShape = [typeof _noExtraKeys, typeof _noMissingKeys, typeof _rowsIsTotal];
