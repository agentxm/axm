/**
 * Which entry a Registry index designates for a version request.
 *
 * The rule is part of the Registry contract: a yanked version is selectable
 * only when requested exactly, and a range resolves to the highest non-yanked
 * version it admits.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import * as semver from "semver";

import { resolveVersionInRange } from "@agentxm/extension-model/unstable/version-constraints";
import type { VersionEntry } from "./schema.js";

/**
 * Select the highest non-yanked version, independent of index order.
 */
export const selectVersion = (
  versions: ReadonlyArray<VersionEntry>,
): Option.Option<VersionEntry> => {
  const availableVersions = versions.filter((entry) => entry.yankedAt === undefined);
  return resolveVersionInRange(availableVersions, Option.none());
};

/**
 * Resolve an optional exact version or range against an index: an exact
 * version matches even when yanked; a range excludes yanked versions.
 */
export const resolveVersionEntry = (
  versions: ReadonlyArray<VersionEntry>,
  versionRange: Option.Option<string>,
): Option.Option<VersionEntry> => {
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
