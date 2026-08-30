/**
 * Shared source categorization for workspace declaration rules.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { parseRegistrySourceRef } from "@agentxm/extension-model/unstable/extensions/registry-source";
import { parseFqn } from "@agentxm/extension-model/unstable/extensions/fqn";
import { isWorkspaceSourceLocator } from "../../../../sources/index.js";
import * as Result from "effect/Result";

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
  readonly kind: "registry" | "workspace" | "bare" | "non-registry" | "registry-no-owner";
  readonly registryFqn?: string;
}

/** Classify a declaration source into registry / bare / non-registry buckets. */
export const categorizeEntry = (name: string, source: string): Categorized => {
  if (isWorkspaceSourceLocator(source)) {
    const parsed = parseFqn(source.slice("workspace:".length));
    return Result.isSuccess(parsed)
      ? {
          name,
          source,
          kind: "workspace",
          registryFqn: `${parsed.success.owner}/${parsed.success.type}/${parsed.success.name}`,
        }
      : { name, source, kind: "workspace" };
  }
  const parsed = parseRegistrySourceRef(source);
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
