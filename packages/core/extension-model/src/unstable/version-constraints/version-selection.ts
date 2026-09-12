/**
 * Select a published extension release from domain facts.
 *
 * An exact request may select a yanked release; a range selects the highest
 * non-yanked release it admits. Transport metadata and consumer-specific
 * admission policies are outside this algorithm.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import * as semver from "semver";

import type * as DateTime from "effect/DateTime";
import { resolveVersionInRange, type VersionEntryLike } from "./version-constraints.js";

/** The release facts needed for selection, independent of index serialization. */
export interface ReleasedVersion extends VersionEntryLike {
  readonly yankedAt?: DateTime.Utc | undefined;
}

/**
 * Select the highest non-yanked version, independent of index order.
 */
export const selectVersion = <T extends ReleasedVersion>(
  versions: ReadonlyArray<T>,
): Option.Option<T> => {
  const availableVersions = versions.filter((entry) => entry.yankedAt === undefined);
  return resolveVersionInRange(availableVersions, Option.none());
};

/**
 * Resolve an optional exact version or range against an index: an exact
 * version matches even when yanked; a range excludes yanked versions.
 */
export const resolveVersionEntry = <T extends ReleasedVersion>(
  versions: ReadonlyArray<T>,
  versionRange: Option.Option<string>,
): Option.Option<T> => {
  if (Option.isNone(versionRange)) {
    return selectVersion(versions);
  }

  if (semver.valid(versionRange.value) === versionRange.value) {
    return Option.fromUndefinedOr(
      versions.find((candidate) => candidate.version === versionRange.value),
    );
  }

  const availableVersions = versions.filter((entry) => entry.yankedAt === undefined);
  const resolved = resolveVersionInRange(availableVersions, versionRange);
  if (Option.isNone(resolved)) {
    return Option.none();
  }

  return Option.fromUndefinedOr(
    availableVersions.find((candidate) => candidate.version === resolved.value.version),
  );
};
