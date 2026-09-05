import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  handleKnowledgeConceptQuery,
  handleKnowledgeConceptStatus,
  KnowledgeConceptStatusOutputSchema,
} from "axm.sh/specification-harness";
import {
  knowledgeQueryOptions,
  makeKnowledgeSpecWorkspace,
} from "../../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/query/enforces-published-query-bounds",
  title: "Query passage bounds follow the published discovery limits",
  statement:
    "When a Knowledge query selects passage bounds, AXM shall accept only whole-number passage limits from 0 through 10 and passage lengths from 1 through 2000.",
  class: "functional",
  role: "interface",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/knowledge-query/src/knowledge-capabilities.ts",
    "packages/cli/help/topics/knowledge.md",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Published passage limits", () => {
  it.effect("accepts the advertised whole-number endpoints and rejects bounds outside them", () => {
    const workspace = makeKnowledgeSpecWorkspace();
    return workspace.provide(
      Effect.gen(function* () {
        yield* handleKnowledgeConceptStatus();
        const { capabilities } = Schema.decodeUnknownSync(KnowledgeConceptStatusOutputSchema)(
          workspace.rendererState.results.at(-1)?.data,
        );
        const maximumCount = capabilities.limits.maximumPassagesPerResult;
        const maximumLength = capabilities.limits.maximumPassageLength;
        expect(maximumCount).toBe(10);
        expect(maximumLength).toBe(2000);
        for (const bounds of [
          { passageLimit: -1 },
          { passageLimit: maximumCount + 1 },
          { passageLimit: 1.5 },
          { passageLength: 0 },
          { passageLength: maximumLength + 1 },
          { passageLength: 1.5 },
        ]) {
          workspace.rendererState.results.length = 0;
          const result = yield* Effect.result(
            handleKnowledgeConceptQuery("project", {
              ...knowledgeQueryOptions,
              ...bounds,
            }),
          );
          expect(Result.isFailure(result) && result.failure).toMatchObject({ code: "validation" });
          expect(workspace.rendererState.results).toEqual([]);
        }
        for (const bounds of [
          { passageLimit: 0, passageLength: 1 },
          { passageLimit: maximumCount, passageLength: maximumLength },
        ]) {
          yield* handleKnowledgeConceptQuery("project", { ...knowledgeQueryOptions, ...bounds });
          expect(workspace.readQueryPage().query).toMatchObject(bounds);
        }
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });
});
