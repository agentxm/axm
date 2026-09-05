/**
 * Shared invariant facts for desired extension version constraints.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as semver from "semver";
import {
  parseExtensionFqnParts,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import type {
  PackDependencyAuthority,
  PackDependencyReachability,
} from "../packs/dependency-reachability.js";
import type {
  CanonicalConstraintContributor,
  CanonicalConstraintMismatchObservation,
} from "@agentxm/workspace-state";
import type { DesiredExtensionNode } from "@agentxm/workspace-state";

export const EXTENSION_CONSTRAINT_INVARIANT_PREDICATE =
  "workspace/extension-constraints-satisfied" as const;

export interface ExtensionConstraintFactContributor extends CanonicalConstraintContributor {
  readonly authority?: PackDependencyAuthority;
}

export interface ExtensionConstraintInvariantFact {
  readonly predicate: typeof EXTENSION_CONSTRAINT_INVARIANT_PREDICATE;
  readonly subject: {
    readonly type: ExtensionType;
    readonly name: string;
    readonly identity: string;
    readonly path?: string;
  };
  readonly authority: {
    readonly source: "desired-state-graph" | "prospective-publish-selection";
    readonly locator: string;
    readonly constraints: ReadonlyArray<ExtensionConstraintFactContributor>;
  };
  readonly observation: {
    readonly status: "constraint-mismatch";
    readonly acceptedVersion?: string;
    readonly observedVersion?: string;
    readonly candidateVersion?: string;
    readonly violations?: ReadonlyArray<ExtensionConstraintFactContributor>;
  };
  readonly expectation: {
    readonly status: "satisfied";
    readonly ranges: ReadonlyArray<string>;
  };
}

export interface ProspectiveExtensionConstraintCandidate {
  readonly fqn: string;
  readonly type: ExtensionType;
  readonly version: string;
  readonly dependencies?: Readonly<Record<string, string>>;
}

const constraintContributorOrder = (
  left: ExtensionConstraintFactContributor,
  right: ExtensionConstraintFactContributor,
): number =>
  (left.dependingPack ?? "").localeCompare(right.dependingPack ?? "") ||
  left.range.localeCompare(right.range) ||
  left.location.localeCompare(right.location);

/**
 * Evaluate prospective selected versions against the locally represented Pack
 * constraints. Selected Pack manifests replace their current local declaration
 * for this fact evaluation, matching the state that a coordinated publication
 * would establish.
 */
export const makeProspectiveExtensionConstraintFacts = (args: {
  readonly candidates: ReadonlyArray<ProspectiveExtensionConstraintCandidate>;
  readonly reachability: ReadonlyArray<PackDependencyReachability>;
}): ReadonlyArray<ExtensionConstraintInvariantFact> => {
  const selectedPacks = new Map(
    args.candidates
      .filter((candidate) => candidate.type === "pack")
      .map((candidate) => [candidate.fqn, candidate]),
  );
  const recordsByMember = new Map<string, Array<PackDependencyReachability>>();
  for (const record of args.reachability) {
    const current = recordsByMember.get(record.memberFqn);
    if (current === undefined) recordsByMember.set(record.memberFqn, [record]);
    else current.push(record);
  }

  return args.candidates
    .filter((candidate) => candidate.type !== "pack")
    .flatMap((candidate): ReadonlyArray<ExtensionConstraintInvariantFact> => {
      const parsed = parseExtensionFqnParts(candidate.fqn);
      if (parsed === undefined || parsed.type !== candidate.type) return [];
      const constraints = (recordsByMember.get(candidate.fqn) ?? [])
        .flatMap((record): ReadonlyArray<ExtensionConstraintFactContributor> => {
          const selectedPack = selectedPacks.get(record.packFqn);
          const range =
            selectedPack === undefined
              ? record.constraint
              : selectedPack.dependencies?.[candidate.fqn];
          if (range === undefined) return [];
          return [
            {
              source: "pack",
              dependingPack: record.packFqn,
              range,
              location: record.manifestPath,
              authority: selectedPack === undefined ? record.packAuthority : "workspace",
            },
          ];
        })
        .sort(constraintContributorOrder);
      const violations = constraints.filter(
        (constraint) => !semver.satisfies(candidate.version, constraint.range),
      );
      if (violations.length === 0) return [];
      return [
        {
          predicate: EXTENSION_CONSTRAINT_INVARIANT_PREDICATE,
          subject: {
            type: parsed.type,
            name: parsed.name,
            identity: candidate.fqn,
          },
          authority: {
            source: "prospective-publish-selection",
            locator: `${candidate.fqn}@${candidate.version}`,
            constraints,
          },
          observation: {
            status: "constraint-mismatch",
            candidateVersion: candidate.version,
            violations,
          },
          expectation: {
            status: "satisfied",
            ranges: constraints
              .map(({ range }) => range)
              .sort((left, right) => left.localeCompare(right)),
          },
        },
      ];
    })
    .sort((left, right) => left.subject.identity.localeCompare(right.subject.identity));
};

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

const contributorText = (contributor: ExtensionConstraintFactContributor): string =>
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
    fact.observation.candidateVersion === undefined
      ? undefined
      : `candidate version=${fact.observation.candidateVersion}`,
  ].filter((part): part is string => part !== undefined);
  return [
    `fact=${fact.predicate}`,
    `${fact.subject.type} '${fact.subject.identity}' has constraint mismatch`,
    `authority=${fact.authority.source}:${fact.authority.locator}`,
    `constraints=${constraints.length === 0 ? fact.expectation.ranges.join(", ") : constraints}`,
    ...versions,
  ].join("; ");
};
