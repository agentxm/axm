/**
 * Currency assessment for a single extension version.
 *
 * Compares an installed version against the versions available in an
 * ExtensionIndex, respecting an optional version constraint.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import * as semver from "semver";

import type { Version } from "../../version-constraints/version-constraints.js";
import { resolveVersionInRange } from "../../version-constraints/version-constraints.js";
import { selectVersion } from "../../registry/utils.js";
import type { ExtensionIndex } from "../../registry/schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Currency status for a single extension.
 *
 * - `current` — installed version matches the latest satisfying version.
 * - `update-available` — a newer version exists within the same major line.
 * - `major-update-available` — a newer major version exists.
 */
export type CurrencyStatus = "current" | "update-available" | "major-update-available";

/**
 * Result of a currency check for a single extension.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface CurrencyResult {
  readonly status: CurrencyStatus;
  readonly installedVersion: Version;
  /** Latest version satisfying the declared constraint. None when no version satisfies. */
  readonly latestMatching: Option.Option<Version>;
  /** Absolute latest version in the index (regardless of constraint). */
  readonly latestAvailable: Version;
}

// ---------------------------------------------------------------------------
// Logic
// ---------------------------------------------------------------------------

/**
 * Assess version currency for a single extension.
 *
 * @param installedVersion - Currently installed version.
 * @param constraint - Optional version constraint from settings (e.g. `^1.0.0`).
 * @param index - Extension index containing all available versions (newest-first).
 */
export const checkCurrency = (
  installedVersion: Version,
  constraint: Option.Option<string>,
  index: ExtensionIndex,
): CurrencyResult => {
  const latestEntry = selectVersion(index.versions);
  // The index should always have at least one version; fall back to installed.
  const latestAvailable = Option.match(latestEntry, {
    onNone: () => installedVersion,
    onSome: (entry) => entry.version,
  });

  const matchingEntry = resolveVersionInRange(index.versions, constraint);
  const latestMatching = Option.map(matchingEntry, (entry) => entry.version);

  const status = determineStatus(installedVersion, latestMatching, latestAvailable);

  return { status, installedVersion, latestMatching, latestAvailable };
};

const determineStatus = (
  installed: Version,
  latestMatching: Option.Option<Version>,
  latestAvailable: Version,
): CurrencyStatus => {
  const installedMajor = semver.major(installed);
  const availableMajor = semver.major(latestAvailable);

  if (!semver.gt(latestAvailable, installed)) {
    return "current";
  }

  if (availableMajor > installedMajor) {
    return "major-update-available";
  }

  if (Option.isNone(latestMatching)) {
    // No matching version found — treat as update-available since latest is same major.
    return "update-available";
  }

  if (semver.gt(latestMatching.value, installed)) {
    return "update-available";
  }

  return "current";
};
