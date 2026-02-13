/**
 * Normalization and collapse functions for skill entries.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import type { SkillEntry } from "./schema.js";

/**
 * Canonical internal representation of a skill entry.
 *
 * All handler and service code works with this form.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface NormalizedSkillEntry {
  readonly source: Option.Option<string>;
  readonly enabled: boolean;
  readonly managed: boolean;
}

/**
 * Normalize a parsed SkillEntry to its canonical internal form.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const normalizeSkillEntry = (entry: SkillEntry): NormalizedSkillEntry => {
  if (typeof entry === "string") {
    return { source: Option.some(entry), enabled: true, managed: true };
  }
  if ("managed" in entry) {
    return { source: Option.none(), enabled: true, managed: false };
  }
  return {
    source: Option.some(entry.source),
    enabled: entry.enabled ?? true,
    managed: true,
  };
};

/**
 * Collapse a NormalizedSkillEntry to the most compact settings representation.
 *
 * @experimental This API is unstable and may change without notice.
 */
/**
 * Extract the source string from a SkillEntry, or undefined for unmanaged entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getSkillEntrySource = (entry: SkillEntry): string | undefined => {
  if (typeof entry === "string") return entry;
  if ("source" in entry) return entry.source;
  return undefined;
};

/**
 * Collapse a NormalizedSkillEntry to the most compact settings representation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const collapseSkillEntry = (entry: NormalizedSkillEntry): SkillEntry => {
  if (!entry.managed) {
    return { managed: false as const };
  }
  const source = Option.getOrThrow(entry.source);
  if (entry.enabled) {
    return source;
  }
  return { source, enabled: false };
};
