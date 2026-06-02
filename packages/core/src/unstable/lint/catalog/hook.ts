import { registerLintRuleIds } from "../config.js";
import type { HookRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { entrypointExistsRule } from "./hook/entrypoint-exists.js";
import { manifestKeysRecognizedRule } from "./hook/manifest-keys-recognized.js";
import { manifestPresentRule } from "./hook/manifest-present.js";
import { manifestSchemaValidRule } from "./hook/manifest-schema-valid.js";

export const hookRules: ReadonlyArray<LintRule<HookRuleContext>> = [
  manifestPresentRule,
  manifestSchemaValidRule,
  manifestKeysRecognizedRule,
  entrypointExistsRule,
];

registerLintRuleIds(hookRules.map((r) => r.id));
