import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { AgentOutputInventory } from "@agentxm/extension-workspace";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import {
  runScenario,
  SCENARIO_USER_HOME,
  SCENARIO_WORKSPACE_ROOT,
} from "@agentxm/workspace-state/testing";
import { agentsProjectionsStaleRule } from "./agents-projections-stale.js";

const output = {
  extensionType: "skill",
  containerPath: "/repo/.agents/skills",
  path: "/repo/.agents/skills/review",
  entryName: "review",
  claimantAgentIds: ["universal"],
  ownership: "owned",
  proof: "managed-banner",
  desired: false,
} as const;

const inventory = (ownedResidue: AgentOutputInventory["ownedResidue"]): AgentOutputInventory => ({
  outputs: ownedResidue,
  ownedResidue,
  unownedFootprints: [],
});

const check = (ownedResidue: AgentOutputInventory["ownedResidue"]) =>
  runScenario(
    {
      workspaceRoot: SCENARIO_WORKSPACE_ROOT,
      userHome: SCENARIO_USER_HOME,
      project: { settings: { _tag: "valid", contents: {} } },
    },
    (scenario) => {
      const context: WorkspaceRuleContext = {
        subject: { root: SCENARIO_WORKSPACE_ROOT, scope: "project" },
        workspace: scenario.scope("project"),
        axmDirExists: Effect.succeed(true),
        displayRoot: "",
        agentOutputs: Effect.succeed(inventory(ownedResidue)),
      };
      return agentsProjectionsStaleRule.check(context);
    },
  );

describe("workspace/agents-projections-stale", () => {
  it.effect("is satisfied without owned residue", () =>
    Effect.gen(function* () {
      expect(yield* check([])).toEqual([]);
    }),
  );

  it.effect("warns for an owned projection without a desired claimant", () =>
    Effect.gen(function* () {
      const findings = yield* check([output]);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("workspace/agents-projections-stale");
    }),
  );
});
