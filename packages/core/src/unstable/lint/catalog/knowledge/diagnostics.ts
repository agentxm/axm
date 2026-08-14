import * as Effect from "effect/Effect";

import {
  KNOWLEDGE_MANIFEST_FILENAME,
  KNOWLEDGE_SOURCE_DIR,
  type KnowledgeDiagnosticCode,
} from "../../../knowledge/index.js";
import type { KnowledgeRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule, Severity } from "../../rule.js";

interface DiagnosticRuleDefinition {
  readonly code: KnowledgeDiagnosticCode;
  readonly severity: Severity;
}

const makeDiagnosticRule = (
  definition: DiagnosticRuleDefinition,
): AdvisoryRule<KnowledgeRuleContext> => {
  const ruleId = `knowledge/${definition.code}`;
  return {
    id: ruleId,
    description: `Knowledge packages satisfy the ${definition.code} diagnostic invariant.`,
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
                ? KNOWLEDGE_MANIFEST_FILENAME
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

export const knowledgeDiagnosticRuleDefinitions = [
  { code: "bundle-too-large", severity: "error" },
  { code: "file-too-large", severity: "error" },
  { code: "invalid-tags", severity: "error" },
  { code: "missing-root-index", severity: "error" },
  { code: "missing-okf-version", severity: "error" },
  { code: "missing-title", severity: "warning" },
  { code: "missing-description", severity: "warning" },
  { code: "missing-manifest-description", severity: "warning" },
  { code: "empty-bundle", severity: "warning" },
  { code: "missing-tags", severity: "warning" },
  { code: "symbolic-link", severity: "error" },
  { code: "too-many-files", severity: "error" },
  { code: "unsupported-okf-version", severity: "error" },
  { code: "missing-type", severity: "error" },
  { code: "invalid-frontmatter", severity: "error" },
  { code: "case-collision", severity: "error" },
  { code: "dangerous-uri", severity: "error" },
  { code: "detected-secret", severity: "error" },
  { code: "unsafe-path", severity: "error" },
  { code: "invalid-index", severity: "error" },
  { code: "invalid-log", severity: "error" },
  { code: "invalid-resource", severity: "error" },
  { code: "escaping-resource", severity: "error" },
  { code: "unresolved-resource", severity: "warning" },
  { code: "broken-internal-link", severity: "warning" },
  { code: "escaping-link", severity: "warning" },
  { code: "unreachable-concept", severity: "warning" },
  { code: "missing-index-entry", severity: "warning" },
  { code: "stale-index-entry", severity: "warning" },
  { code: "embedded-html", severity: "warning" },
  { code: "duplicate-resource", severity: "warning" },
  { code: "inconsistent-type", severity: "warning" },
  { code: "large-concept", severity: "warning" },
  { code: "large-index", severity: "warning" },
  { code: "unreferenced-asset", severity: "warning" },
  { code: "invalid-sources", severity: "error" },
  { code: "invalid-generated", severity: "error" },
  { code: "invalid-verified", severity: "error" },
  { code: "invalid-status", severity: "error" },
  { code: "invalid-stale-after", severity: "error" },
  { code: "invalid-attestation", severity: "error" },
] as const satisfies ReadonlyArray<DiagnosticRuleDefinition>;

export const knowledgeDiagnosticRules: ReadonlyArray<AdvisoryRule<KnowledgeRuleContext>> =
  knowledgeDiagnosticRuleDefinitions.map(makeDiagnosticRule);
