import { registerLintRuleIds } from "../config.js";
import type { HookRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { entrypointExistsRule } from "./hook/entrypoint-exists.js";
import { decisionPortabilityRule } from "./hook/decision-portability.js";
import { hookEnvelopeRules } from "./hook/envelope.js";
import { matcherRawPortabilityRule } from "./hook/matcher-raw-portability.js";

export const hookRules: ReadonlyArray<LintRule<HookRuleContext>> = [
  hookEnvelopeRules.manifestPresent,
  hookEnvelopeRules.manifestSchemaValid,
  hookEnvelopeRules.manifestKeysRecognized,
  decisionPortabilityRule,
  matcherRawPortabilityRule,
  entrypointExistsRule,
  hookEnvelopeRules.standaloneDeclarationValid,
  hookEnvelopeRules.recommendedPacksValid,
];

registerLintRuleIds(hookRules.map((r) => r.id));
