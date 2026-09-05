import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Exit from "effect/Exit";
import * as TestClock from "effect/testing/TestClock";
import {
  handleKnowledgeConceptQuery,
  handleKnowledgeConceptSearch,
  handleKnowledgeConceptStatus,
  KnowledgeConceptStatusOutputSchema,
} from "axm.sh/specification-harness";
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

  it.effect("search continues through all matches without repeating a concept", () => {
    const workspace = makeKnowledgeSpecWorkspace({
      bundles: [
        {
          name: "platform",
          documents: Object.fromEntries(
            ["alpha", "beta", "gamma", "delta", "epsilon"].map((name) => [
              name + ".md",
              knowledgeDocument("# Session " + name + "\n"),
            ]),
          ),
        },
      ],
    });
    return workspace.provide(
      Effect.gen(function* () {
        const ids: string[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < 3; page++) {
          yield* handleKnowledgeConceptSearch("session", "project", {
            resultLimit: 2,
            ...(cursor === undefined ? {} : { cursor }),
          });
          const result = workspace.readQueryPage();
          expect(result.count).toBe(5);
          expect(result.items).toHaveLength(page < 2 ? 2 : 1);
          expect(result.hasMore).toBe(page < 2);
          ids.push(...result.items.map((item) => item.ref.conceptId));
          cursor = result.cursor;
        }
        expect([...ids].sort()).toEqual(["alpha", "beta", "delta", "epsilon", "gamma"]);
        expect(new Set(ids).size).toBe(5);
        expect(cursor).toBeUndefined();
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });

  for (const change of ["query", "scope", "source", "age", "malformed"] as const)
    it.effect("search requires a fresh cursor after " + change + " changes", () => {
      const workspace = makeKnowledgeSpecWorkspace({
        bundles: [
          {
            name: "platform",
            documents: {
              "alpha.md": knowledgeDocument("# Session token alpha\n"),
              "beta.md": knowledgeDocument("# Session token beta\n"),
            },
          },
        ],
      });
      return workspace.provide(
        Effect.gen(function* () {
          yield* handleKnowledgeConceptStatus();
          const { capabilities } = Schema.decodeUnknownSync(KnowledgeConceptStatusOutputSchema)(
            workspace.rendererState.results.at(-1)?.data,
          );
          yield* handleKnowledgeConceptSearch("session", "project", { resultLimit: 1 });
          const first = workspace.readQueryPage();
          const cursor = first.cursor;
          if (cursor === undefined) throw new Error("Expected a search continuation cursor");
          if (change === "source")
            workspace.writeDocument(
              "alpha.md",
              knowledgeDocument("# Session token alpha\n\nChanged.\n"),
            );
          if (change === "age") {
            // The advertised maximum age is inclusive; the original cursor expires after it.
            yield* TestClock.adjust(capabilities.cursor.maximumAgeSeconds * 1000);
            yield* handleKnowledgeConceptSearch("session", "project", { resultLimit: 1, cursor });
            expect(workspace.readQueryPage().items).toHaveLength(1);
            expect(workspace.readQueryPage().items[0]?.ref).not.toEqual(first.items[0]?.ref);
            yield* TestClock.adjust(1);
          }
          const query = change === "query" ? "token" : "session";
          // This isolates the query's scope binding while keeping captured source bytes equal.
          // Populated project/user corpus selection is established by the corpus-scope owner.
          const scope = change === "scope" ? "user" : "project";
          const exit = yield* Effect.exit(
            handleKnowledgeConceptSearch(query, scope, {
              resultLimit: 1,
              cursor: change === "malformed" ? "invalid-cursor" : cursor,
            }),
          );
          expect(Exit.isFailure(exit)).toBe(true);
          expect(workspace.rendererState.results.at(-1)?.data).toEqual({
            outcome: "failed",
            reason: "cursor-expired",
          });
          // The changed query remains valid when restarted without the old cursor.
          yield* handleKnowledgeConceptSearch(query, scope, { resultLimit: 1 });
          expect(workspace.readQueryPage()).toMatchObject({ count: 2, hasMore: true });
          expect(workspace.readQueryPage().items).toHaveLength(1);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
});
