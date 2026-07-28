import { registerLintRuleIds } from "../config.js";
import type { SubagentRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { manifestKeysRecognizedRule } from "./subagent/manifest-keys-recognized.js";
import { manifestPresentRule } from "./subagent/manifest-present.js";
import { manifestSchemaValidRule } from "./subagent/manifest-schema-valid.js";
import { recommendedPacksValidRule } from "./subagent/recommended-packs-valid.js";
import { standaloneDeclarationValidRule } from "./subagent/standalone-declaration-valid.js";

export const subagentRules: ReadonlyArray<LintRule<SubagentRuleContext>> = [
  manifestPresentRule,
  manifestSchemaValidRule,
  manifestKeysRecognizedRule,
  standaloneDeclarationValidRule,
  recommendedPacksValidRule,
];

registerLintRuleIds(subagentRules.map((r) => r.id));
