import { PlanPolicyIds, type PlanPolicyId } from "@agentxm/client-core/unstable/plan";

export type MutationExecutionInventoryEntry =
  | {
      readonly family: string;
      readonly commands: ReadonlyArray<string>;
      readonly classification: "shared-plan-policy";
    }
  | {
      readonly family: string;
      readonly commands: ReadonlyArray<string>;
      readonly classification: "audited-non-plan-exception";
      readonly rationale: string;
    };

/**
 * Maintained audit of public mutation families that either cross the shared
 * candidate policy boundary or intentionally do not produce a plan.
 */
export const mutationExecutionInventory = [
  {
    family: "root lifecycle",
    commands: ["install", "update", "uninstall", "publish"],
    classification: "shared-plan-policy",
  },
  {
    family: "per-type lifecycle",
    commands: ["<type> install", "<type> update", "<type> uninstall", "<type> publish"],
    classification: "shared-plan-policy",
  },
  {
    family: "membership and activation",
    commands: [
      "agents add/remove",
      "packs add/remove/unpack/enable/disable",
      "mcps enable/disable/import",
      "rules enable/disable/instructions",
      "hooks enable/disable",
      "subagents enable/disable",
    ],
    classification: "shared-plan-policy",
  },
  {
    family: "local authoring",
    commands: ["new", "copy", "import", "adopt", "fork", "demote"],
    classification: "shared-plan-policy",
  },
  {
    family: "workspace maintenance",
    commands: ["sync", "lint --fix"],
    classification: "shared-plan-policy",
  },
  {
    family: "workspace initialization",
    commands: ["setup"],
    classification: "audited-non-plan-exception",
    rationale:
      "Setup is an initialization state machine with input prompts; it does not construct or consume a mutation plan.",
  },
] as const satisfies ReadonlyArray<MutationExecutionInventoryEntry>;

export const mutationPolicyFlagInventory = {
  "ignore-version-constraints": "--ignore-version-constraints",
  "accept-warnings": "--accept-warnings",
} as const satisfies Record<PlanPolicyId, string>;

export const mutationPolicyIds = PlanPolicyIds;
