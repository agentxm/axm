/** `workspace/agents-projections-stale` — AXM-owned agent output has no desired claimant. */

import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/registry-protocol/unstable/lint/rule";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/agents-projections-stale";

export const agentsProjectionsStaleRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "AXM-owned agent projections have a desired claimant and expected unit name.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    context.agentOutputs === undefined
      ? Effect.succeed(EMPTY_ADVISORY_FINDINGS)
      : context.agentOutputs.pipe(
          Effect.map((inventory) =>
            inventory.ownedResidue.map((output): AdvisoryFinding => ({
              kind: "advisory",
              ruleId: RULE_ID,
              severity: "warning",
              message: `AXM-owned ${output.extensionType} projection '${output.entryName}' is no longer desired.`,
              location: { file: output.path },
            })),
          ),
        ),
};
