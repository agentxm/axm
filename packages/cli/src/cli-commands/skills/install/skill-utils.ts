/**
 * Post-discovery skill utilities.
 *
 * Display name resolution, filtering by name, and name sanitization
 * for discovered skills. Consumed by the install handler and UI layer.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as nodePath from "node:path";
import * as Option from "effect/Option";
import type { SkillRef } from "./discover-skills.js";

// -----------------------------------------------------------------------------
// Display Name
// -----------------------------------------------------------------------------

/**
 * Returns the display name for a skill.
 *
 * Uses `skill.name` when present, falls back to `basename(path)`.
 */
export const getSkillDisplayName = (ref: SkillRef): string =>
  ref.skill.name ||
  Option.match(ref.path, {
    onNone: () => "unnamed",
    onSome: (p) => nodePath.basename(p),
  });

// -----------------------------------------------------------------------------
// Filtering
// -----------------------------------------------------------------------------

/**
 * Filters skills by input names (case-insensitive).
 *
 * Matches against both `skill.name` and `getSkillDisplayName(ref)`.
 */
export const filterSkills = (
  skills: ReadonlyArray<SkillRef>,
  inputNames: ReadonlyArray<string>,
): ReadonlyArray<SkillRef> => {
  const lowerNames = inputNames.map((n) => n.toLowerCase());
  return skills.filter((ref) => {
    const name = ref.skill.name.toLowerCase();
    const displayName = getSkillDisplayName(ref).toLowerCase();
    return lowerNames.some((input) => input === name || input === displayName);
  });
};

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
    .replace(/[^a-z0-9._]/g, "-")
    .replace(/^[.-]+/, "")
    .replace(/[.-]+$/, "");

  result = result.slice(0, 255);

  return result || "unnamed-skill";
};
