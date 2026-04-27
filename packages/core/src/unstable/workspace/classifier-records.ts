/**
 * Taxonomy record conversion helpers.
 *
 * Convert arrays of `ClassifiedExtension` rows into the typed record maps
 * used by workspace service getters (e.g., `getConfiguredSkills`,
 * `getInstalledCommands`).
 *
 * @internal
 */

import type * as Record from "effect/Record";

import type {
  ClassifiedCommand,
  ClassifiedExtension,
  ClassifiedExtensionRef,
  ClassifiedSkill,
  ClassifiedSubagent,
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
} from "./taxonomy-types.js";

type ConfiguredRow = Extract<ClassifiedExtension, { lifecycle: "configured" }>;
type NonConfiguredRow = Exclude<ClassifiedExtension, ConfiguredRow>;
type ImplicitRow = NonConfiguredRow & { lifecycle: "implicit" };
type UnmanagedRow = NonConfiguredRow & { lifecycle: "unmanaged" };
type InstalledRow = ConfiguredRow | ImplicitRow;
type ExternalConfiguredRow = ConfiguredRow & { packagingKind: "non-native" };
type ExternalUnmanagedRow = UnmanagedRow & { packagingKind: "non-native" };

const isConfigured = (row: ClassifiedExtension): row is ConfiguredRow =>
  row.lifecycle === "configured";

const isImplicit = (row: ClassifiedExtension): row is ImplicitRow => row.lifecycle === "implicit";

const isUnmanaged = (row: ClassifiedExtension): row is UnmanagedRow =>
  row.lifecycle === "unmanaged";

const isInstalled = (row: ClassifiedExtension): row is InstalledRow =>
  row.lifecycle !== "unmanaged";

const isExternalConfigured = (row: ClassifiedExtension): row is ExternalConfiguredRow =>
  row.lifecycle === "configured" && row.packagingKind === "non-native";

const isExternalUnmanaged = (row: ClassifiedExtension): row is ExternalUnmanagedRow =>
  row.lifecycle === "unmanaged" && row.packagingKind === "non-native";

const collectRecord = <R extends ClassifiedExtension, A>(
  rows: ReadonlyArray<ClassifiedExtension>,
  predicate: (row: ClassifiedExtension) => row is R,
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

const mapRecord = <A>(
  rows: ReadonlyArray<ClassifiedExtension>,
  mapValue: (row: ClassifiedExtension) => A,
): Record.ReadonlyRecord<string, A> => {
  const result: Record<string, A> = {};

  for (const row of rows) {
    result[row.name] = mapValue(row);
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

const toClassifiedSkill = (row: ClassifiedExtension): ClassifiedSkill => {
  switch (row.lifecycle) {
    case "configured":
      return { lifecycle: "configured", ...toConfiguredSkill(row) };
    case "implicit":
      return { lifecycle: "implicit", ...toImplicitSkill(row) };
    case "unmanaged":
      return { lifecycle: "unmanaged", ...toUnmanagedSkill(row) };
  }
};

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

const toClassifiedCommand = (row: ClassifiedExtension): ClassifiedCommand => {
  switch (row.lifecycle) {
    case "configured":
      return { lifecycle: "configured", ...toConfiguredCommand(row) };
    case "implicit":
      return { lifecycle: "implicit", ...toImplicitCommand(row) };
    case "unmanaged":
      return { lifecycle: "unmanaged", ...toUnmanagedCommand(row) };
  }
};

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

const toClassifiedExtensionRef = (row: ClassifiedExtension): ClassifiedExtensionRef => {
  switch (row.lifecycle) {
    case "configured":
      return { lifecycle: "configured", ...toConfiguredExtensionRef(row) };
    case "implicit":
      return { lifecycle: "implicit", ...toImplicitExtensionRef(row) };
    case "unmanaged":
      return { lifecycle: "unmanaged", ...toUnmanagedExtensionRef(row) };
  }
};

// ---------------------------------------------------------------------------
// Skill record converters
// ---------------------------------------------------------------------------

export const toConfiguredSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isConfigured, toConfiguredSkill);

export const toImplicitSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isImplicit, toImplicitSkill);

export const toUnmanagedSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isUnmanaged, toUnmanagedSkill);

export const toInstalledSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isInstalled, toInstalledSkill);

export const toClassifiedSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  mapRecord(rows, toClassifiedSkill);

// ---------------------------------------------------------------------------
// Command record converters
// ---------------------------------------------------------------------------

export const toConfiguredCommandRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isConfigured, toConfiguredCommand);

// ---------------------------------------------------------------------------
// Generic extension ref record converters (MCP servers, packs)
// ---------------------------------------------------------------------------

export const toConfiguredExtensionRefRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isConfigured, toConfiguredExtensionRef);

export const toImplicitExtensionRefRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isImplicit, toImplicitExtensionRef);

export const toUnmanagedExtensionRefRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isUnmanaged, toUnmanagedExtensionRef);

export const toInstalledExtensionRefRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isInstalled, toInstalledExtensionRef);

export const toClassifiedExtensionRefRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  mapRecord(rows, toClassifiedExtensionRef);

// ---------------------------------------------------------------------------
// Filtered variants (external = non-native packaging)
// ---------------------------------------------------------------------------

export const toConfiguredExternalSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isExternalConfigured, toConfiguredSkill);

export const toUnmanagedExternalSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isExternalUnmanaged, toUnmanagedSkill);

export const toImplicitCommandRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isImplicit, toImplicitCommand);

export const toUnmanagedCommandRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isUnmanaged, toUnmanagedCommand);

export const toInstalledCommandRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isInstalled, toInstalledCommand);

export const toClassifiedCommandRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  mapRecord(rows, toClassifiedCommand);

export const toConfiguredExternalCommandRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isExternalConfigured, toConfiguredCommand);

export const toUnmanagedExternalCommandRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isExternalUnmanaged, toUnmanagedCommand);

export const toConfiguredExternalExtensionRefRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isExternalConfigured, toConfiguredExtensionRef);

export const toUnmanagedExternalExtensionRefRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isExternalUnmanaged, toUnmanagedExtensionRef);

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

const toClassifiedSubagent = (row: ClassifiedExtension): ClassifiedSubagent => {
  switch (row.lifecycle) {
    case "configured":
      return { lifecycle: "configured", ...toConfiguredSubagent(row) };
    case "implicit":
      return { lifecycle: "implicit", ...toImplicitSubagent(row) };
    case "unmanaged":
      return { lifecycle: "unmanaged", ...toUnmanagedSubagent(row) };
  }
};

export const toConfiguredSubagentRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isConfigured, toConfiguredSubagent);

export const toImplicitSubagentRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isImplicit, toImplicitSubagent);

export const toUnmanagedSubagentRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isUnmanaged, toUnmanagedSubagent);

export const toInstalledSubagentRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  collectRecord(rows, isInstalled, toInstalledSubagent);

export const toClassifiedSubagentRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  mapRecord(rows, toClassifiedSubagent);
