import type { SubagentRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { orderedEnvelopeRules } from "./shared/envelope-rules.js";
import { subagentEnvelopeRules } from "./subagent/envelope.js";

export const subagentRules: ReadonlyArray<LintRule<SubagentRuleContext>> =
  orderedEnvelopeRules(subagentEnvelopeRules);
