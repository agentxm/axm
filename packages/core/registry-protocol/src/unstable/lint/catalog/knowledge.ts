import type { KnowledgeRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { knowledgeEnvelopeRules } from "./knowledge/envelope.js";
import { orderedEnvelopeRules } from "./shared/envelope-rules.js";
import { knowledgeDiagnosticRules } from "./knowledge/diagnostics.js";

export const knowledgeRules: ReadonlyArray<LintRule<KnowledgeRuleContext>> = [
  ...orderedEnvelopeRules(knowledgeEnvelopeRules),
  ...knowledgeDiagnosticRules,
];

export {
  knowledgeDiagnosticRuleDefinitions,
  knowledgeDiagnosticRules,
} from "./knowledge/diagnostics.js";
