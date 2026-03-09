/**
 * Source metadata derivation helpers for workspace classifier integration.
 *
 * Pure functions that compute `SourceMeta` (packagingKind + isBuiltIn) from
 * lockfile entries, settings entries, and detection results.
 *
 * @internal
 */

import type { SourceHostConfig } from "../settings/index.js";
import { getSkillEntrySource } from "../settings/index.js";
import type { PackagingKind } from "./classifier.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SourceMeta = { readonly packagingKind: PackagingKind; readonly isBuiltIn: boolean };

// ---------------------------------------------------------------------------
// Derivation from lock entry type
// ---------------------------------------------------------------------------

export const deriveSourceMetaFromLockType = (lockType: string): SourceMeta => {
  switch (lockType) {
    case "builtin":
      return { packagingKind: "native", isBuiltIn: true };
    case "registry":
      return { packagingKind: "native", isBuiltIn: false };
    default:
      // git, github, gitlab, bitbucket, azurerepos, local
      return { packagingKind: "non-native", isBuiltIn: false };
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
  settings: import("../settings/index.js").Settings,
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
      result[name] = { packagingKind: "native", isBuiltIn: false };
    } else {
      result[name] = { packagingKind: "non-native", isBuiltIn: false };
    }
  }
  return result;
};

/**
 * Build source metadata map for non-skill extension types.
 */
export const deriveSourceMetaForNonSkill = (
  settingsEntries: Readonly<Record<string, string>>,
  lockEntries: Readonly<Record<string, { type: string }>>,
): Readonly<Record<string, SourceMeta>> => {
  const result: Record<string, SourceMeta> = {};
  for (const [name, entry] of Object.entries(lockEntries)) {
    result[name] = deriveSourceMetaFromLockType(entry.type);
  }
  for (const [name, source] of Object.entries(settingsEntries)) {
    if (name in result) continue;
    if (source.includes("/") && source.startsWith("@")) {
      result[name] = { packagingKind: "native", isBuiltIn: false };
    } else {
      result[name] = { packagingKind: "non-native", isBuiltIn: false };
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
  for (const [name, entry] of Object.entries(lockEntries)) {
    result[name] = { packagingKind: "native", isBuiltIn: entry.type === "builtin" };
  }
  return result;
};
