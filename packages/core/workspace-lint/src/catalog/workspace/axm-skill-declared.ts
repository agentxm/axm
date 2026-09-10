import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { AdvisoryRule } from "@agentxm/registry-protocol/unstable/lint/rule";
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
      if (context.axmSkillCompatibility === undefined) return EMPTY_ADVISORY_FINDINGS;
      const compatibilityResult = yield* Effect.result(context.axmSkillCompatibility);
      if (Result.isFailure(compatibilityResult) || Option.isSome(compatibilityResult.success)) {
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
