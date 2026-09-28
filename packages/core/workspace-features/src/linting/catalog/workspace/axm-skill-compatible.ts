import * as Effect from "effect/Effect";
import * as Result from "effect/Result";

import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryRule } from "@agentxm/extension-content/lint";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";
import {
  formatAxmSkillCompatibilityTarget,
  renderAxmSkillRecovery,
} from "@agentxm/cli-maintenance/official-skill/domain";

const RULE_ID = "workspace/axm-skill-compatible";

const finding = (message: string, file: string) => ({
  kind: "advisory" as const,
  ruleId: RULE_ID,
  severity: "error" as const,
  message,
  location: { file },
});

/**
 * Holds the official AXM skill the desired state selects to compatibility.
 * A canonical state that prevents assessment is reported once, by the rule
 * the canonical observation routes it to, not restated here.
 */
export const axmSkillCompatibleRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "The official AXM skill is compatible with the running AXM CLI.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.officialAxmSkill === undefined) return EMPTY_ADVISORY_FINDINGS;
      const result = yield* Effect.result(context.officialAxmSkill);
      if (Result.isFailure(result)) {
        return [
          finding(
            `The official AXM skill compatibility state is unreadable: ${result.failure._tag}. Repair the workspace state, then rerun lint.`,
            "axm.json",
          ),
        ];
      }
      const assessment = result.success;
      switch (assessment._tag) {
        case "undeclared":
        case "canonical-state":
          return EMPTY_ADVISORY_FINDINGS;
        case "unavailable":
          return [
            finding(
              `The official AXM skill package could not be read: ${assessment.detail}. Repair access to the package, then rerun lint.`,
              assessment.path,
            ),
          ];
        case "assessed": {
          const compatibility = assessment.compatibility;
          if (compatibility.status === "compatible") return EMPTY_ADVISORY_FINDINGS;
          const recovery = renderAxmSkillRecovery(compatibility.recovery).nextAction;
          const target = formatAxmSkillCompatibilityTarget(compatibility.recovery);
          return [
            finding(
              `${compatibility.detail ?? "The official AXM skill is incompatible with this AXM CLI."} Reason: ${compatibility.reasonCode ?? "unknown"}. Target: ${target}.${recovery === null ? "" : ` Next: \`${recovery}\`.`}`,
              assessment.path ?? "axm.json",
            ),
          ];
        }
      }
    }),
};
