import * as Option from "effect/Option";
import * as semver from "semver";

/**
 * Minimal version entry shape used for constraint resolution.
 * Compatible with the full VersionEntry from the registry module.
 */
export interface VersionEntryLike {
  readonly version: string;
}

/**
 * Extract a version constraint suffix from a source string.
 *
 * Handles both namespaced (`@handle/name@^1.0.0`) and non-namespaced (`name@^1.0.0`) names.
 * Returns `Option.none()` when no version suffix is present.
 */
export const parseVersionConstraint = (sourceString: string): Option.Option<string> => {
  // For namespaced packages (@handle/name@constraint), find the @ after the handle
  if (sourceString.startsWith("@")) {
    const slashIndex = sourceString.indexOf("/");
    if (slashIndex === -1) return Option.none();
    const afterHandle = sourceString.indexOf("@", slashIndex + 1);
    if (afterHandle === -1) return Option.none();
    return Option.some(sourceString.slice(afterHandle + 1));
  }
  // For non-namespaced packages (name@constraint)
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
  versions: ReadonlyArray<VersionEntryLike>,
  constraint: Option.Option<string>,
): Option.Option<VersionEntryLike> => {
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
