import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import type { AdvisoryRule } from "@agentxm/extension-content/lint";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/axm-skill-declared";

export const axmSkillDeclaredRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "The workspace declares the official AXM skill.",
  kind: "advisory",
  severity: "info",
  check: (context) =>
    Effect.gen(function* () {
      if (context.officialAxmSkill === undefined) return EMPTY_ADVISORY_FINDINGS;
      const assessment = yield* Effect.result(context.officialAxmSkill);
      if (Result.isFailure(assessment) || assessment.success._tag !== "undeclared") {
        return EMPTY_ADVISORY_FINDINGS;
      }
      return [
        {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "info",
          message:
            "This workspace does not declare the official AXM skill. Install it with `axm skills install @agentxm/skills/axm --bundled`.",
          location: { file: "axm.json" },
        },
      ];
    }),
};
