import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/axm-skill-compatible";
const RECOVERY = "axm skills install @agentxm/skills/axm --bundled --preview";

export const axmSkillCompatibleRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "The official AXM skill is compatible with the running AXM CLI.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.axmSkillCompatibility === undefined) return EMPTY_ADVISORY_FINDINGS;
      const compatibility = yield* context.axmSkillCompatibility;
      if (compatibility.status === "compatible") return EMPTY_ADVISORY_FINDINGS;
      return [
        {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message: `${compatibility.detail ?? "The official AXM skill is incompatible with this AXM CLI."} Run \`${RECOVERY}\` to preview installation of the bundled compatible release.`,
          location: { file: ".axm/extensions/@agentxm/skills/axm" },
        },
      ];
    }),
};
