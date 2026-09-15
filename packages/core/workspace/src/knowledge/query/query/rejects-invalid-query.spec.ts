import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { defineSpecification } from "@agentxm/specification-metadata";

import { makeKnowledgeSearchRequest } from "./request.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/search/rejects-invalid-query",
  title: "Invalid search expressions fail validation",
  statement:
    "When a Knowledge search expression is empty, has no searchable tokens, or contains an invalid phrase or literal, AXM shall reject it as a validation failure.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["apps/cli/help/topics/knowledge.md", "apps/cli-e2e/src/knowledge.e2e.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Search expression validation", () => {
  for (const expression of ["", "  ", "!!!", '""', '"unterminated', 'literal:""'])
    it.effect(JSON.stringify(expression), () =>
      Effect.gen(function* () {
        const result = yield* Effect.result(
          makeKnowledgeSearchRequest({ scope: "project", expression }),
        );
        expect(Result.isFailure(result) && result.failure._tag).toBe("KnowledgeRequestInvalid");
      }),
    );
});
