import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Result from "effect/Result";
import { handleKnowledgeConceptRelated } from "axm.sh/specification-harness";
import { makeKnowledgeSpecWorkspace } from "../../../../support/knowledge-harness.js";

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
    "packages/knowledge-query/src/knowledge-capabilities.ts",
    "packages/cli/src/root/knowledge/concepts/related.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Relationship traversal bounds", () => {
  for (const depth of [0, 4, 1.5])
    it.effect(String(depth), () => {
      const workspace = makeKnowledgeSpecWorkspace();
      return workspace.provide(
        Effect.gen(function* () {
          const result = yield* Effect.result(
            handleKnowledgeConceptRelated("@acme/knowledge/platform#session", depth),
          );
          expect(Result.isFailure(result) && result.failure).toMatchObject({ code: "validation" });
          expect(workspace.rendererState.results).toEqual([]);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
});
