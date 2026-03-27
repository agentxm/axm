/**
 * Post-discovery skill utilities.
 *
 * Display name resolution, filtering by name, and name sanitization
 * for discovered skills. Consumed by the install handler and UI layer.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { PacksLockMap } from "../lockfile/index.js";
import type { SkillExtensionRef } from "../sources/index.js";
import { stripFileProtocol } from "../utils/index.js";

// Re-export sanitizeName from the shared extensions utils
export { sanitizeName } from "../extensions/utils.js";

// -----------------------------------------------------------------------------
// Display Name
// -----------------------------------------------------------------------------

/**
 * Returns the display name for a skill.
 *
 * Uses `skill.name` when present, falls back to `basename(location)`.
 */
/**
 * Extract the last path segment from a location string.
 */
const basenamePure = (location: string): string => {
  const stripped = stripFileProtocol(location);
  return stripped.split("/").pop() ?? stripped;
};

export const getSkillDisplayName = (ref: SkillExtensionRef): string =>
  ref.skill.name ||
  (ref.refType === "git-hosted" || ref.refType === "local"
    ? basenamePure(ref.location)
    : ref.skill.name);

// -----------------------------------------------------------------------------
// Pack-reference helpers
// -----------------------------------------------------------------------------

/**
 * Derive the FQN (`@profile/skills/name`) for a skill lock entry, if it's a registry entry.
 */
export const getSkillFqn = (
  skillName: string,
  lockEntry: { type: string; profile?: string; name?: string } | undefined,
): string | undefined => {
  if (lockEntry?.type === "registry" && lockEntry.profile && lockEntry.name) {
    return `${lockEntry.profile}/skills/${lockEntry.name}`;
  }
  // For non-registry entries, the skill name itself may be a FQN (e.g., "@profile/skills/name")
  return skillName.startsWith("@") ? skillName : undefined;
};

/**
 * Check if a skill is referenced by any pack's `resolvedSkills`.
 *
 * Pure function — scans all pack lock entries for the given FQN.
 */
export const isReferencedByPack = (skillFqn: string, lockedPacks: PacksLockMap): boolean =>
  Object.values(lockedPacks).some((pack) => skillFqn in pack.resolvedSkills);

/**
 * Return the names of packs that reference a skill by its FQN.
 *
 * Superset of `isReferencedByPack` — returns pack names instead of a boolean.
 */
export const getReferencingPacks = (
  skillFqn: string,
  lockedPacks: PacksLockMap,
): ReadonlyArray<string> =>
  Object.entries(lockedPacks)
    .filter(([, pack]) => skillFqn in pack.resolvedSkills)
    .map(([name]) => name);
