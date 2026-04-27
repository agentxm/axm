/**
 * Workspace record conversion helpers.
 *
 * Convert arrays of `WorkspaceRecordRow` rows into the typed record maps
 * used by workspace service getters (e.g., `getConfiguredSkills`,
 * `getInstalledCommands`).
 *
 * @internal
 */

import type * as Record from "effect/Record";

import type {
  WorkspaceRecordRow,
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
} from "./workspace-record-types.js";

type ConfiguredRow = Extract<WorkspaceRecordRow, { lifecycle: "configured" }>;
type NonConfiguredRow = Exclude<WorkspaceRecordRow, ConfiguredRow>;
type ImplicitRow = NonConfiguredRow & { lifecycle: "implicit" };
type UnmanagedRow = NonConfiguredRow & { lifecycle: "unmanaged" };
type InstalledRow = ConfiguredRow | ImplicitRow;

const isConfigured = (row: WorkspaceRecordRow): row is ConfiguredRow =>
  row.lifecycle === "configured";

const isImplicit = (row: WorkspaceRecordRow): row is ImplicitRow => row.lifecycle === "implicit";

const isUnmanaged = (row: WorkspaceRecordRow): row is UnmanagedRow => row.lifecycle === "unmanaged";

const isInstalled = (row: WorkspaceRecordRow): row is InstalledRow => row.lifecycle !== "unmanaged";

const collectRecord = <R extends WorkspaceRecordRow, A>(
  rows: ReadonlyArray<WorkspaceRecordRow>,
  predicate: (row: WorkspaceRecordRow) => row is R,
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

export const toConfiguredSkillRecord = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  collectRecord(rows, isConfigured, toConfiguredSkill);

export const toImplicitSkillRecord = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  collectRecord(rows, isImplicit, toImplicitSkill);

export const toUnmanagedSkillRecord = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  collectRecord(rows, isUnmanaged, toUnmanagedSkill);

export const toInstalledSkillRecord = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  collectRecord(rows, isInstalled, toInstalledSkill);

// ---------------------------------------------------------------------------
// Command record converters
// ---------------------------------------------------------------------------

export const toConfiguredCommandRecord = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  collectRecord(rows, isConfigured, toConfiguredCommand);

// ---------------------------------------------------------------------------
// Generic extension ref record converters (MCP servers, packs)
// ---------------------------------------------------------------------------

export const toConfiguredExtensionRefRecord = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  collectRecord(rows, isConfigured, toConfiguredExtensionRef);

export const toImplicitExtensionRefRecord = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  collectRecord(rows, isImplicit, toImplicitExtensionRef);

export const toUnmanagedExtensionRefRecord = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  collectRecord(rows, isUnmanaged, toUnmanagedExtensionRef);

export const toInstalledExtensionRefRecord = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  collectRecord(rows, isInstalled, toInstalledExtensionRef);

export const toImplicitCommandRecord = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  collectRecord(rows, isImplicit, toImplicitCommand);

export const toUnmanagedCommandRecord = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  collectRecord(rows, isUnmanaged, toUnmanagedCommand);

export const toInstalledCommandRecord = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
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

export const toConfiguredSubagentRecord = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  collectRecord(rows, isConfigured, toConfiguredSubagent);

export const toImplicitSubagentRecord = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  collectRecord(rows, isImplicit, toImplicitSubagent);

export const toUnmanagedSubagentRecord = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  collectRecord(rows, isUnmanaged, toUnmanagedSubagent);

export const toInstalledSubagentRecord = (rows: ReadonlyArray<WorkspaceRecordRow>) =>
  collectRecord(rows, isInstalled, toInstalledSubagent);
