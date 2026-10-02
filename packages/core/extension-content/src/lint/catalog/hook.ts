import type { HookRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { entrypointExistsRule } from "./hook/entrypoint-exists.js";
import { hookEnvelopeRules } from "./hook/envelope.js";
import { nativeBindingsSupportedRule } from "./hook/native-bindings-supported.js";

export const hookRules: ReadonlyArray<LintRule<HookRuleContext>> = [
  hookEnvelopeRules.manifestPresent,
  hookEnvelopeRules.manifestSchemaValid,
  hookEnvelopeRules.manifestKeysRecognized,
  nativeBindingsSupportedRule,
  entrypointExistsRule,
  hookEnvelopeRules.standaloneDeclarationValid,
  hookEnvelopeRules.recommendedPacksValid,
];
