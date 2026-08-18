import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { formatAxmSkillCompatibilityTarget } from "../../../skills/axm-skill-compatibility.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/axm-skill-compatible";

export const axmSkillCompatibleRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "The official AXM skill is compatible with the running AXM CLI.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.axmSkillCompatibility === undefined) return EMPTY_ADVISORY_FINDINGS;
      const compatibilityResult = yield* Effect.result(context.axmSkillCompatibility);
      if (Result.isFailure(compatibilityResult)) {
        return [
          {
            kind: "advisory" as const,
            ruleId: RULE_ID,
            severity: "error" as const,
            message: `The official AXM skill compatibility state is unreadable: ${compatibilityResult.failure._tag}. Repair the workspace state, then rerun lint.`,
            location: { file: ".axm" },
          },
        ];
      }
      const compatibility = compatibilityResult.success;
      if (compatibility.status === "compatible") return EMPTY_ADVISORY_FINDINGS;
      const recovery = compatibility.recovery.nextAction;
      const target = formatAxmSkillCompatibilityTarget(compatibility.recovery);
      return [
        {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message: `${compatibility.detail ?? "The official AXM skill is incompatible with this AXM CLI."} Reason: ${compatibility.reasonCode ?? "unknown"}. Target: ${target}.${recovery === null ? "" : ` Next: \`${recovery}\`.`}`,
          location: { file: ".axm/extensions/@agentxm/skills/axm" },
        },
      ];
    }),
};
