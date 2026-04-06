/**
 * Post-discovery skill utilities.
 *
 * Display name resolution, filtering by name, and name sanitization
 * for discovered skills. Consumed by the install handler and UI layer.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { ExtensionPacksLockMap } from "../lockfile/index.js";
import type { SkillExtensionRef } from "./refs.js";
import { stripFileProtocol } from "../utils/index.js";

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
// Extension-pack-reference helpers
// -----------------------------------------------------------------------------

/**
 * Derive the FQN (`@owner/skills/name`) for a skill lock entry, if it's a registry entry.
 */
export const getSkillFqn = (
  skillName: string,
  lockEntry: { type: string; owner?: string; name?: string } | undefined,
): string | undefined => {
  if (lockEntry?.type === "registry" && lockEntry.owner && lockEntry.name) {
    return `${lockEntry.owner}/skills/${lockEntry.name}`;
  }
  // For non-registry entries, the skill name itself may be a FQN (e.g., "@owner/skills/name")
  return skillName.startsWith("@") ? skillName : undefined;
};

/**
 * Check if a skill is referenced by any extension pack's `resolvedSkills`.
 *
 * Pure function — scans all extension pack lock entries for the given FQN.
 */
export const isReferencedByExtensionPack = (
  skillFqn: string,
  lockedPacks: ExtensionPacksLockMap,
): boolean => Object.values(lockedPacks).some((pack) => skillFqn in pack.resolvedSkills);

/**
 * Return the names of extension packs that reference a skill by its FQN.
 *
 * Superset of `isReferencedByExtensionPack` — returns extension pack names instead of a boolean.
 */
export const getReferencingExtensionPacks = (
  skillFqn: string,
  lockedPacks: ExtensionPacksLockMap,
): ReadonlyArray<string> =>
  Object.entries(lockedPacks)
    .filter(([, pack]) => skillFqn in pack.resolvedSkills)
    .map(([name]) => name);
