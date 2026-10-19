import type { ManifestRuleContext, McpServerContent } from "../context.js";
import type { LintRule } from "../rule.js";
import { mcpServerEnvelopeRules } from "./mcp-server/envelope.js";
import { orderedEnvelopeRules } from "./shared/envelope-rules.js";

export const mcpServerRules: ReadonlyArray<LintRule<ManifestRuleContext<McpServerContent>>> =
  orderedEnvelopeRules(mcpServerEnvelopeRules);
