import { describe, expect, it } from "vitest";

import { KNOWLEDGE_DIAGNOSTIC_CODES } from "../../knowledge/index.js";
import { knowledgeRules } from "./knowledge.js";
import {
  knowledgeDiagnosticRuleDefinitions,
  knowledgeDiagnosticRules,
} from "./knowledge/diagnostics.js";

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
});
