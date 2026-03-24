/**
 * Normalization and collapse functions for skill entries.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { SkillEntry } from "./schema.js";

/**
 * Canonical internal representation of a configured skill entry.
 *
 * All handler and service code works with this form.
 * Unmanaged status is derived by the classifier, not stored here.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface NormalizedSkillEntry {
  readonly source: string;
  readonly enabled: boolean;
}

/**
 * Normalize a parsed SkillEntry to its canonical internal form.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const normalizeSkillEntry = (entry: SkillEntry): NormalizedSkillEntry => {
  if (typeof entry === "string") {
    return { source: entry, enabled: true };
  }
  return {
    source: entry.source,
    enabled: entry.enabled ?? true,
  };
};

/**
 * Extract the source string from a SkillEntry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getSkillEntrySource = (entry: SkillEntry): string => {
  if (typeof entry === "string") return entry;
  return entry.source;
};

/**
 * Collapse a NormalizedSkillEntry to the most compact settings representation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const collapseSkillEntry = (entry: NormalizedSkillEntry): SkillEntry => {
  if (entry.enabled) {
    return entry.source;
  }
  return { source: entry.source, enabled: false };
};
