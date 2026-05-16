/**
 * Registry-source parsing helper for workspace rules.
 *
 * Thin re-export over `parseRegistrySourceRef` so workspace rule bodies don't
 * depend directly on the extensions module's internal layout. When the
 * canonical parser changes, this shim stays.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { parseRegistrySourceRef } from "../../../../extensions/registry-source.js";
import type { VersionRange } from "../../../../version-constraints/version-constraints.js";

/** @experimental */
export interface RegistrySourceParts {
  readonly owner: string;
  readonly type: string;
  readonly name: string;
  readonly versionRange: VersionRange | undefined;
}

/**
 * Parse a source string into its registry parts, or `undefined` when the
 * source doesn't look like a registry ref.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const parseRegistrySource = (source: string): RegistrySourceParts | undefined => {
  const parsed = parseRegistrySourceRef(source);
  if (parsed === undefined) {
    return undefined;
  }
  return {
    owner: parsed.owner,
    type: parsed.type,
    name: parsed.name,
    versionRange: parsed.versionRange,
  };
};
