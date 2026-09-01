/**
 * Post-discovery skill utilities.
 *
 * Display name resolution, filtering by name, and name sanitization
 * for discovered skills. Consumed by the install handler and UI layer.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { SkillExtensionRef } from "../workspace/refs/skill.js";
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
