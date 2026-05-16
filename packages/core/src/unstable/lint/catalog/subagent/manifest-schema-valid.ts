import type { SubagentRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { SubagentManifestSchema } from "../../../subagents/manifest-schema.js";
import { schemaDecodeFindings } from "../shared/schema-rule.js";

const RULE_ID = "subagent/manifest-schema-valid";
const SUBAGENT_JSON = "subagent.json";

export const manifestSchemaValidRule: AdvisoryRule<SubagentRuleContext> = {
  id: RULE_ID,
  description: "subagent.json defines a valid subagent manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    schemaDecodeFindings(
      RULE_ID,
      "error",
      SUBAGENT_JSON,
      SubagentManifestSchema,
      context.subject.subagentJson,
    ),
};
