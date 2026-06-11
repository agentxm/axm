import type { SubagentRuleContext } from "../../context.js";
import { makeManifestPresentRule } from "../shared/manifest-present.js";

const RULE_ID = "subagent/manifest-present";
const SUBAGENT_JSON = "subagent.json";

export const manifestPresentRule = makeManifestPresentRule<SubagentRuleContext>({
  ruleId: RULE_ID,
  description: "Subagents include a root subagent.json manifest.",
  manifestFile: SUBAGENT_JSON,
  missingMessage:
    "subagent.json is missing. Create subagent.json with the required manifest fields (`owner`, `type`, `name`, `version`).",
});
