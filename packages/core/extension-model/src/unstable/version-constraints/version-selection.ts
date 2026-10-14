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
import {
  isExactVersionRequest,
  normalizeVersionRequest,
  versionSatisfiesRequest,
  type VersionEntryLike,
} from "./version-constraints.js";

/** The release facts needed for selection, independent of index serialization. */
export interface ReleasedVersion extends VersionEntryLike {
  readonly yankedAt?: DateTime.Utc | undefined;
}

/**
 * Every release a request admits, newest first. An absent request is `*`; an
 * exact request admits its version even when yanked; a range admits each
 * non-yanked release that satisfies it.
 */
export const admittedReleases = <T extends ReleasedVersion>(
  versions: ReadonlyArray<T>,
  request: Option.Option<string>,
): ReadonlyArray<T> => {
  const normalized = normalizeVersionRequest(request);
  const exact = isExactVersionRequest(normalized);
  return versions
    .filter(
      (entry) =>
        (exact || entry.yankedAt === undefined) &&
        versionSatisfiesRequest(entry.version, normalized),
    )
    .sort((left, right) => semver.compareBuild(right.version, left.version));
};

/**
 * Resolve an optional exact version or range against an index: the newest
 * release {@link admittedReleases} admits.
 */
export const resolveVersionEntry = <T extends ReleasedVersion>(
  versions: ReadonlyArray<T>,
  versionRange: Option.Option<string>,
): Option.Option<T> => Option.fromUndefinedOr(admittedReleases(versions, versionRange)[0]);

/**
 * Select the highest non-yanked version, independent of index order.
 */
export const selectVersion = <T extends ReleasedVersion>(
  versions: ReadonlyArray<T>,
): Option.Option<T> => resolveVersionEntry(versions, Option.none());
