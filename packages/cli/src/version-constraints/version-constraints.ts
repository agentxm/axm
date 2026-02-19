import * as Option from "effect/Option";
import * as semver from "semver";

import type { VersionEntry } from "../registry/index.js";

/**
 * Extract a version constraint suffix from a source string.
 *
 * Handles both scoped (`@namespace/name@^1.0.0`) and unscoped (`name@^1.0.0`) names.
 * Returns `Option.none()` when no version suffix is present.
 */
export const parseVersionConstraint = (sourceString: string): Option.Option<string> => {
  // For scoped packages (@namespace/name@constraint), find the @ after the namespace
  if (sourceString.startsWith("@")) {
    const slashIndex = sourceString.indexOf("/");
    if (slashIndex === -1) return Option.none();
    const afterNamespace = sourceString.indexOf("@", slashIndex + 1);
    if (afterNamespace === -1) return Option.none();
    return Option.some(sourceString.slice(afterNamespace + 1));
  }
  // For unscoped packages (name@constraint)
  const atIndex = sourceString.indexOf("@");
  if (atIndex === -1) return Option.none();
  return Option.some(sourceString.slice(atIndex + 1));
};

/**
 * Check whether a string is a valid semver range.
 */
export const isValidConstraint = (constraint: string): boolean =>
  semver.validRange(constraint) !== null;

/**
 * Check whether a version satisfies a semver constraint.
 */
export const satisfiesConstraint = (version: string, constraint: string): boolean =>
  semver.satisfies(version, constraint);

/**
 * Select the first version (newest-first) that satisfies the constraint.
 *
 * - `Option.none()` constraint or `"*"` matches any version.
 * - Invalid constraints match nothing.
 */
export const resolveVersionWithConstraint = (
  versions: ReadonlyArray<VersionEntry>,
  constraint: Option.Option<string>,
): Option.Option<VersionEntry> => {
  const constraintStr = Option.getOrElse(constraint, () => "*");

  // Wildcard means no constraint filtering
  const isWildcard = constraintStr === "*";

  // Validate the constraint early
  if (!isWildcard && !isValidConstraint(constraintStr)) {
    return Option.none();
  }

  for (const version of versions) {
    if (!isWildcard && !semver.satisfies(version.version, constraintStr)) {
      continue;
    }
    return Option.some(version);
  }

  return Option.none();
};
