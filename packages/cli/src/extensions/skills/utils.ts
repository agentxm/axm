/**
 * Post-discovery skill utilities.
 *
 * Display name resolution, filtering by name, and name sanitization
 * for discovered skills. Consumed by the install handler and UI layer.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { PacksLockMap } from "../../lockfile/index.js";
import type { SkillExtensionRef } from "../../sources/index.js";
import { stripFileProtocol } from "../../utils/fs-helpers.js";

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
// Sanitization
// -----------------------------------------------------------------------------

/**
 * Sanitizes a skill name into a safe on-disk directory name.
 *
 * Transformation pipeline:
 * 1. Convert to lowercase
 * 2. Replace non-alphanumeric characters (except `.` and `_`) with hyphens
 * 3. Strip leading and trailing dots and hyphens
 * 4. Truncate to 255 characters
 * 5. Fall back to `"unnamed-skill"` if empty
 */
export const sanitizeName = (name: string): string => {
  let result = name
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, "-")
    .replace(/^[.-]+/, "")
    .replace(/[.-]+$/, "");

  result = result.slice(0, 255);

  return result || "unnamed-skill";
};

// -----------------------------------------------------------------------------
// Pack-reference helpers
// -----------------------------------------------------------------------------

/**
 * Derive the FQN (`@namespace/skills/name`) for a skill lock entry, if it's a registry entry.
 */
export const getSkillFqn = (
  skillName: string,
  lockEntry: { type: string; namespace?: string; name?: string } | undefined,
): string | undefined => {
  if (lockEntry?.type === "registry" && lockEntry.namespace && lockEntry.name) {
    return `${lockEntry.namespace}/skills/${lockEntry.name}`;
  }
  // For non-registry entries, the skill name itself may be a FQN (e.g., "@namespace/skills/name")
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
