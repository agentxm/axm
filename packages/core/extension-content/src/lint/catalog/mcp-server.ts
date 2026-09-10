import type { McpServerRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { mcpServerEnvelopeRules } from "./mcp-server/envelope.js";
import { orderedEnvelopeRules } from "./shared/envelope-rules.js";

export const mcpServerRules: ReadonlyArray<LintRule<McpServerRuleContext>> =
  orderedEnvelopeRules(mcpServerEnvelopeRules);
