import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Result from "effect/Result";
import { handleKnowledgeConceptQuery } from "axm.sh/specification-harness";
import {
  knowledgeQueryOptions,
  makeKnowledgeSpecWorkspace,
} from "../../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/query/rejects-invalid-filters",
  title: "Invalid query filters fail validation",
  statement:
    "When a Knowledge query contains an unknown field, malformed property pointer, unsupported operator, or empty filter value, AXM shall reject the query as a validation failure.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/help/topics/knowledge.md",
    "packages/cli/src/root/knowledge/concepts/query.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Query filter validation", () => {
  const cases = [
    { fields: ["unknown=value"] },
    { fields: ["title="] },
    { properties: ["producer/name=value"] },
    { properties: ["/producer/~2name=value"] },
    { metadata: ["unknown=value"] },
    { lifecycle: ["status~=active"] },
    { lifecycle: ["unknown=value"] },
    { tags: [""] },
    { bundle: "" },
    { status: "" },
  ];
  for (const invalid of cases)
    it.effect(JSON.stringify(invalid), () => {
      const workspace = makeKnowledgeSpecWorkspace();
      return workspace.provide(
        Effect.gen(function* () {
          const result = yield* Effect.result(
            handleKnowledgeConceptQuery("project", { ...knowledgeQueryOptions, ...invalid }),
          );
          expect(Result.isFailure(result) && result.failure).toMatchObject({ code: "validation" });
          expect(workspace.rendererState.results).toEqual([]);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
});
