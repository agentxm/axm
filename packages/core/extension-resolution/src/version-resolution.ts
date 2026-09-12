/**
 * Version selection under the minimum-release-age policy.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as semver from "semver";

import type {
  ReleaseAgeEvaluation,
  ReleaseAgeEvidence,
  ReleaseAgeExemption,
} from "@agentxm/extension-model/unstable/extensions/release-age";
import type { VersionEntry } from "@agentxm/registry-protocol/unstable/registry/schema";
import { resolveVersionEntry } from "@agentxm/extension-model/unstable/version-constraints/version-selection";
import {
  filterMatureVersions,
  isVersionEntryEligibleAt,
  releaseAgeEvidence,
} from "./release-age-policy.js";

/**
 * Resolve a version request against the versions that have reached the
 * minimum release age, reading the clock through the Effect environment.
 */
export const resolveVersionEntryWithReleaseAge = (
  versions: ReadonlyArray<VersionEntry>,
  versionRange: Option.Option<string>,
  minimumReleaseAge: Option.Option<Duration.Duration>,
): Effect.Effect<Option.Option<VersionEntry>> => {
  if (Option.isNone(minimumReleaseAge)) {
    return Effect.succeed(resolveVersionEntry(versions, versionRange));
  }

  return filterMatureVersions(versions, minimumReleaseAge.value).pipe(
    Effect.map((mature) => resolveVersionEntry(mature, versionRange)),
  );
};

export type ReleaseAgeVersionResolution =
  | {
      readonly kind: "selected";
      readonly version: VersionEntry;
      readonly newerHeld?: ReleaseAgeEvidence;
    }
  | {
      readonly kind: "exempted";
      readonly version: VersionEntry;
      readonly bypassed: ReleaseAgeEvidence;
      readonly exemption: ReleaseAgeExemption;
    }
  | { readonly kind: "version_unsatisfied" }
  | { readonly kind: "policy_held"; readonly candidate: ReleaseAgeEvidence };

/**
 * Resolve one visible Registry index under one caller-supplied release-age
 * evaluation. The supplied timestamp makes a complete operation deterministic.
 * An accepted version that satisfies the requested range is a lower bound for
 * unattended selection, even while that version is itself under age.
 */
export const resolveVersionEntryForReleaseAge = (
  versions: ReadonlyArray<VersionEntry>,
  versionRange: Option.Option<string>,
  evaluation: ReleaseAgeEvaluation,
  exemption?: ReleaseAgeExemption,
  acceptedVersion?: string,
): ReleaseAgeVersionResolution => {
  const otherwiseSelected = resolveVersionEntry(versions, versionRange);
  if (Option.isNone(otherwiseSelected)) {
    return { kind: "version_unsatisfied" };
  }

  const candidate = otherwiseSelected.value;
  const candidateEligible = isVersionEntryEligibleAt(candidate, evaluation);
  if (!candidateEligible && exemption !== undefined) {
    return {
      kind: "exempted",
      version: candidate,
      bypassed: releaseAgeEvidence(candidate, evaluation),
      exemption,
    };
  }

  const eligible = versions.filter((entry) => isVersionEntryEligibleAt(entry, evaluation));
  const eligibleSelection = resolveVersionEntry(eligible, versionRange);
  const accepted = versions.find((entry) => {
    if (entry.version !== acceptedVersion) return false;
    if (Option.isNone(versionRange)) return true;
    return semver.valid(versionRange.value) === versionRange.value
      ? entry.version === versionRange.value
      : semver.satisfies(entry.version, versionRange.value);
  });
  const selected =
    accepted !== undefined &&
    (Option.isNone(eligibleSelection) ||
      semver.compareBuild(accepted.version, eligibleSelection.value.version) > 0)
      ? Option.some(accepted)
      : eligibleSelection;
  if (Option.isNone(selected)) {
    return {
      kind: "policy_held",
      candidate: releaseAgeEvidence(candidate, evaluation),
    };
  }

  const selectedAcceptedFloor = accepted?.version === selected.value.version && !candidateEligible;
  return {
    kind: "selected",
    version: selected.value,
    ...(candidateEligible ||
    (candidate.version === selected.value.version && !selectedAcceptedFloor)
      ? {}
      : { newerHeld: releaseAgeEvidence(candidate, evaluation) }),
  };
};
