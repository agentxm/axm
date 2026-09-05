import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Result from "effect/Result";
import { handleKnowledgeConceptSearch } from "axm.sh/specification-harness";
import { makeKnowledgeSpecWorkspace } from "../../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/search/rejects-invalid-query",
  title: "Invalid search expressions fail validation",
  statement:
    "When a Knowledge search expression is empty, has no searchable tokens, or contains an invalid phrase or literal, AXM shall reject it as a validation failure.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/help/topics/knowledge.md",
    "packages/cli-e2e/src/knowledge.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Search expression validation", () => {
  for (const input of ["", "  ", "!!!", '""', '"unterminated', 'literal:""'])
    it.effect(JSON.stringify(input), () => {
      const workspace = makeKnowledgeSpecWorkspace();
      return workspace.provide(
        Effect.gen(function* () {
          const result = yield* Effect.result(handleKnowledgeConceptSearch(input, "project"));
          expect(Result.isFailure(result) && result.failure).toMatchObject({ code: "validation" });
          expect(workspace.rendererState.results).toEqual([]);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
});
