import { ContextFilesManifestSchema } from "../../../context-files/manifest-schema.js";
import type { ContextFilesRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { schemaDecodeFindings } from "../shared/schema-rule.js";
import { CONTEXT_FILES_JSON } from "./helpers.js";

const RULE_ID = "context-files/manifest-schema-valid";

export const manifestSchemaValidRule: AdvisoryRule<ContextFilesRuleContext> = {
  id: RULE_ID,
  description: "context-files.json defines a valid context files manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    schemaDecodeFindings(
      RULE_ID,
      "error",
      CONTEXT_FILES_JSON,
      ContextFilesManifestSchema,
      context.subject.contextFilesJson,
    ),
};
