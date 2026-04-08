/**
 * Normalization and collapse functions for subagent entries.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { SubagentEntry } from "./schema.js";

/**
 * Canonical internal representation of a configured subagent entry.
 *
 * All handler and service code works with this form.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface NormalizedSubagentEntry {
  readonly source: string;
  readonly enabled: boolean;
}

/**
 * Normalize a parsed SubagentEntry to its canonical internal form.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const normalizeSubagentEntry = (entry: SubagentEntry): NormalizedSubagentEntry => {
  if (typeof entry === "string") {
    return { source: entry, enabled: true };
  }
  return {
    source: entry.source,
    enabled: entry.enabled ?? true,
  };
};

/**
 * Extract the source string from a SubagentEntry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getSubagentEntrySource = (entry: SubagentEntry): string => {
  if (typeof entry === "string") return entry;
  return entry.source;
};

/**
 * Collapse a NormalizedSubagentEntry to the most compact settings representation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const collapseSubagentEntry = (entry: NormalizedSubagentEntry): SubagentEntry => {
  if (entry.enabled) {
    return entry.source;
  }
  return { source: entry.source, enabled: false };
};
