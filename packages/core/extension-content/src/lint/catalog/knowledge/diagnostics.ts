import * as Effect from "effect/Effect";

import { KNOWLEDGE_SOURCE_DIR } from "@agentxm/extension-model/unstable/knowledge";
import {
  KNOWLEDGE_DIAGNOSTIC_CLASSIFICATIONS,
  KNOWLEDGE_DIAGNOSTIC_CODES,
  KNOWLEDGE_DIAGNOSTIC_SEVERITIES,
  type KnowledgeDiagnosticCode,
  type KnowledgeDiagnosticSeverity,
} from "../../../knowledge/index.js";
import type { KnowledgeRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

interface DiagnosticRuleDefinition {
  readonly code: KnowledgeDiagnosticCode;
  readonly severity: KnowledgeDiagnosticSeverity;
}

/** The rule set a diagnostic code checks, as its lint rule states it. */
const ruleSetClause = (code: KnowledgeDiagnosticCode): string => {
  const classification = KNOWLEDGE_DIAGNOSTIC_CLASSIFICATIONS[code];
  switch (classification.ruleSet) {
    case "okf-conformance":
      return `an OKF conformance check of ${classification.conformanceRule}`;
    case "agentxm-profile":
      return "an AgentXM profile check";
    case "registry-safety":
      return "a Registry safety check";
  }
};

const makeDiagnosticRule = (
  definition: DiagnosticRuleDefinition,
): AdvisoryRule<KnowledgeRuleContext> => {
  const ruleId = `knowledge/${definition.code}`;
  return {
    id: ruleId,
    description: `Knowledge packages satisfy the ${definition.code} diagnostic invariant, ${ruleSetClause(definition.code)}.`,
    kind: "advisory",
    severity: definition.severity,
    check: (context) => {
      const diagnostics = context.subject.inspection?.diagnostics ?? [];
      const findings: ReadonlyArray<AdvisoryFinding> = diagnostics
        .filter((diagnostic) => diagnostic.code === definition.code)
        .map((diagnostic) => ({
          kind: "advisory",
          ruleId,
          severity: definition.severity,
          message: diagnostic.message,
          location: {
            file:
              diagnostic.code === "missing-manifest-description"
                ? manifestFilenameForType("knowledge")
                : diagnostic.relativePath === "."
                  ? KNOWLEDGE_SOURCE_DIR
                  : `${KNOWLEDGE_SOURCE_DIR}/${diagnostic.relativePath}`,
            ...(diagnostic.line === undefined ? {} : { line: diagnostic.line }),
            ...(diagnostic.column === undefined ? {} : { column: diagnostic.column }),
          },
        }));
      return Effect.succeed(findings);
    },
  };
};

export const knowledgeDiagnosticRuleDefinitions: ReadonlyArray<DiagnosticRuleDefinition> =
  KNOWLEDGE_DIAGNOSTIC_CODES.map((code) => ({
    code,
    severity: KNOWLEDGE_DIAGNOSTIC_SEVERITIES[code],
  }));

export const knowledgeDiagnosticRules: ReadonlyArray<AdvisoryRule<KnowledgeRuleContext>> =
  knowledgeDiagnosticRuleDefinitions.map(makeDiagnosticRule);
