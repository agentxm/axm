/**
 * Shared helpers for pack-retained skill lock entries.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { type Lockfile, type SkillLockEntry } from "../../../../lockfile/schema.js";
import { type Settings } from "../../../../settings/schema.js";

export const isRegistrySkillLockEntry = (
  entry: SkillLockEntry,
): entry is Extract<SkillLockEntry, { readonly type: "registry" }> => entry.type === "registry";

/** Build the FQN used by pack retention checks for a skill lock entry. */
export const lockEntryFqn = (entry: SkillLockEntry, name: string): string => {
  if (isRegistrySkillLockEntry(entry)) {
    return `${entry.owner}/skills/${entry.name}`;
  }
  return `skills/${name}`;
};

/**
 * Build the set of skill FQNs retained by installed declared packs.
 *
 * This stays skill-specific because `packs-members-retained` walks all four
 * member maps and all pack lock entries, while the skill rules only need
 * declared-pack `resolvedSkills`.
 */
export const buildRetainedSkillFqns = (
  settings: Settings,
  lockfile: Lockfile,
): ReadonlySet<string> => {
  const declaredPackNames = new Set(Object.keys(settings.packs ?? {}));
  const retained = new Set<string>();
  for (const [packName, packEntry] of Object.entries(lockfile.packs ?? {})) {
    if (!declaredPackNames.has(packName)) {
      continue;
    }
    for (const fqn of Object.keys(packEntry.resolvedSkills)) {
      retained.add(fqn);
    }
  }
  return retained;
};

/** A valid implicit skill is lockfile-only and still retained by a declared pack. */
export const isImplicitRetainedSkill = (
  name: string,
  entry: SkillLockEntry,
  declaredSkills: Readonly<Record<string, unknown>>,
  retainedFqns: ReadonlySet<string>,
): boolean => !(name in declaredSkills) && retainedFqns.has(lockEntryFqn(entry, name));
