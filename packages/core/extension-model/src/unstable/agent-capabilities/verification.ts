import * as Schema from "effect/Schema";
import {
  AxmSupportSchema,
  LastVerifiedDateSchema,
  type Agent,
  type AgentExtensionCapability,
  type PermissionsExtensionCapability,
} from "./schema.js";

/** @experimental This API is unstable and may change without notice. */
export const CAPABILITY_VERIFICATION_BUDGET_DAYS = {
  skill: 90,
  "mcp-server": 90,
  subagent: 90,
  hook: 90,
  rule: 90,
  permissions: 90,
} as const;

/** @experimental This API is unstable and may change without notice. */
export type AgentCapabilitySlot = keyof Agent["capabilities"] | "rule" | "permissions";

/** @experimental This API is unstable and may change without notice. */
export const CapabilityVerificationAgeSchema = Schema.Struct({
  agentId: Schema.String,
  capability: Schema.Literals(["skill", "mcp-server", "subagent", "hook", "rule", "permissions"]),
  status: AxmSupportSchema,
  legacyLastVerified: Schema.NullOr(LastVerifiedDateSchema),
  legacyAgeDays: Schema.NullOr(Schema.Number),
  reviewedAt: Schema.NullOr(LastVerifiedDateSchema),
  reviewAgeDays: Schema.NullOr(Schema.Number),
  reviewMissing: Schema.Boolean,
  verifiedAt: Schema.NullOr(LastVerifiedDateSchema),
  verificationAgeDays: Schema.NullOr(Schema.Number),
  verificationMissing: Schema.Boolean,
  verificationBoundary: Schema.NullOr(Schema.Literals(["configuration", "vendor-runtime"])),
  budgetDays: Schema.Number,
  reviewOverdue: Schema.Boolean,
  verificationOverdue: Schema.Boolean,
});

export type CapabilityVerificationAge = Schema.Schema.Type<typeof CapabilityVerificationAgeSchema>;

type VerifiableCapability = AgentExtensionCapability | PermissionsExtensionCapability;

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;

const capabilitySlots = (
  agent: Agent,
): ReadonlyArray<readonly [AgentCapabilitySlot, VerifiableCapability]> => [
  ["skill", agent.capabilities.skill],
  ["mcp-server", agent.capabilities["mcp-server"]],
  ["subagent", agent.capabilities.subagent],
  ["hook", agent.capabilities.hook],
  ["rule", agent.instructions],
  ["permissions", agent.permissions],
];

const ageInDays = (lastVerified: string, asOf: string): number => {
  const verifiedAt = Date.parse(`${lastVerified}T00:00:00.000Z`);
  const reportAt = Date.parse(`${asOf}T00:00:00.000Z`);
  return Math.floor((reportAt - verifiedAt) / DAY_IN_MILLISECONDS);
};

/**
 * Reports source review, execution verification and historical record age
 * independently. Missing evidence stays missing, even after a profile review.
 * Pass an ISO date explicitly so maintenance tooling is reproducible.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const capabilityVerificationAgeReport = (
  agents: ReadonlyArray<Agent>,
  asOf: string,
): ReadonlyArray<CapabilityVerificationAge> =>
  agents.flatMap((agent) =>
    capabilitySlots(agent).map(([capabilityName, capability]) => {
      const budgetDays = CAPABILITY_VERIFICATION_BUDGET_DAYS[capabilityName];
      const legacyAgeDays =
        capability.axm.lastVerified === null ? null : ageInDays(capability.axm.lastVerified, asOf);
      const reviewedAt = capability.native.review?.reviewedAt ?? null;
      const verifiedAt = capability.axm.verification?.verifiedAt ?? null;
      const reviewAgeDays = reviewedAt === null ? null : ageInDays(reviewedAt, asOf);
      const verificationAgeDays = verifiedAt === null ? null : ageInDays(verifiedAt, asOf);
      return {
        agentId: agent.id,
        capability: capabilityName,
        status: capability.axm.status,
        legacyLastVerified: capability.axm.lastVerified,
        legacyAgeDays,
        reviewedAt,
        reviewAgeDays,
        reviewMissing: reviewedAt === null,
        verifiedAt,
        verificationAgeDays,
        verificationMissing: verifiedAt === null,
        verificationBoundary: capability.axm.verification?.boundary ?? null,
        budgetDays,
        reviewOverdue: reviewAgeDays === null || reviewAgeDays > budgetDays,
        verificationOverdue:
          (capability.axm.status === "supported" || capability.axm.writer !== null) &&
          (verificationAgeDays === null || verificationAgeDays > budgetDays),
      };
    }),
  );
