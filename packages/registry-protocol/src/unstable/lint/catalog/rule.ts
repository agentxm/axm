import type { RuleRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { ruleEnvelopeRules } from "./rule/envelope.js";
import { orderedEnvelopeRules } from "./shared/envelope-rules.js";

export const ruleRules: ReadonlyArray<LintRule<RuleRuleContext>> =
  orderedEnvelopeRules(ruleEnvelopeRules);
