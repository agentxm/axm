/**
 * Package URL matching functions for comparing detected packages
 * against declared compatible packages.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { PackageUrlParts } from "@agentxm/extension-model/unstable/packaging/package-url";

/**
 * Check whether two purl parts share the same identity (type, namespace, name).
 * Version is ignored.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const purlIdentityMatch = (a: PackageUrlParts, b: PackageUrlParts): boolean =>
  a.type === b.type && a.namespace === b.namespace && a.name === b.name;

/**
 * Check whether a detected purl matches a declared compatible purl.
 *
 * Matching rules:
 * - Identity (type, namespace, name) must match exactly
 * - Versionless declaration matches any detected version
 * - Versionless detection matches any declaration
 * - Both exact versions match only if equal
 *
 * @experimental This API is unstable and may change without notice.
 */
export const purlMatch = (detected: PackageUrlParts, declared: PackageUrlParts): boolean => {
  if (!purlIdentityMatch(detected, declared)) return false;
  if (declared.version === undefined) return true;
  if (detected.version === undefined) return true;
  return detected.version === declared.version;
};
