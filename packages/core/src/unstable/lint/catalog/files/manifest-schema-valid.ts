import { FilesManifestSchema } from "../../../files/manifest-schema.js";
import type { FilesRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { schemaDecodeFindings } from "../shared/schema-rule.js";
import { FILES_JSON } from "./helpers.js";

const RULE_ID = "files/manifest-schema-valid";

export const manifestSchemaValidRule: AdvisoryRule<FilesRuleContext> = {
  id: RULE_ID,
  description: "files.json defines a valid files manifest.",
  kind: "advisory",
  severity: "error",
  check: (files) =>
    schemaDecodeFindings(
      RULE_ID,
      "error",
      FILES_JSON,
      FilesManifestSchema,
      files.subject.filesJson,
    ),
};
