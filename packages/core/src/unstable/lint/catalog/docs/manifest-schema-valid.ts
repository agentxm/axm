import { DocsManifestSchema } from "../../../docs/manifest-schema.js";
import type { DocsRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { schemaDecodeFindings } from "../shared/schema-rule.js";
import { DOCS_JSON } from "./helpers.js";

const RULE_ID = "docs/manifest-schema-valid";

export const manifestSchemaValidRule: AdvisoryRule<DocsRuleContext> = {
  id: RULE_ID,
  description: "docs.json defines a valid docs manifest.",
  kind: "advisory",
  severity: "error",
  check: (docs) =>
    schemaDecodeFindings(RULE_ID, "error", DOCS_JSON, DocsManifestSchema, docs.subject.docsJson),
};
