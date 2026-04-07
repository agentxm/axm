/**
 * Normalization and collapse functions for command entries.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { CommandEntry } from "./schema.js";

/**
 * Canonical internal representation of a configured command entry.
 *
 * All handler and service code works with this form.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface NormalizedCommandEntry {
  readonly source: string;
  readonly enabled: boolean;
}

/**
 * Normalize a parsed CommandEntry to its canonical internal form.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const normalizeCommandEntry = (entry: CommandEntry): NormalizedCommandEntry => {
  if (typeof entry === "string") {
    return { source: entry, enabled: true };
  }
  return {
    source: entry.source,
    enabled: entry.enabled ?? true,
  };
};

/**
 * Extract the source string from a CommandEntry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getCommandEntrySource = (entry: CommandEntry): string => {
  if (typeof entry === "string") return entry;
  return entry.source;
};

/**
 * Collapse a NormalizedCommandEntry to the most compact settings representation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const collapseCommandEntry = (entry: NormalizedCommandEntry): CommandEntry => {
  if (entry.enabled) {
    return entry.source;
  }
  return { source: entry.source, enabled: false };
};
