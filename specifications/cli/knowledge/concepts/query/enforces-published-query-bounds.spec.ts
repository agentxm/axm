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
  requirement: "cli/knowledge/concepts/query/enforces-published-query-bounds",
  title: "Query bounds follow the published discovery limits",
  statement:
    "When a Knowledge query selects output bounds, AXM shall accept only whole-number result limits from 1 through 100, passage limits from 0 through 10, and passage lengths from 1 through 2000.",
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

describe("Published query limits", () => {
  for (const bounds of [
    { resultLimit: 0 },
    { resultLimit: 101 },
    { resultLimit: 1.5 },
    { passageLimit: -1 },
    { passageLimit: 11 },
    { passageLength: 0 },
    { passageLength: 2001 },
  ])
    it.effect(JSON.stringify(bounds), () => {
      const workspace = makeKnowledgeSpecWorkspace();
      return workspace.provide(
        Effect.gen(function* () {
          const result = yield* Effect.result(
            handleKnowledgeConceptQuery("project", { ...knowledgeQueryOptions, ...bounds }),
          );
          expect(Result.isFailure(result) && result.failure).toMatchObject({ code: "validation" });
          expect(workspace.rendererState.results).toEqual([]);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
  for (const bounds of [
    { resultLimit: 1, passageLimit: 0, passageLength: 1 },
    { resultLimit: 100, passageLimit: 10, passageLength: 2000 },
  ])
    it.effect(`accepts ${JSON.stringify(bounds)}`, () => {
      const workspace = makeKnowledgeSpecWorkspace();
      return workspace.provide(
        handleKnowledgeConceptQuery("project", { ...knowledgeQueryOptions, ...bounds }).pipe(
          Effect.ensuring(Effect.sync(workspace.cleanup)),
        ),
      );
    });
});
