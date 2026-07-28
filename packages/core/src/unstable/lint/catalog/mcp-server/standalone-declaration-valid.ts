/**
 * `mcp-server/standalone-declaration-valid` — a manifest that opts out of standalone
 * use names the packs it needs. See `../shared/recommended-packs-rules.ts`.
 */

import type { McpServerRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { MCP_SERVER_MANIFEST_FILENAME } from "../../../mcps/manifest-schema.js";
import { makeStandaloneDeclarationValidRule } from "../shared/recommended-packs-rules.js";

export const standaloneDeclarationValidRule: AdvisoryRule<McpServerRuleContext> =
  makeStandaloneDeclarationValidRule<McpServerRuleContext>({
    namespace: "mcp-server",
    manifestFile: MCP_SERVER_MANIFEST_FILENAME,
    manifestJson: (context) => context.subject.mcpServerJson,
  });
