import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Exit from "effect/Exit";
import * as TestClock from "effect/testing/TestClock";
import { handleKnowledgeConceptQuery } from "axm.sh/specification-harness";
import {
  knowledgeDocument,
  knowledgeQueryOptions,
  makeKnowledgeSpecWorkspace,
} from "../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/cursors-bind-query-and-corpus",
  title: "Continuation cursors preserve query and corpus identity",
  statement:
    "When continuing a Knowledge query, AXM shall return the next page without repeating prior concepts only while the cursor is well formed, no more than twenty-four hours old, and bound to the same query and selected corpus, otherwise requiring the caller to restart.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/help/topics/knowledge.md",
    "packages/knowledge-query/src/knowledge-index.internal.test.ts",
    "packages/cli-e2e/src/knowledge.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Knowledge continuation", () => {
  it.effect("pages deterministically without duplicates and reports the total match count", () => {
    const workspace = makeKnowledgeSpecWorkspace({
      bundles: [
        {
          name: "platform",
          documents: {
            "alpha.md": knowledgeDocument("# Alpha\n"),
            "beta.md": knowledgeDocument("# Beta\n"),
            "gamma.md": knowledgeDocument("# Gamma\n"),
          },
        },
      ],
    });
    return workspace.provide(
      Effect.gen(function* () {
        const ids: string[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < 3; page++) {
          yield* handleKnowledgeConceptQuery("project", {
            ...knowledgeQueryOptions,
            resultLimit: 1,
            ...(cursor === undefined ? {} : { cursor }),
          });
          const result = workspace.readQueryPage();
          expect(result.count).toBe(3);
          ids.push(...result.items.map((item) => item.ref.conceptId));
          expect(result.hasMore).toBe(page < 2);
          cursor = result.cursor;
        }
        expect(ids).toEqual(["alpha", "beta", "gamma"]);
        expect(cursor).toBeUndefined();
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });
  for (const change of ["query", "scope", "source", "age", "malformed"] as const)
    it.effect(`requires restart after ${change} changes`, () => {
      const workspace = makeKnowledgeSpecWorkspace({
        bundles: [
          {
            name: "platform",
            documents: {
              "alpha.md": knowledgeDocument("# Alpha\n"),
              "beta.md": knowledgeDocument("# Beta\n"),
            },
          },
        ],
      });
      return workspace.provide(
        Effect.gen(function* () {
          yield* handleKnowledgeConceptQuery("project", {
            ...knowledgeQueryOptions,
            resultLimit: 1,
          });
          const cursor = workspace.readQueryPage().cursor;
          if (cursor === undefined) throw new Error("Expected a continuation cursor");
          if (change === "source")
            workspace.writeDocument("alpha.md", knowledgeDocument("# Alpha\n\nChanged.\n"));
          if (change === "age") yield* TestClock.adjust(86_400_001);
          const exit = yield* Effect.exit(
            handleKnowledgeConceptQuery(change === "scope" ? "user" : "project", {
              ...knowledgeQueryOptions,
              resultLimit: 1,
              cursor: change === "malformed" ? "invalid-cursor" : cursor,
              ...(change === "query" ? { expression: "alpha" } : {}),
            }),
          );
          expect(Exit.isFailure(exit)).toBe(true);
          expect(workspace.rendererState.results.at(-1)?.data).toEqual({
            outcome: "failed",
            reason: "cursor-expired",
          });
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
});
