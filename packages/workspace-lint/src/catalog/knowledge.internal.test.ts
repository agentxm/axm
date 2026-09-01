import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { KNOWLEDGE_DIAGNOSTIC_CODES } from "@agentxm/registry-protocol/unstable/knowledge";
import { knowledgeRules } from "@agentxm/registry-protocol/unstable/lint/catalog/knowledge";
import {
  knowledgeDiagnosticRuleDefinitions,
  knowledgeDiagnosticRules,
} from "@agentxm/registry-protocol/unstable/lint/catalog/knowledge/diagnostics";

describe("Knowledge diagnostic lint rules", () => {
  it("maps every stable diagnostic code exactly once", () => {
    expect(knowledgeDiagnosticRuleDefinitions.map(({ code }) => code)).toEqual(
      KNOWLEDGE_DIAGNOSTIC_CODES,
    );
    expect(knowledgeDiagnosticRules.map(({ id }) => id)).toEqual(
      KNOWLEDGE_DIAGNOSTIC_CODES.map((code) => `knowledge/${code}`),
    );
    expect(new Set(knowledgeDiagnosticRules.map(({ id }) => id)).size).toBe(41);
  });

  it("preserves the amended resource diagnostic severities", () => {
    expect(
      knowledgeDiagnosticRules.find(({ id }) => id === "knowledge/escaping-resource")?.severity,
    ).toBe("error");
    expect(
      knowledgeDiagnosticRules.find(({ id }) => id === "knowledge/unresolved-resource")?.severity,
    ).toBe("warning");
  });

  it("keeps the diagnostic rules in the ordinary Knowledge catalog", () => {
    expect(knowledgeRules.slice(-knowledgeDiagnosticRules.length)).toEqual(
      knowledgeDiagnosticRules,
    );
  });

  it.effect("maps Knowledge diagnostic line and column into the finding location", () =>
    Effect.gen(function* () {
      const rule = knowledgeDiagnosticRules.find(
        ({ id }) => id === "knowledge/invalid-frontmatter",
      );
      expect(rule).toBeDefined();
      if (rule === undefined) return;

      const findings = yield* rule.check({
        subject: {
          knowledgeJson: {},
          inspection: {
            concepts: [],
            diagnostics: [
              {
                code: "invalid-frontmatter",
                severity: "error",
                relativePath: "broken.md",
                line: 3,
                column: 14,
                message:
                  "Invalid YAML frontmatter: Nested mappings are not allowed in compact mappings",
                details: {
                  kind: "frontmatter-parse",
                  reason: "Nested mappings are not allowed in compact mappings",
                },
              },
            ],
            okfVersion: "0.2",
          },
        },
        files: {
          exists: () => Effect.succeed(false),
          readBytes: () => Effect.die("not used"),
        },
        displayRoot: "agent_extensions/@acme/knowledge/platform",
      });

      expect(findings).toEqual([
        {
          kind: "advisory",
          ruleId: "knowledge/invalid-frontmatter",
          severity: "error",
          message: "Invalid YAML frontmatter: Nested mappings are not allowed in compact mappings",
          location: { file: "src/broken.md", line: 3, column: 14 },
        },
      ]);
    }),
  );
});
