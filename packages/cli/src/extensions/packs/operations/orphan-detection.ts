/**
 * Orphan detection for pack uninstall.
 *
 * Pure functions that identify extensions no longer referenced by any
 * remaining pack or direct settings entry after a pack is removed.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { PackLockEntry } from "../../../lockfile/schema.js";
import type { SkillsMap } from "../../../settings/schema.js";

/**
 * Identifies skill FQNs that become orphaned after removing a pack.
 *
 * A skill is orphaned if:
 * 1. It is in the removed pack's resolvedSkills
 * 2. It is NOT in any other remaining pack's resolvedSkills
 * 3. It is NOT a direct entry in settings skills map
 *
 * Pure function.
 */
export const findOrphanedSkills = (
  removedPackEntry: PackLockEntry,
  remainingPacks: Readonly<Record<string, PackLockEntry>>,
  configuredSkills: SkillsMap,
): ReadonlyArray<string> => {
  const removedSkills = Object.keys(removedPackEntry.resolvedSkills);

  // Collect all skills referenced by remaining packs
  const otherPackSkills = new Set<string>();
  for (const entry of Object.values(remainingPacks)) {
    for (const fqn of Object.keys(entry.resolvedSkills)) {
      otherPackSkills.add(fqn);
    }
  }

  // Filter to skills that are truly orphaned
  return removedSkills.filter((fqn) => !otherPackSkills.has(fqn) && !(fqn in configuredSkills));
};

/**
 * Identifies command FQNs that become orphaned after removing a pack.
 *
 * Pure function.
 */
export const findOrphanedCommands = (
  removedPackEntry: PackLockEntry,
  remainingPacks: Readonly<Record<string, PackLockEntry>>,
): ReadonlyArray<string> => {
  const removedCommands = Object.keys(removedPackEntry.resolvedCommands);

  const otherPackCommands = new Set<string>();
  for (const entry of Object.values(remainingPacks)) {
    for (const fqn of Object.keys(entry.resolvedCommands)) {
      otherPackCommands.add(fqn);
    }
  }

  return removedCommands.filter((fqn) => !otherPackCommands.has(fqn));
};

/**
 * Identifies MCP server FQNs that become orphaned after removing a pack.
 *
 * Pure function.
 */
export const findOrphanedMcpServers = (
  removedPackEntry: PackLockEntry,
  remainingPacks: Readonly<Record<string, PackLockEntry>>,
): ReadonlyArray<string> => {
  const removedServers = Object.keys(removedPackEntry.resolvedMcpServers);

  const otherPackServers = new Set<string>();
  for (const entry of Object.values(remainingPacks)) {
    for (const fqn of Object.keys(entry.resolvedMcpServers)) {
      otherPackServers.add(fqn);
    }
  }

  return removedServers.filter((fqn) => !otherPackServers.has(fqn));
};
