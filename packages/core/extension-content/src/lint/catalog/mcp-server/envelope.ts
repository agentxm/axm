/**
 * `mcp-server/*` manifest envelope — see `../shared/envelope-rules.ts`.
 */

import {
  McpServerManifestSchema,
  MCP_SERVER_MANIFEST_FILENAME,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import type { McpServerRuleContext } from "../../context.js";
import { makeManifestEnvelopeRules } from "../shared/envelope-rules.js";

export const mcpServerEnvelopeRules = makeManifestEnvelopeRules({
  namespace: "mcp-server",
  manifestFile: MCP_SERVER_MANIFEST_FILENAME,
  schema: McpServerManifestSchema,
  manifestJson: (context: McpServerRuleContext) => context.subject.mcpServerJson,
  presentDescription: "MCP servers include a root mcp.json manifest.",
  presentMissingMessage:
    "mcp.json is missing. Create mcp.json with the required manifest fields (`owner`, `type`, `name`, `version`).",
  schemaDescription: "mcp.json defines a valid MCP server manifest.",
});
