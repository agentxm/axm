import { HookManifestSchema, HOOK_MANIFEST_FILENAME } from "../../../hooks/manifest-schema.js";
import type { HookRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { schemaDecodeFindings } from "../shared/schema-rule.js";

const RULE_ID = "hook/manifest-schema-valid";

export const manifestSchemaValidRule: AdvisoryRule<HookRuleContext> = {
  id: RULE_ID,
  description: "hook.json defines a valid hook manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    schemaDecodeFindings(
      RULE_ID,
      "error",
      HOOK_MANIFEST_FILENAME,
      HookManifestSchema,
      context.subject.hookJson,
    ),
};
