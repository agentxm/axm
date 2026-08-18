/**
 * Shared invariant facts for desired extension version constraints.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as semver from "semver";
import type { ExtensionType } from "../extensions/index.js";
import type {
  CanonicalConstraintContributor,
  CanonicalConstraintMismatchObservation,
} from "../workspace/canonical-observation.js";
import type { DesiredExtensionNode } from "../workspace/desired-state-graph.js";

export const EXTENSION_CONSTRAINT_INVARIANT_PREDICATE =
  "workspace/extension-constraints-satisfied" as const;

export interface ExtensionConstraintInvariantFact {
  readonly predicate: typeof EXTENSION_CONSTRAINT_INVARIANT_PREDICATE;
  readonly subject: {
    readonly type: ExtensionType;
    readonly name: string;
    readonly identity: string;
    readonly path?: string;
  };
  readonly authority: {
    readonly source: "desired-state-graph";
    readonly locator: string;
    readonly constraints: ReadonlyArray<CanonicalConstraintContributor>;
  };
  readonly observation: {
    readonly status: "constraint-mismatch";
    readonly acceptedVersion?: string;
    readonly observedVersion?: string;
  };
  readonly expectation: {
    readonly status: "satisfied";
    readonly ranges: ReadonlyArray<string>;
  };
}

export type ExtensionConstraintPlanningDecision =
  | {
      readonly readiness: "ready";
      readonly reason: "satisfying-version-resolved";
      readonly version: string;
    }
  | {
      readonly readiness: "blocked";
      readonly reason: "no-satisfying-version" | "candidate-violates-constraints";
      readonly candidateVersion?: string;
    };

export const makeExtensionConstraintInvariantFact = (
  desired: DesiredExtensionNode,
  observation: CanonicalConstraintMismatchObservation,
): ExtensionConstraintInvariantFact => ({
  predicate: EXTENSION_CONSTRAINT_INVARIANT_PREDICATE,
  subject: {
    type: desired.type,
    name: desired.name,
    identity: desired.identity.replace(/^workspace:/, ""),
    ...(observation.path === undefined ? {} : { path: observation.path }),
  },
  authority: {
    source: observation.authority.source,
    locator: observation.authority.locator,
    constraints: observation.authority.constraints,
  },
  observation: {
    status: observation.status,
    ...(observation.acceptedVersion === undefined
      ? {}
      : { acceptedVersion: observation.acceptedVersion }),
    ...(observation.observedVersion === undefined
      ? {}
      : { observedVersion: observation.observedVersion }),
  },
  expectation: {
    status: "satisfied",
    ranges: [...desired.constraints].sort((left, right) => left.localeCompare(right)),
  },
});

export const planExtensionConstraintFact = (
  fact: ExtensionConstraintInvariantFact,
  candidateVersion: string | undefined,
): ExtensionConstraintPlanningDecision => {
  if (candidateVersion === undefined) {
    return { readiness: "blocked", reason: "no-satisfying-version" };
  }
  if (
    fact.expectation.ranges.every((constraint) => semver.satisfies(candidateVersion, constraint))
  ) {
    return {
      readiness: "ready",
      reason: "satisfying-version-resolved",
      version: candidateVersion,
    };
  }
  return {
    readiness: "blocked",
    reason: "candidate-violates-constraints",
    candidateVersion,
  };
};

const contributorText = (contributor: CanonicalConstraintContributor): string =>
  contributor.source === "pack"
    ? `${contributor.dependingPack ?? "unknown Pack"} range=${contributor.range} location=${contributor.location}`
    : `settings range=${contributor.range} location=${contributor.location}`;

/** Stable human and machine-display detail shared by lint and sync. */
export const extensionConstraintFactText = (fact: ExtensionConstraintInvariantFact): string => {
  const constraints = fact.authority.constraints.map(contributorText).join(", ");
  const versions = [
    fact.observation.acceptedVersion === undefined
      ? undefined
      : `accepted version=${fact.observation.acceptedVersion}`,
    fact.observation.observedVersion === undefined
      ? undefined
      : `observed version=${fact.observation.observedVersion}`,
  ].filter((part): part is string => part !== undefined);
  return [
    `fact=${fact.predicate}`,
    `${fact.subject.type} '${fact.subject.identity}' has constraint mismatch`,
    `authority=${fact.authority.source}:${fact.authority.locator}`,
    `constraints=${constraints.length === 0 ? fact.expectation.ranges.join(", ") : constraints}`,
    ...versions,
  ].join("; ");
};
