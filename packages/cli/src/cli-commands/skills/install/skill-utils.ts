/**
 * Post-discovery skill utilities.
 *
 * Display name resolution, filtering by name, and name sanitization
 * for discovered skills. Consumed by the install handler and UI layer.
 *
 * @experimental This API is unstable and may change without notice.
 */

// Boundary exception: pure string utility using basename — not filesystem I/O.
// See design decision D1 in the install-command-cleanup change.
import * as nodePath from "node:path";
import type { SkillRef } from "../operations.js";

// -----------------------------------------------------------------------------
// Display Name
// -----------------------------------------------------------------------------

/**
 * Returns the display name for a skill.
 *
 * Uses `skill.name` when present, falls back to `basename(location)`.
 */
export const getSkillDisplayName = (ref: SkillRef): string =>
  ref.skill.name || nodePath.basename(ref.location.replace(/^file:\/\//, ""));

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
