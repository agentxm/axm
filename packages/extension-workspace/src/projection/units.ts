/**
 * Ownership-unit registry.
 *
 * Every native unit AXM can own is declared here exactly once: its extension
 * type, whether it carries one contributor or many, and how its membership is
 * decided. The conformance suite derives its aggregate coverage obligations
 * from this registry, so a new aggregate unit cannot ship without multi-route
 * contributor coverage.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";

export interface OwnershipUnitDeclaration {
  /** Stable unit identifier used by planning, facts, and conformance. */
  readonly unitId: string;
  readonly type: ExtensionType;
  /** Whether the unit carries exactly one extension or a contributor set. */
  readonly contributors: "one" | "many";
  /** Membership rule, stated over the desired-state graph. */
  readonly membership: string;
}

export const ownershipUnits = [
  {
    unitId: "skill:agent-skill-directory",
    type: "skill",
    contributors: "one",
    membership: "That Skill.",
  },
  {
    unitId: "mcp-server:native-config-entry",
    type: "mcp-server",
    contributors: "one",
    membership: "That MCP server or inline definition.",
  },
  {
    unitId: "subagent:native-profile",
    type: "subagent",
    contributors: "one",
    membership: "That Subagent.",
  },
  {
    unitId: "hook:agent-hook-entries",
    type: "hook",
    contributors: "many",
    membership: "Every active reachable Hook realized natively for that agent.",
  },
  {
    unitId: "hook:fallback-region",
    type: "hook",
    contributors: "many",
    membership: "Every active reachable Hook realized through the fallback.",
  },
  {
    unitId: "rule:instructions-region",
    type: "rule",
    contributors: "many",
    membership: "Every active reachable Rule.",
  },
  {
    unitId: "knowledge:discovery-region",
    type: "knowledge",
    contributors: "many",
    membership:
      "Every active reachable Knowledge bundle the workspace's discovery configuration permits to publish.",
  },
] as const satisfies ReadonlyArray<OwnershipUnitDeclaration>;

export type OwnershipUnitId = (typeof ownershipUnits)[number]["unitId"];
export type AggregateOwnershipUnitId = Extract<
  (typeof ownershipUnits)[number],
  { readonly contributors: "many" }
>["unitId"];
export type SingletonOwnershipUnitId = Extract<
  (typeof ownershipUnits)[number],
  { readonly contributors: "one" }
>["unitId"];

type AggregateOwnershipUnitDeclaration = Extract<
  (typeof ownershipUnits)[number],
  { readonly contributors: "many" }
>;

const isAggregateOwnershipUnit = (
  unit: (typeof ownershipUnits)[number],
): unit is AggregateOwnershipUnitDeclaration => unit.contributors === "many";

export const aggregateOwnershipUnits: ReadonlyArray<AggregateOwnershipUnitDeclaration> =
  ownershipUnits.filter(isAggregateOwnershipUnit);

/** Observation of one AXM-owned projection unit in agent-facing output. */
export interface ProjectionUnitObservation {
  readonly unitId: OwnershipUnitId;
  readonly path: string;
  /** Marker provenance owner for comment-bearing managed-region units. */
  readonly owner?: string;
  /** Whether the AXM-owned unit itself is present, not merely its surrounding file. */
  readonly present: boolean;
  /** Whether the complete expected rendering byte-for-byte matches the output. */
  readonly current: boolean;
  readonly expectedContributors: ReadonlyArray<string>;
  /** Contributor identities recovered from the output unit itself. */
  readonly observedContributors: ReadonlyArray<string>;
}
