import type { CommandRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { CommandManifestSchema } from "../../../commands/manifest-schema.js";
import { schemaDecodeFindings } from "../shared/schema-rule.js";

const RULE_ID = "command/manifest-schema-valid";
const COMMAND_JSON = "command.json";

export const manifestSchemaValidRule: AdvisoryRule<CommandRuleContext> = {
  id: RULE_ID,
  description: "command.json defines a valid command manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    schemaDecodeFindings(
      RULE_ID,
      "error",
      COMMAND_JSON,
      CommandManifestSchema,
      context.subject.commandJson,
    ),
};
