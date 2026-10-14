/**
 * Named Registry target resolution: the index-level decision and the ordered
 * candidates a provider may verify before selecting, under one release-age
 * evaluation and the caller's accepted identity.
 *
 * The provider that owns the index (`@agentxm/workspace-kernel/sources`) consumes
 * these through its `RegistryResolutionPolicy` port, so an integration never
 * carries selection policy of its own.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";

import type {
  NamedRegistryCandidate,
  NamedRegistryFindOptions,
  NamedRegistryVersionDecision,
} from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type {
  ExtensionIndex,
  VersionEntry,
} from "@agentxm/registry-protocol/unstable/registry/schema";
import {
  isExactVersionRequest,
  normalizeVersionRequest,
} from "@agentxm/extension-model/unstable/version-constraints";
import { admittedReleases } from "@agentxm/extension-model/unstable/version-constraints/version-selection";
import {
  isVersionEntryEligibleAt,
  releaseAgeEvidence,
  releaseAgeExemptionForIdentity,
} from "./release-age-policy.js";
import { resolveVersionEntryForReleaseAge } from "./version-resolution.js";

/** The accepted version counts only when the Registry identity still matches. */
const acceptedVersionFor = (
  index: ExtensionIndex,
  options: NamedRegistryFindOptions,
): string | undefined =>
  options.accepted?.publisherBindingId === index.publisherBindingId
    ? options.accepted.version
    : undefined;

/**
 * Decide which version of a visible index a named request selects.
 */
export const decideNamedRegistryVersion = (
  index: ExtensionIndex,
  options: NamedRegistryFindOptions,
): NamedRegistryVersionDecision => {
  const exemption = releaseAgeExemptionForIdentity(options.releaseAgeEvaluation, {
    owner: index.owner,
    type: index.type,
    name: index.name,
  });
  const resolution = resolveVersionEntryForReleaseAge(
    index.versions,
    options.versionRange,
    options.releaseAgeEvaluation,
    exemption,
    acceptedVersionFor(index, options),
  );
  const newestVisible = admittedReleases(index.versions, Option.none())[0]?.version;
  const visible = newestVisible === undefined ? {} : { newestVisible };
  switch (resolution.kind) {
    case "version_unsatisfied":
      return isExactVersionRequest(normalizeVersionRequest(options.versionRange))
        ? { kind: "not_found" }
        : {
            kind: "version_unsatisfied",
            requestedRange: normalizeVersionRequest(options.versionRange),
          };
    case "policy_held":
      return {
        kind: "policy_held",
        ...(Option.isSome(options.versionRange)
          ? { requestedRange: options.versionRange.value }
          : {}),
        candidate: resolution.candidate,
      };
    case "exempted":
      return {
        kind: "exempted",
        version: resolution.version.version,
        bypassed: resolution.bypassed,
        exemption: resolution.exemption,
        ...visible,
      };
    case "selected":
      return {
        kind: "selected",
        version: resolution.version.version,
        ...(resolution.newerHeld === undefined ? {} : { newerHeld: resolution.newerHeld }),
        ...visible,
      };
  }
};

/**
 * Candidates a provider may verify one by one when selection depends on
 * archive content (the official AXM skill): selectable versions newest
 * first, then, when no exemption applies, the under-age versions that would
 * be held.
 */
export const namedRegistryCandidates = (
  index: ExtensionIndex,
  options: NamedRegistryFindOptions,
): ReadonlyArray<NamedRegistryCandidate> => {
  const evaluation = options.releaseAgeEvaluation;
  const exemption = releaseAgeExemptionForIdentity(evaluation, {
    owner: index.owner,
    type: index.type,
    name: index.name,
  });
  const acceptedVersion = acceptedVersionFor(index, options);
  const matching = admittedReleases(index.versions, options.versionRange);
  const eligible = (entry: VersionEntry) => isVersionEntryEligibleAt(entry, evaluation);

  const selectable: ReadonlyArray<NamedRegistryCandidate> = matching
    .filter(
      (entry) => exemption !== undefined || entry.version === acceptedVersion || eligible(entry),
    )
    .map((entry) => ({
      version: entry.version,
      outcome:
        exemption !== undefined && !eligible(entry)
          ? {
              kind: "exempted",
              bypassed: releaseAgeEvidence(entry, evaluation),
              exemption,
            }
          : { kind: "selected" },
    }));
  const held: ReadonlyArray<NamedRegistryCandidate> =
    exemption === undefined
      ? matching
          .filter((entry) => !eligible(entry))
          .map((entry) => ({
            version: entry.version,
            outcome: { kind: "held", candidate: releaseAgeEvidence(entry, evaluation) },
          }))
      : [];
  return [...selectable, ...held];
};
