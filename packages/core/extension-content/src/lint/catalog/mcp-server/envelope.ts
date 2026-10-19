/**
 * `mcp-server/*` manifest envelope — see `../shared/envelope-rules.ts`.
 */

import { McpServerManifestSchema } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import type { ManifestRuleContext, McpServerContent } from "../../context.js";
import { makeManifestEnvelopeRules } from "../shared/envelope-rules.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

export const mcpServerEnvelopeRules = makeManifestEnvelopeRules({
  namespace: "mcp-server",
  manifestFile: manifestFilenameForType("mcp-server"),
  schema: McpServerManifestSchema,
  manifestJson: (context: ManifestRuleContext<McpServerContent>) => context.subject.mcpServerJson,
  presentDescription: "MCP servers include a root mcp.json manifest.",
  presentMissingMessage:
    "mcp.json is missing. Create mcp.json with the required manifest fields (`owner`, `type`, `name`, `version`).",
  schemaDescription: "mcp.json defines a valid MCP server manifest.",
});
