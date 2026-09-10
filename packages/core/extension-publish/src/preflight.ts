import * as Effect from "effect/Effect";

import { formatFqn, type Handle } from "@agentxm/extension-model/unstable/extensions";
import type { Version } from "@agentxm/extension-model/unstable/version-constraints";
import {
  extensionConstraintFactText,
  type ExtensionConstraintInvariantFact,
  type PackDependencyReachability,
} from "@agentxm/extension-workspace";
import type { PublicationPackResult } from "@agentxm/registry-protocol/unstable/registry";
import type { RegistryClient, RegistryClientFailure } from "@agentxm/registry-client";
import { PublishFailed } from "./errors.js";
import type { PublishableType } from "./publishable-types.js";

export const alreadyPublishedVersionConflict = (args: {
  readonly fqn: string;
  readonly version: Version;
}): PublishFailed =>
  new PublishFailed({
    category: "conflict",
    detail: `Cannot publish: version ${args.version} is already published for ${args.fqn}. Published versions are immutable.`,
    suggestions: [
      {
        description: "Bump the manifest version.",
        cmd: `axm version ${args.fqn} patch`,
      },
      {
        description:
          "Re-run with --on-existing verify only when the local archive should be byte-equivalent to the published version.",
      },
    ],
  });

export const nonMonotonicVersionConflict = (args: {
  readonly fqn: string;
  readonly version: Version;
  readonly highestPublished: Version;
}): PublishFailed =>
  new PublishFailed({
    category: "conflict",
    detail: `Cannot publish: version ${args.version} is lower than the highest published version ${args.highestPublished} for ${args.fqn}.`,
    suggestions: [
      {
        description: "Bump the manifest version.",
        cmd: `axm version ${args.fqn} patch`,
      },
      {
        description:
          "Re-run with --backfill only if publishing an older unpublished version is intentional.",
      },
    ],
  });

/** Every publish owner must already exist before any candidate uploads. */
export const validatePublishOwners = (
  owners: ReadonlyArray<Handle>,
  client: Pick<RegistryClient, "ownerExists">,
): Effect.Effect<void, PublishFailed | RegistryClientFailure> =>
  Effect.forEach(
    [...new Set(owners)],
    (owner) =>
      client.ownerExists(owner).pipe(
        Effect.flatMap(({ exists }) =>
          exists
            ? Effect.void
            : new PublishFailed({
                category: "not_found",
                detail: `Publish owner ${owner} does not exist.`,
                suggestions: [
                  {
                    description: "Create the organization in AgentXM before publishing.",
                    url: "https://agentxm.ai/orgs/new",
                  },
                ],
              }),
        ),
      ),
    { concurrency: 4, discard: true },
  );

/** One suggested follow-up carried by a publish advisory finding. */
export interface PublishAdvisorySuggestion {
  readonly description: string;
  readonly cmd?: string;
  readonly url?: string;
}

/** A non-gating structured warning observed during publication. */
export interface PublishAdvisoryFinding {
  readonly ruleId: string;
  readonly severity: "warning";
  readonly message: string;
  readonly suggestions: ReadonlyArray<PublishAdvisorySuggestion>;
}

/** The local constraint facts one selected candidate contributes. */
export interface LocalPackConstraintCandidate {
  readonly fqn: string;
  readonly type: PublishableType;
  readonly authored: boolean;
}

export const findPackPublishDivergenceFindings = (args: {
  readonly candidates: ReadonlyArray<LocalPackConstraintCandidate>;
  readonly reachability: ReadonlyArray<PackDependencyReachability>;
  readonly packs: ReadonlyArray<PublicationPackResult>;
}): ReadonlyMap<string, ReadonlyArray<PublishAdvisoryFinding>> => {
  const authoredPacks = new Set(
    args.candidates
      .filter((candidate) => candidate.authored && candidate.type === "pack")
      .map((candidate) => candidate.fqn),
  );
  const localByPair = new Map(
    args.reachability.map((record) => [`${record.packFqn}\u0000${record.memberFqn}`, record]),
  );
  const findings = new Map<string, Array<PublishAdvisoryFinding>>();
  for (const pack of args.packs) {
    if (pack.status !== "admitted") continue;
    const packFqn = formatFqn(pack.target);
    if (!authoredPacks.has(packFqn)) continue;
    for (const resolution of pack.resolutions) {
      const memberFqn = formatFqn(resolution.dependency);
      const local = localByPair.get(`${packFqn}\u0000${memberFqn}`);
      if (
        local?.classification !== "satisfying" ||
        local.memberVersion === undefined ||
        local.memberVersion === resolution.effectiveVersion
      ) {
        continue;
      }
      const finding: PublishAdvisoryFinding = {
        ruleId: "pack/publish-resolution-divergence",
        severity: "warning",
        message: `${packFqn} resolves ${memberFqn}@${local.memberVersion} in this workspace, while Registry consumers resolve ${memberFqn}@${resolution.effectiveVersion} within ${resolution.dependency.range}.`,
        suggestions: [
          local.memberAuthority === "workspace"
            ? {
                description: `Publish ${memberFqn} before publishing the pack if consumers should receive the workspace version`,
                cmd: `axm publish ${memberFqn}`,
              }
            : {
                description: `Update ${memberFqn} if this workspace should match Registry consumers`,
                cmd: `axm update ${memberFqn}`,
              },
        ],
      };
      const current = findings.get(packFqn);
      if (current === undefined) findings.set(packFqn, [finding]);
      else current.push(finding);
    }
  }
  return new Map(
    [...findings.entries()].map(([packFqn, values]) => [
      packFqn,
      [...values].sort((left, right) => left.message.localeCompare(right.message)),
    ]),
  );
};

/** Local Pack-constraint exclusions that block a member's publication. */
export const localPackConstraintFailures = (
  facts: ReadonlyArray<ExtensionConstraintInvariantFact>,
): ReadonlyMap<string, PublishFailed> => {
  return new Map(
    facts.map((fact) => {
      const memberFqn = fact.subject.identity;
      const memberVersion = fact.observation.candidateVersion ?? "unknown";
      const violations = fact.observation.violations ?? [];
      return [
        memberFqn,
        new PublishFailed({
          category: "validation",
          detail: `${extensionConstraintFactText(fact)}; ${memberFqn}@${memberVersion} is excluded by the current workspace Pack constraints: ${violations
            .map(
              (constraint) =>
                `${constraint.dependingPack ?? "unknown Pack"} declares ${constraint.range}`,
            )
            .join("; ")}`,
          suggestions: violations.flatMap((constraint) =>
            constraint.authority === "workspace"
              ? [
                  {
                    description: `Replace ${constraint.dependingPack ?? "the Pack"}'s constraint with the selected version, then publish the member and pack together`,
                    cmd: `axm packs add ${constraint.dependingPack ?? "<name>"} ${memberFqn}`,
                  },
                ]
              : [
                  {
                    description: `Update ${constraint.dependingPack ?? "the Pack"} if its owner has published a compatible constraint`,
                    cmd: `axm update ${constraint.dependingPack ?? "<extension[@version]>"}`,
                  },
                  {
                    description: `Otherwise stop workspace authority from shadowing ${memberFqn}`,
                  },
                ],
          ),
        }),
      ];
    }),
  );
};
