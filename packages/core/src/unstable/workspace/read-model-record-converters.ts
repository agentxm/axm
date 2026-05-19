/**
 * Read-model record conversion helpers.
 *
 * Convert arrays of `ReadModelRecordRow` rows into the typed record maps
 * used by workspace service getters (e.g., `getConfiguredSkills`,
 * `getInstalledCommands`).
 *
 * @internal
 */

import type * as Record from "effect/Record";

import type {
  ReadModelRecordRow,
  ConfiguredCommand,
  ConfiguredExtensionRef,
  ConfiguredSkill,
  ConfiguredSubagent,
  ImplicitCommand,
  ImplicitExtensionRef,
  ImplicitSkill,
  ImplicitSubagent,
  InstalledCommand,
  InstalledExtensionRef,
  InstalledSkill,
  InstalledSubagent,
  UnmanagedCommand,
  UnmanagedExtensionRef,
  UnmanagedSkill,
  UnmanagedSubagent,
} from "./read-model-record-types.js";

type ConfiguredRow = Extract<ReadModelRecordRow, { lifecycle: "configured" }>;
type NonConfiguredRow = Exclude<ReadModelRecordRow, ConfiguredRow>;
type UnmanagedRow = NonConfiguredRow & { lifecycle: "unmanaged" };
type InstalledRow = ConfiguredRow | (NonConfiguredRow & { lifecycle: "implicit" });

const isConfigured = (row: ReadModelRecordRow): row is ConfiguredRow =>
  row.lifecycle === "configured";

const isUnmanaged = (row: ReadModelRecordRow): row is UnmanagedRow => row.lifecycle === "unmanaged";

const isInstalled = (row: ReadModelRecordRow): row is InstalledRow => row.lifecycle !== "unmanaged";

const collectRecord = <R extends ReadModelRecordRow, A>(
  rows: ReadonlyArray<ReadModelRecordRow>,
  predicate: (row: ReadModelRecordRow) => row is R,
  mapValue: (row: R) => A,
): Record.ReadonlyRecord<string, A> => {
  const result: Record<string, A> = {};

  for (const row of rows) {
    if (predicate(row)) {
      result[row.name] = mapValue(row);
    }
  }

  return result;
};

const toConfiguredSkill = (row: ConfiguredRow): ConfiguredSkill => ({
  source: row.source,
  enabled: row.enabled,
  packagingKind: row.packagingKind,
});

const toImplicitSkill = (row: NonConfiguredRow): ImplicitSkill => ({
  source: row.source,
  enabled: true,
  packagingKind: row.packagingKind,
});

const toUnmanagedSkill = (row: UnmanagedRow): UnmanagedSkill => ({
  source: row.source,
  enabled: true,
  packagingKind: row.packagingKind,
  locations: row.locations,
});

const toInstalledSkill = (row: InstalledRow): InstalledSkill =>
  row.lifecycle === "configured"
    ? { lifecycle: "configured", ...toConfiguredSkill(row) }
    : { lifecycle: "implicit", ...toImplicitSkill(row) };

const toConfiguredCommand = (row: ConfiguredRow): ConfiguredCommand => ({
  source: row.source,
  enabled: row.enabled,
  packagingKind: row.packagingKind,
});

const toImplicitCommand = (row: NonConfiguredRow): ImplicitCommand => ({
  source: row.source,
  enabled: true,
  packagingKind: row.packagingKind,
});

const toUnmanagedCommand = (row: NonConfiguredRow): UnmanagedCommand => ({
  source: row.source,
  enabled: true,
  packagingKind: row.packagingKind,
});

const toInstalledCommand = (row: InstalledRow): InstalledCommand =>
  row.lifecycle === "configured"
    ? { lifecycle: "configured", ...toConfiguredCommand(row) }
    : { lifecycle: "implicit", ...toImplicitCommand(row) };

const toConfiguredExtensionRef = (row: ConfiguredRow): ConfiguredExtensionRef => ({
  source: row.source,
  enabled: row.enabled,
  packagingKind: row.packagingKind,
});

const toImplicitExtensionRef = (row: NonConfiguredRow): ImplicitExtensionRef => ({
  source: row.source,
  packagingKind: row.packagingKind,
});

const toUnmanagedExtensionRef = (row: NonConfiguredRow): UnmanagedExtensionRef => ({
  source: row.source,
  packagingKind: row.packagingKind,
});

const toInstalledExtensionRef = (row: InstalledRow): InstalledExtensionRef =>
  row.lifecycle === "configured"
    ? { lifecycle: "configured", ...toConfiguredExtensionRef(row) }
    : { lifecycle: "implicit", ...toImplicitExtensionRef(row) };

// ---------------------------------------------------------------------------
// Skill record converters
// ---------------------------------------------------------------------------

export const toConfiguredSkillRecord = (rows: ReadonlyArray<ReadModelRecordRow>) =>
  collectRecord(rows, isConfigured, toConfiguredSkill);

export const toUnmanagedSkillRecord = (rows: ReadonlyArray<ReadModelRecordRow>) =>
  collectRecord(rows, isUnmanaged, toUnmanagedSkill);

export const toInstalledSkillRecord = (rows: ReadonlyArray<ReadModelRecordRow>) =>
  collectRecord(rows, isInstalled, toInstalledSkill);

// ---------------------------------------------------------------------------
// Command record converters
// ---------------------------------------------------------------------------

export const toConfiguredCommandRecord = (rows: ReadonlyArray<ReadModelRecordRow>) =>
  collectRecord(rows, isConfigured, toConfiguredCommand);

// ---------------------------------------------------------------------------
// Generic extension ref record converters (MCP servers, packs)
// ---------------------------------------------------------------------------

export const toConfiguredExtensionRefRecord = (rows: ReadonlyArray<ReadModelRecordRow>) =>
  collectRecord(rows, isConfigured, toConfiguredExtensionRef);

export const toUnmanagedExtensionRefRecord = (rows: ReadonlyArray<ReadModelRecordRow>) =>
  collectRecord(rows, isUnmanaged, toUnmanagedExtensionRef);

export const toInstalledExtensionRefRecord = (rows: ReadonlyArray<ReadModelRecordRow>) =>
  collectRecord(rows, isInstalled, toInstalledExtensionRef);

export const toUnmanagedCommandRecord = (rows: ReadonlyArray<ReadModelRecordRow>) =>
  collectRecord(rows, isUnmanaged, toUnmanagedCommand);

export const toInstalledCommandRecord = (rows: ReadonlyArray<ReadModelRecordRow>) =>
  collectRecord(rows, isInstalled, toInstalledCommand);

// ---------------------------------------------------------------------------
// Subagent record converters
// ---------------------------------------------------------------------------

const toConfiguredSubagent = (row: ConfiguredRow): ConfiguredSubagent => ({
  source: row.source,
  enabled: row.enabled,
  packagingKind: row.packagingKind,
});

const toImplicitSubagent = (row: NonConfiguredRow): ImplicitSubagent => ({
  source: row.source,
  enabled: true,
  packagingKind: row.packagingKind,
});

const toUnmanagedSubagent = (row: NonConfiguredRow): UnmanagedSubagent => ({
  source: row.source,
  enabled: true,
  packagingKind: row.packagingKind,
});

const toInstalledSubagent = (row: InstalledRow): InstalledSubagent =>
  row.lifecycle === "configured"
    ? { lifecycle: "configured", ...toConfiguredSubagent(row) }
    : { lifecycle: "implicit", ...toImplicitSubagent(row) };

export const toConfiguredSubagentRecord = (rows: ReadonlyArray<ReadModelRecordRow>) =>
  collectRecord(rows, isConfigured, toConfiguredSubagent);

export const toUnmanagedSubagentRecord = (rows: ReadonlyArray<ReadModelRecordRow>) =>
  collectRecord(rows, isUnmanaged, toUnmanagedSubagent);

export const toInstalledSubagentRecord = (rows: ReadonlyArray<ReadModelRecordRow>) =>
  collectRecord(rows, isInstalled, toInstalledSubagent);
