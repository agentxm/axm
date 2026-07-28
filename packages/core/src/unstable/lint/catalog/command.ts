import { registerLintRuleIds } from "../config.js";
import type { CommandRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { manifestKeysRecognizedRule } from "./command/manifest-keys-recognized.js";
import { manifestPresentRule } from "./command/manifest-present.js";
import { manifestSchemaValidRule } from "./command/manifest-schema-valid.js";
import { recommendedPacksValidRule } from "./command/recommended-packs-valid.js";
import { standaloneDeclarationValidRule } from "./command/standalone-declaration-valid.js";

export const commandRules: ReadonlyArray<LintRule<CommandRuleContext>> = [
  manifestPresentRule,
  manifestSchemaValidRule,
  manifestKeysRecognizedRule,
  standaloneDeclarationValidRule,
  recommendedPacksValidRule,
];

registerLintRuleIds(commandRules.map((r) => r.id));
