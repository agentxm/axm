import * as Effect from "effect/Effect";
import type { McpServerRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "mcp-server/manifest-present";
const MCP_SERVER_JSON = "mcp-server.json";

export const manifestPresentRule: AdvisoryRule<McpServerRuleContext> = {
  id: RULE_ID,
  description: "MCP servers include a root mcp-server.json manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.map(context.files.exists(MCP_SERVER_JSON), (present): ReadonlyArray<AdvisoryFinding> => {
      if (present) {
        return [];
      }
      return [
        {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message:
            "mcp-server.json is missing. Create mcp-server.json with the required manifest fields (`owner`, `type`, `name`, `version`).",
          location: { file: MCP_SERVER_JSON },
        },
      ];
    }),
};
