import { registerLintRuleIds } from "../config.js";
import type { McpServerRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { manifestKeysRecognizedRule } from "./mcp-server/manifest-keys-recognized.js";
import { manifestPresentRule } from "./mcp-server/manifest-present.js";
import { manifestSchemaValidRule } from "./mcp-server/manifest-schema-valid.js";

export const mcpServerRules: ReadonlyArray<LintRule<McpServerRuleContext>> = [
  manifestPresentRule,
  manifestSchemaValidRule,
  manifestKeysRecognizedRule,
];

registerLintRuleIds(mcpServerRules.map((r) => r.id));
