import * as Effect from "effect/Effect";
import type { McpServerRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { McpServerManifestSchema } from "../../../mcp-servers/manifest-schema.js";
import { enumerateUnknownTopLevelKeys, structFieldKeys } from "../shared/schema-rule.js";

const RULE_ID = "mcp-server/manifest-keys-recognized";
const MCP_SERVER_JSON = "mcp-server.json";

const allowedKeys = structFieldKeys(McpServerManifestSchema);

export const manifestKeysRecognizedRule: AdvisoryRule<McpServerRuleContext> = {
  id: RULE_ID,
  description: "mcp-server.json uses only supported top-level fields.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.succeed(
      enumerateUnknownTopLevelKeys(
        RULE_ID,
        "error",
        MCP_SERVER_JSON,
        allowedKeys,
        context.subject.mcpServerJson,
      ),
    ),
};
