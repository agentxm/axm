import type { McpServerRuleContext } from "../../context.js";
import { makeManifestPresentRule } from "../shared/manifest-present.js";

const RULE_ID = "mcp-server/manifest-present";
const MCP_SERVER_JSON = "mcp.json";

export const manifestPresentRule = makeManifestPresentRule<McpServerRuleContext>({
  ruleId: RULE_ID,
  description: "MCP servers include a root mcp.json manifest.",
  manifestFile: MCP_SERVER_JSON,
  missingMessage:
    "mcp.json is missing. Create mcp.json with the required manifest fields (`owner`, `type`, `name`, `version`).",
});
