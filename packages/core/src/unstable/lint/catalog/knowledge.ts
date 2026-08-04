import { registerLintRuleIds } from "../config.js";
import type { KnowledgeRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { knowledgeEnvelopeRules } from "./knowledge/envelope.js";
import { orderedEnvelopeRules } from "./shared/envelope-rules.js";

export const knowledgeRules: ReadonlyArray<LintRule<KnowledgeRuleContext>> =
  orderedEnvelopeRules(knowledgeEnvelopeRules);

registerLintRuleIds(knowledgeRules.map((r) => r.id));
