import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import * as semver from "semver";

/**
 * Minimal version entry shape used for constraint resolution.
 * Compatible with the full VersionEntry from the registry module.
 */
export interface VersionEntryLike {
  readonly version: ExactSemverVersion;
}

/**
 * Schema for exact semver versions (no ranges).
 */
export const ExactSemverVersionSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) => {
      const normalized = semver.valid(value);
      return normalized === value ? undefined : `Expected exact semver version, got: ${value}`;
    }),
  ),
  Schema.brand("ExactSemverVersion"),
);

/**
 * Inferred type for exact semver versions.
 */
export type ExactSemverVersion = Schema.Schema.Type<typeof ExactSemverVersionSchema>;

/**
 * Schema for semver version constraints, including exact versions and ranges.
 */
export const VersionConstraintSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) => {
      const normalized = semver.validRange(value);
      return normalized !== null ? undefined : `Expected semver constraint, got: ${value}`;
    }),
  ),
  Schema.brand("VersionConstraint"),
);

/**
 * Inferred type for semver version constraints.
 */
export type VersionConstraint = Schema.Schema.Type<typeof VersionConstraintSchema>;

/**
 * Decode a value as an exact semver version.
 */
export const decodeExactSemverVersionSync = Schema.decodeUnknownSync(ExactSemverVersionSchema);

/**
 * Decode a value as a semver constraint.
 */
export const decodeVersionConstraintSync = Schema.decodeUnknownSync(VersionConstraintSchema);

const parseSemverVersion = (version: string): semver.SemVer | null => semver.parse(version);

/**
 * Extract a version constraint suffix from a source string.
 *
 * Handles both namespaced (`@handle/name@^1.0.0`) and non-namespaced (`name@^1.0.0`) names.
 * Returns `Option.none()` when no version suffix is present.
 */
export const parseVersionConstraint = (sourceString: string): Option.Option<VersionConstraint> => {
  const decodeConstraint = (value: string): Option.Option<VersionConstraint> => {
    try {
      return Option.some(decodeVersionConstraintSync(value));
    } catch {
      return Option.none();
    }
  };

  // For namespaced packages (@handle/name@constraint), find the @ after the handle
  if (sourceString.startsWith("@")) {
    const slashIndex = sourceString.indexOf("/");
    if (slashIndex === -1) return Option.none();
    const afterHandle = sourceString.indexOf("@", slashIndex + 1);
    if (afterHandle === -1) return Option.none();
    return decodeConstraint(sourceString.slice(afterHandle + 1));
  }
  // For non-namespaced packages (name@constraint)
  const atIndex = sourceString.indexOf("@");
  if (atIndex === -1) return Option.none();
  return decodeConstraint(sourceString.slice(atIndex + 1));
};

/**
 * Check whether a string is a valid semver range.
 */
export const isValidConstraint = (constraint: string): boolean =>
  semver.validRange(constraint) !== null;

/**
 * Check whether moving from `previousVersion` to `currentVersion` includes at
 * least a minor version bump.
 */
export const hasMinorOrMajorVersionBump = (
  previousVersion: string,
  currentVersion: string,
): boolean => {
  const previous = parseSemverVersion(previousVersion);
  const current = parseSemverVersion(currentVersion);
  if (previous === null || current === null) {
    return false;
  }

  return current.major > previous.major || current.minor > previous.minor;
};

/**
 * Check whether a version satisfies a semver constraint.
 */
export const satisfiesConstraint = (
  version: ExactSemverVersion,
  constraint: VersionConstraint,
): boolean => semver.satisfies(version, constraint);

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
