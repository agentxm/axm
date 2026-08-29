import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import * as semver from "semver";

/**
 * Minimal version entry shape used for range resolution.
 * Compatible with the full VersionEntry from the registry module.
 */
export interface VersionEntryLike {
  readonly version: Version;
}

/**
 * Canonical strict semver pattern from semver.org.
 *
 * Equivalent to `semver.valid(value) === value`: rejects leading `v`,
 * whitespace, partial versions, and leading-zero numeric identifiers.
 */
export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const SEMVER_RANGE_PATTERN = /^[~^<>=*xXvV0-9A-Za-z+| .-]+$/;

/**
 * Schema for an exact semver version (no ranges).
 */
export const VersionSchema = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(SEMVER_PATTERN, {
      message: "Expected a semver version (e.g., 1.0.0)",
    }),
  ),
  Schema.annotate({
    identifier: "Version",
    title: "Version",
    description: "A semver version like 1.0.0. Ranges are not allowed here.",
    examples: ["1.0.0", "2.3.1", "0.1.0-beta.1"],
    message: "Expected a semver version (e.g., 1.0.0)",
  }),
  Schema.brand("Version"),
);

/**
 * Inferred type for an exact semver version.
 */
export type Version = Schema.Schema.Type<typeof VersionSchema>;

/**
 * Schema for a semver version range, including exact versions and range expressions.
 */
export const VersionRangeSchema = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter((value: string) => {
      const normalized = semver.validRange(value);
      return normalized !== null ? undefined : `Expected a semver version range, got: ${value}`;
    }),
  ),
  Schema.check(
    Schema.isPattern(SEMVER_RANGE_PATTERN, {
      message: "Expected a semver version range (e.g., ^1.0.0)",
    }),
  ),
  Schema.annotate({
    identifier: "VersionRange",
    title: "Version Range",
    description:
      'A semver version range like ^1.0.0, ~2.3.0, >=1.0.0 <3.0.0, or an exact version 1.2.3. Use "*" to always resolve to the latest available version.',
    examples: ["^1.0.0", "~2.4", ">=1 <3", "1.2.3", "*"],
    message: "Expected a semver version range (e.g., ^1.0.0)",
  }),
  Schema.brand("VersionRange"),
);

/**
 * Inferred type for a semver version range.
 */
export type VersionRange = Schema.Schema.Type<typeof VersionRangeSchema>;

/**
 * Decode a value as an exact semver version.
 */
export const decodeVersionSync = Schema.decodeUnknownSync(VersionSchema);

/**
 * Decode a value as a semver version range.
 */
export const decodeVersionRangeSync = Schema.decodeUnknownSync(VersionRangeSchema);

const parseSemverVersion = (version: string): semver.SemVer | null => semver.parse(version);

/**
 * Extract a version range suffix from a source string.
 *
 * Handles both namespaced (`@handle/name@^1.0.0`) and non-namespaced (`name@^1.0.0`) names.
 * Returns `Option.none()` when no version suffix is present.
 */
export const parseVersionRange = (sourceString: string): Option.Option<VersionRange> => {
  const decodeRange = (value: string): Option.Option<VersionRange> => {
    try {
      return Option.some(decodeVersionRangeSync(value));
    } catch {
      return Option.none();
    }
  };

  // For namespaced packages (@handle/name@range), find the @ after the handle
  if (sourceString.startsWith("@")) {
    const slashIndex = sourceString.indexOf("/");
    if (slashIndex === -1) return Option.none();
    const afterHandle = sourceString.indexOf("@", slashIndex + 1);
    if (afterHandle === -1) return Option.none();
    return decodeRange(sourceString.slice(afterHandle + 1));
  }
  // For non-namespaced packages (name@range)
  const atIndex = sourceString.indexOf("@");
  if (atIndex === -1) return Option.none();
  return decodeRange(sourceString.slice(atIndex + 1));
};

/**
 * Check whether a string is a valid semver version range.
 */
export const isValidVersionRange = (range: string): boolean => semver.validRange(range) !== null;

/** Return one range representing the complete intersection, or undefined when unsatisfiable. */
export const intersectVersionConstraints = (
  constraints: ReadonlyArray<string>,
): string | undefined => {
  let intersections = [""];
  for (const constraint of constraints) {
    const validRange = semver.validRange(constraint);
    if (validRange === null) return undefined;
    const range = new semver.Range(validRange);
    intersections = intersections.flatMap((current) =>
      range.set.flatMap((comparators) => {
        const candidate = [current, ...comparators.map((comparator) => comparator.value)]
          .filter((part) => part.length > 0)
          .join(" ");
        return semver.minVersion(candidate) === null ? [] : [candidate];
      }),
    );
    if (intersections.length === 0) return undefined;
  }
  return intersections.join(" || ");
};

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
 * Check whether a version satisfies a semver version range.
 */
export const versionSatisfiesRange = (version: Version, range: VersionRange): boolean =>
  semver.satisfies(version, range);

/**
 * Select the maximum version that satisfies the range, independent of input
 * order.
 *
 * - `Option.none()` range or `"*"` matches any version.
 * - Invalid ranges match nothing.
 */
export const resolveVersionInRange = <T extends VersionEntryLike>(
  versions: ReadonlyArray<T>,
  range: Option.Option<string>,
): Option.Option<T> => {
  const rangeStr = Option.getOrElse(range, () => "*");

  // Wildcard means no range filtering
  const isWildcard = rangeStr === "*";

  // Validate the range early
  if (!isWildcard && !isValidVersionRange(rangeStr)) {
    return Option.none();
  }

  let selected: T | undefined;
  for (const version of versions) {
    if (!isWildcard && !semver.satisfies(version.version, rangeStr)) {
      continue;
    }
    if (selected === undefined || semver.compareBuild(version.version, selected.version) > 0) {
      selected = version;
    }
  }

  return Option.fromUndefinedOr(selected);
};
