import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { defineSpecification } from "@agentxm/specification-metadata";

import { makeKnowledgeQueryRequest } from "./request.js";

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
    "apps/cli/help/topics/knowledge.md",
    "apps/cli/src/root/knowledge/concepts/query.ts",
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
    it.effect(JSON.stringify(invalid), () =>
      Effect.gen(function* () {
        const result = yield* Effect.result(
          makeKnowledgeQueryRequest({ scope: "project", ...invalid }),
        );
        expect(Result.isFailure(result) && result.failure._tag).toBe("KnowledgeRequestInvalid");
      }),
    );
});
