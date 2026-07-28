/**
 * `mcp-server/recommended-packs-valid` — recommended packs are bare FQNs, never
 * version-ranged specs. See `../shared/recommended-packs-rules.ts`.
 */

import type { McpServerRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { MCP_SERVER_MANIFEST_FILENAME } from "../../../mcps/manifest-schema.js";
import { makeRecommendedPacksValidRule } from "../shared/recommended-packs-rules.js";

export const recommendedPacksValidRule: AdvisoryRule<McpServerRuleContext> =
  makeRecommendedPacksValidRule<McpServerRuleContext>({
    namespace: "mcp-server",
    manifestFile: MCP_SERVER_MANIFEST_FILENAME,
    manifestJson: (context) => context.subject.mcpServerJson,
  });
