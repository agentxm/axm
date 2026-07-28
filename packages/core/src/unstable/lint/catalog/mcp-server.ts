import { registerLintRuleIds } from "../config.js";
import type { McpServerRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { manifestKeysRecognizedRule } from "./mcp-server/manifest-keys-recognized.js";
import { manifestPresentRule } from "./mcp-server/manifest-present.js";
import { manifestSchemaValidRule } from "./mcp-server/manifest-schema-valid.js";
import { recommendedPacksValidRule } from "./mcp-server/recommended-packs-valid.js";
import { standaloneDeclarationValidRule } from "./mcp-server/standalone-declaration-valid.js";

export const mcpServerRules: ReadonlyArray<LintRule<McpServerRuleContext>> = [
  manifestPresentRule,
  manifestSchemaValidRule,
  manifestKeysRecognizedRule,
  standaloneDeclarationValidRule,
  recommendedPacksValidRule,
];

registerLintRuleIds(mcpServerRules.map((r) => r.id));
