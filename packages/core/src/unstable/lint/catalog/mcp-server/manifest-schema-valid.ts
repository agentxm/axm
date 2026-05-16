import type { McpServerRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { McpServerManifestSchema } from "../../../mcp-servers/manifest-schema.js";
import { schemaDecodeFindings } from "../shared/schema-rule.js";

const RULE_ID = "mcp-server/manifest-schema-valid";
const MCP_SERVER_JSON = "mcp-server.json";

export const manifestSchemaValidRule: AdvisoryRule<McpServerRuleContext> = {
  id: RULE_ID,
  description: "mcp-server.json defines a valid MCP server manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    schemaDecodeFindings(
      RULE_ID,
      "error",
      MCP_SERVER_JSON,
      McpServerManifestSchema,
      context.subject.mcpServerJson,
    ),
};
