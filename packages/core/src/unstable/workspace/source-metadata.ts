/**
 * Source metadata derivation helpers for workspace classifier integration.
 *
 * Pure functions that compute `SourceMeta` (packagingKind) from
 * lockfile entries, settings entries, and detection results.
 *
 * @internal
 */

import { getSkillEntrySource, type Settings, type SourceHostConfig } from "../settings/index.js";
import type { PackagingKind } from "./classifier.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SourceMeta = { readonly packagingKind: PackagingKind };

// ---------------------------------------------------------------------------
// Derivation from lock entry type
// ---------------------------------------------------------------------------

export const deriveSourceMetaFromLockType = (lockType: string): SourceMeta => {
  switch (lockType) {
    case "registry":
      return { packagingKind: "native" };
    default:
      // git, github, gitlab, bitbucket, azurerepos, local
      return { packagingKind: "non-native" };
  }
};

// ---------------------------------------------------------------------------
// Built-in source defaults
// ---------------------------------------------------------------------------

/**
 * Built-in source defaults that are always available unless overridden.
 * The default registry entry is parameterized by the resolved registry URL.
 */
export const getBuiltInSources = (registryUrl: string): ReadonlyArray<SourceHostConfig> => [
  { name: "default", type: "registry", location: new URL(registryUrl) },
  { name: "github", type: "github", url: new URL("https://github.com") },
  { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
  { name: "bitbucket", type: "bitbucket", url: new URL("https://bitbucket.org") },
];

// ---------------------------------------------------------------------------
// Derivation for specific extension types
// ---------------------------------------------------------------------------

/**
 * Build source metadata map for skills from lockfile and settings.
 */
export const deriveSourceMetaForSkills = (
  settings: Settings,
  lockSkills: Readonly<Record<string, { type: string }>>,
  _detectedNames: ReadonlyArray<string>,
): Readonly<Record<string, SourceMeta>> => {
  const result: Record<string, SourceMeta> = {};
  // Lockfile entries take precedence
  for (const [name, entry] of Object.entries(lockSkills)) {
    result[name] = deriveSourceMetaFromLockType(entry.type);
  }
  // Configured entries without lockfile entries — parse source string
  const configuredSkills = settings.skills ?? {};
  for (const [name, entry] of Object.entries(configuredSkills)) {
    if (name in result) continue;
    const sourceStr = getSkillEntrySource(entry);
    // Registry/FQN → native; otherwise → non-native
    if (sourceStr.includes("/skills/") || sourceStr.startsWith("@")) {
      result[name] = { packagingKind: "native" };
    } else {
      result[name] = { packagingKind: "non-native" };
    }
  }
  return result;
};

/**
 * Extract the source string from an entry that may be a plain string
 * or an object with a `source` property.
 */
const getEntrySource = (entry: string | { readonly source: string }): string =>
  typeof entry === "string" ? entry : entry.source;

/**
 * Build source metadata map for non-skill extension types.
 *
 * Accepts entries that are either plain source strings or objects with
 * a `source` property (e.g. `{ source, enabled? }`).
 */
export const deriveSourceMetaForNonSkill = (
  settingsEntries: Readonly<Record<string, string | { readonly source: string }>>,
  lockEntries: Readonly<Record<string, { type: string }>>,
): Readonly<Record<string, SourceMeta>> => {
  const result: Record<string, SourceMeta> = {};
  for (const [name, entry] of Object.entries(lockEntries)) {
    result[name] = deriveSourceMetaFromLockType(entry.type);
  }
  for (const [name, entry] of Object.entries(settingsEntries)) {
    if (name in result) continue;
    const source = getEntrySource(entry);
    if (source.includes("/") && source.startsWith("@")) {
      result[name] = { packagingKind: "native" };
    } else {
      result[name] = { packagingKind: "non-native" };
    }
  }
  return result;
};

/**
 * Build source metadata map for packs (always native).
 */
export const deriveSourceMetaForPacks = (
  _settingsEntries: Readonly<Record<string, unknown>>,
  lockEntries: Readonly<Record<string, { type: string }>>,
): Readonly<Record<string, SourceMeta>> => {
  const result: Record<string, SourceMeta> = {};
  for (const [name] of Object.entries(lockEntries)) {
    result[name] = { packagingKind: "native" };
  }
  return result;
};
