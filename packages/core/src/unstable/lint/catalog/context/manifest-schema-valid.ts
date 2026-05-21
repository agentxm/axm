import { ContextManifestSchema } from "../../../context/manifest-schema.js";
import type { ContextRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { schemaDecodeFindings } from "../shared/schema-rule.js";
import { CONTEXT_JSON } from "./helpers.js";

const RULE_ID = "context/manifest-schema-valid";

export const manifestSchemaValidRule: AdvisoryRule<ContextRuleContext> = {
  id: RULE_ID,
  description: "context.json defines a valid context manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    schemaDecodeFindings(
      RULE_ID,
      "error",
      CONTEXT_JSON,
      ContextManifestSchema,
      context.subject.contextJson,
    ),
};
