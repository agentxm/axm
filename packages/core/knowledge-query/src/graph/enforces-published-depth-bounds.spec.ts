import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { defineSpecification } from "@agentxm/specification-metadata";

import { KNOWLEDGE_DISCOVERY_CAPABILITIES } from "../knowledge-capabilities.js";
import { checkTraversalDepth } from "../query/request.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/related/enforces-published-depth-bounds",
  title: "Related traversal validates its depth limit",
  statement:
    "When a caller selects a Knowledge relationship traversal depth, AXM shall accept only whole-number depths from one through three.",
  class: "functional",
  role: "interface",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/core/knowledge-query/src/knowledge-capabilities.ts",
    "apps/cli/src/root/knowledge/concepts/related.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const maximumDepth = KNOWLEDGE_DISCOVERY_CAPABILITIES.limits.maximumTraversalDepth;

describe("Relationship traversal bounds", () => {
  for (const depth of [0, maximumDepth + 1, 1.5])
    it.effect(String(depth), () =>
      Effect.gen(function* () {
        const result = yield* Effect.result(checkTraversalDepth(depth));
        expect(Result.isFailure(result) && result.failure._tag).toBe("KnowledgeRequestInvalid");
      }),
    );

  for (const depth of [1, maximumDepth])
    it.effect(`accepts ${String(depth)}`, () =>
      Effect.map(checkTraversalDepth(depth), (accepted) => {
        expect(accepted).toBe(depth);
      }),
    );
});
