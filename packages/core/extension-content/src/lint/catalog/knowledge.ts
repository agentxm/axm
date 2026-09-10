import type { KnowledgeRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { knowledgeEnvelopeRules } from "./knowledge/envelope.js";
import { orderedEnvelopeRules } from "./shared/envelope-rules.js";
import { knowledgeDiagnosticRules } from "./knowledge/diagnostics.js";

/**
 * Publish-safe `knowledge/*` catalog: the manifest envelope rules only. The
 * publish gate validates OKF bundle content through package validation, so
 * the inspection-backed diagnostic rules do not run there.
 */
export const publishKnowledgeRules: ReadonlyArray<LintRule<KnowledgeRuleContext>> =
  orderedEnvelopeRules(knowledgeEnvelopeRules);

export const knowledgeRules: ReadonlyArray<LintRule<KnowledgeRuleContext>> = [
  ...publishKnowledgeRules,
  ...knowledgeDiagnosticRules,
];

export {
  knowledgeDiagnosticRuleDefinitions,
  knowledgeDiagnosticRules,
} from "./knowledge/diagnostics.js";
