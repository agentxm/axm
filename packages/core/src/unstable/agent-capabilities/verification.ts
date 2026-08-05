import type { Agent, AgentExtensionCapability, PermissionsExtensionCapability } from "./schema.js";

/** @experimental This API is unstable and may change without notice. */
export const CAPABILITY_VERIFICATION_BUDGET_DAYS = {
  skill: 90,
} as const;

/** @experimental This API is unstable and may change without notice. */
export type AgentCapabilitySlot = keyof Agent["capabilities"] | "rule" | "permissions";

/** @experimental This API is unstable and may change without notice. */
export interface CapabilityVerificationAge {
  readonly agentId: string;
  readonly capability: AgentCapabilitySlot;
  readonly status: AgentExtensionCapability["axm"]["status"];
  readonly lastVerified: string | null;
  readonly ageDays: number | null;
  readonly budgetDays: number | null;
  readonly overdue: boolean;
}

type VerifiableCapability = AgentExtensionCapability | PermissionsExtensionCapability;

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;

const capabilitySlots = (
  agent: Agent,
): ReadonlyArray<readonly [AgentCapabilitySlot, VerifiableCapability]> => [
  ["skill", agent.capabilities.skill],
  ["command", agent.capabilities.command],
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
 * Reports verification age for every catalog capability independently. Pass an
 * ISO date explicitly so CI and maintenance tooling produce reproducible output.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const capabilityVerificationAgeReport = (
  agents: ReadonlyArray<Agent>,
  asOf: string,
): ReadonlyArray<CapabilityVerificationAge> =>
  agents.flatMap((agent) =>
    capabilitySlots(agent).map(([capabilityName, capability]) => {
      const budgetDays =
        capabilityName === "skill" ? CAPABILITY_VERIFICATION_BUDGET_DAYS.skill : null;
      const ageDays =
        capability.axm.lastVerified === null ? null : ageInDays(capability.axm.lastVerified, asOf);
      return {
        agentId: agent.id,
        capability: capabilityName,
        status: capability.axm.status,
        lastVerified: capability.axm.lastVerified,
        ageDays,
        budgetDays,
        overdue:
          capability.axm.status === "supported" &&
          budgetDays !== null &&
          (ageDays === null || ageDays > budgetDays),
      };
    }),
  );
