/**
 * Constraint resolution logic for skills update.
 *
 * Collects version constraints from user settings and pack manifests,
 * then resolves them using priority rules:
 * 1. User explicit constraint (not "*") → resolve with user constraint only
 * 2. User "*" or no constraint → intersect all pack constraints
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import {
  decodeVersionSync,
  decodeVersionRangeSync,
  versionSatisfiesRange,
} from "@agentxm/extension-model/unstable/version-constraints";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * A pack's constraint on a skill version.
 */
export interface PackConstraint {
  readonly packName: string;
  readonly constraint: string;
}

/**
 * Collected constraints for a single skill.
 */
export interface SkillConstraints {
  /** User's version constraint from settings source string. None = no constraint (treat as "*"). */
  readonly userConstraint: Option.Option<string>;
  /** Pack constraints from installed pack manifests. */
  readonly packConstraints: ReadonlyArray<PackConstraint>;
}

/**
 * Result of constraint resolution for a skill.
 */
export interface ConstraintResolutionResult {
  /** The resolved version string. */
  readonly resolvedVersion: string;
  /** Warnings generated during resolution. */
  readonly warnings: ReadonlyArray<string>;
}

// -----------------------------------------------------------------------------
// Constraint Resolution
// -----------------------------------------------------------------------------

/**
 * Resolve the best version for a skill given its constraints and available versions.
 *
 * Algorithm:
 * 1. If user has explicit constraint (not "*"):
 *    - Find first version (newest-first) satisfying user constraint
 *    - If none found → return Option.none() (caller should fail)
 * 2. If user has "*" or no constraint:
 *    - Collect all pack constraints
 *    - For each candidate (newest first): check all pack constraints
 *    - First satisfying all → use it
 *    - If none satisfies all → use newest, warn about each unsatisfied constraint
 *
 * @param versions - Available versions, newest first
 * @param constraints - Collected constraints for the skill
 * @param skillName - Skill name for warning messages
 * @returns Option.some with result if resolved, Option.none if user constraint unsatisfiable
 */
export const resolveConstrainedVersion = (
  versions: ReadonlyArray<string>,
  constraints: SkillConstraints,
  skillName: string,
): Option.Option<ConstraintResolutionResult> => {
  const [newest] = versions;
  if (newest === undefined) return Option.none();

  const userConstraintStr = Option.getOrElse(constraints.userConstraint, () => "*");
  const isWildcard = userConstraintStr === "*";

  // Case 1: User has explicit constraint
  if (!isWildcard) {
    const userConstraint = decodeVersionRangeSync(userConstraintStr);
    const matched = versions.find((v) =>
      versionSatisfiesRange(decodeVersionSync(v), userConstraint),
    );
    if (matched === undefined) return Option.none();
    return Option.some({ resolvedVersion: matched, warnings: [] });
  }

  // Case 2: User has wildcard — apply pack constraints
  if (constraints.packConstraints.length === 0) {
    // No pack constraints — use newest
    return Option.some({ resolvedVersion: newest, warnings: [] });
  }

  // Try each version (newest first) against all pack constraints
  for (const version of versions) {
    const allSatisfied = constraints.packConstraints.every((pc) =>
      versionSatisfiesRange(decodeVersionSync(version), decodeVersionRangeSync(pc.constraint)),
    );
    if (allSatisfied) {
      return Option.some({ resolvedVersion: version, warnings: [] });
    }
  }

  // No version satisfies all pack constraints — use newest, warn
  const warnings = constraints.packConstraints
    .filter(
      (pc) =>
        !versionSatisfiesRange(decodeVersionSync(newest), decodeVersionRangeSync(pc.constraint)),
    )
    .map((pc) => `${skillName} held at ${newest} by pack "${pc.packName}" (${pc.constraint})`);

  return Option.some({ resolvedVersion: newest, warnings });
};

/**
 * Detect when a pack constraint holds back a user-installed "*" skill.
 *
 * Emits a warning when:
 * - User has skill with no constraint (wants latest)
 * - Pack constraint resolves to a version below the latest available
 *
 * @param latestVersion - The latest available version
 * @param resolvedVersion - The version that was resolved after constraint application
 * @param constraints - The skill's constraints
 * @param skillName - Skill name for warning messages
 * @returns Warning messages (empty if no holdback detected)
 */
export const detectHoldbackWarnings = (
  latestVersion: string,
  resolvedVersion: string,
  constraints: SkillConstraints,
  skillName: string,
): ReadonlyArray<string> => {
  const userConstraintStr = Option.getOrElse(constraints.userConstraint, () => "*");

  // Only warn for wildcard users (wanting latest)
  if (userConstraintStr !== "*") return [];

  // No holdback if resolved to latest
  if (resolvedVersion === latestVersion) return [];

  // No pack constraints means no holdback
  if (constraints.packConstraints.length === 0) return [];

  return constraints.packConstraints
    .filter(
      (pc) =>
        !versionSatisfiesRange(
          decodeVersionSync(latestVersion),
          decodeVersionRangeSync(pc.constraint),
        ),
    )
    .map(
      (pc) =>
        `${skillName} held at ${resolvedVersion} by pack "${pc.packName}" (${pc.constraint}), latest is ${latestVersion}`,
    );
};
