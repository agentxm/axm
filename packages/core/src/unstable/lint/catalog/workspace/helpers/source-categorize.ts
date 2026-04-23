/**
 * Shared source categorization for workspace declaration rules.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { parseRegistrySource } from "./registry-source.js";

const BARE_NAME_RE = /^[a-z0-9][a-z0-9-]*(?:@[^\s/:]+)?$/i;
const NON_REGISTRY_MARKERS = [
  /^\.\//,
  /^\.\.\//,
  /^\//,
  /^file:\/\//,
  /:\/\//,
  /^[a-z][a-z0-9+.-]*:/i,
];

const isClearlyNonRegistrySource = (source: string): boolean =>
  NON_REGISTRY_MARKERS.some((pattern) => pattern.test(source));

/** Shared normalized view of a declared source string. */
export interface Categorized {
  readonly name: string;
  readonly source: string;
  readonly kind: "registry" | "bare" | "non-registry" | "registry-no-owner";
  readonly registryFqn?: string;
}

/** Classify a declaration source into registry / bare / non-registry buckets. */
export const categorizeEntry = (name: string, source: string): Categorized => {
  const parsed = parseRegistrySource(source);
  if (parsed !== undefined) {
    return {
      name,
      source,
      kind: "registry",
      registryFqn: `${parsed.owner}/${parsed.type}/${parsed.name}`,
    };
  }
  if (isClearlyNonRegistrySource(source)) {
    return { name, source, kind: "non-registry" };
  }
  if (BARE_NAME_RE.test(source)) {
    return { name, source, kind: "bare" };
  }
  return { name, source, kind: "registry-no-owner" };
};
