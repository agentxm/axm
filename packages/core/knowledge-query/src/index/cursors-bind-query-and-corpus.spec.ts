import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";
import { defineSpecification } from "@agentxm/specification-metadata";

import { KNOWLEDGE_DISCOVERY_CAPABILITIES } from "../knowledge-capabilities.js";
import { KnowledgeDiscovery } from "../knowledge-discovery.js";
import { knowledgeDocument, makeKnowledgeFixtureWorkspace } from "../testing.js";

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
    "apps/cli/help/topics/knowledge.md",
    "packages/core/knowledge-query/src/knowledge-index.test.ts",
    "apps/cli-e2e/src/knowledge.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const maximumCursorAgeMillis = KNOWLEDGE_DISCOVERY_CAPABILITIES.cursor.maximumAgeSeconds * 1000;

describe("Knowledge continuation", () => {
  it.effect("pages deterministically without duplicates and reports the total match count", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
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
    return workspace
      .provide(
        Effect.gen(function* () {
          const ids: string[] = [];
          let cursor: string | undefined;
          for (let page = 0; page < 3; page++) {
            const result = yield* KnowledgeDiscovery.query({
              scope: "project",
              resultLimit: 1,
              ...(cursor === undefined ? {} : { cursor }),
            });
            if (result.outcome !== "ready") throw new Error("Expected a page");
            expect(result.page.count).toBe(3);
            ids.push(...result.page.items.map((item) => item.ref.conceptId));
            expect(result.page.hasMore).toBe(page < 2);
            cursor = result.page.cursor;
          }
          expect(ids).toEqual(["alpha", "beta", "gamma"]);
          expect(cursor).toBeUndefined();
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  for (const change of ["query", "scope", "source", "age", "malformed"] as const)
    it.effect(`requires restart after ${change} changes`, () => {
      const workspace = makeKnowledgeFixtureWorkspace({
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
      return workspace
        .provide(
          Effect.gen(function* () {
            const first = yield* KnowledgeDiscovery.query({ scope: "project", resultLimit: 1 });
            if (first.outcome !== "ready") throw new Error("Expected a page");
            const cursor = first.page.cursor;
            if (cursor === undefined) throw new Error("Expected a continuation cursor");
            if (change === "source")
              workspace.writeDocument("alpha.md", knowledgeDocument("# Alpha\n\nChanged.\n"));
            if (change === "age") yield* TestClock.adjust(maximumCursorAgeMillis + 1);
            const continued = yield* KnowledgeDiscovery.query({
              scope: change === "scope" ? "user" : "project",
              resultLimit: 1,
              cursor: change === "malformed" ? "invalid-cursor" : cursor,
              ...(change === "query" ? { expression: "alpha" } : {}),
            });
            expect(continued.outcome).toBe("cursor-expired");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
    });

  it.effect("search continues through all matches without repeating a concept", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        {
          name: "platform",
          documents: Object.fromEntries(
            ["alpha", "beta", "gamma", "delta", "epsilon"].map((name) => [
              `${name}.md`,
              knowledgeDocument(`# Session ${name}\n`),
            ]),
          ),
        },
      ],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const ids: string[] = [];
          let cursor: string | undefined;
          for (let page = 0; page < 3; page++) {
            const result = yield* KnowledgeDiscovery.search({
              scope: "project",
              expression: "session",
              resultLimit: 2,
              ...(cursor === undefined ? {} : { cursor }),
            });
            if (result.outcome !== "ready") throw new Error("Expected a page");
            expect(result.page.count).toBe(5);
            expect(result.page.items).toHaveLength(page < 2 ? 2 : 1);
            expect(result.page.hasMore).toBe(page < 2);
            ids.push(...result.page.items.map((item) => item.ref.conceptId));
            cursor = result.page.cursor;
          }
          expect([...ids].sort()).toEqual(["alpha", "beta", "delta", "epsilon", "gamma"]);
          expect(new Set(ids).size).toBe(5);
          expect(cursor).toBeUndefined();
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  for (const change of ["query", "scope", "source", "age", "malformed"] as const)
    it.effect(`search requires a fresh cursor after ${change} changes`, () => {
      const workspace = makeKnowledgeFixtureWorkspace({
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
      return workspace
        .provide(
          Effect.gen(function* () {
            const first = yield* KnowledgeDiscovery.search({
              scope: "project",
              expression: "session",
              resultLimit: 1,
            });
            if (first.outcome !== "ready") throw new Error("Expected a page");
            const cursor = first.page.cursor;
            if (cursor === undefined) throw new Error("Expected a search continuation cursor");
            if (change === "source")
              workspace.writeDocument(
                "alpha.md",
                knowledgeDocument("# Session token alpha\n\nChanged.\n"),
              );
            if (change === "age") {
              // The advertised maximum age is inclusive; the cursor expires after it.
              yield* TestClock.adjust(maximumCursorAgeMillis);
              const stillValid = yield* KnowledgeDiscovery.search({
                scope: "project",
                expression: "session",
                resultLimit: 1,
                cursor,
              });
              if (stillValid.outcome !== "ready") throw new Error("Expected a page");
              expect(stillValid.page.items).toHaveLength(1);
              expect(stillValid.page.items[0]?.ref).not.toEqual(first.page.items[0]?.ref);
              yield* TestClock.adjust(1);
            }
            const expression = change === "query" ? "token" : "session";
            const scope = change === "scope" ? ("user" as const) : ("project" as const);
            const continued = yield* KnowledgeDiscovery.search({
              scope,
              expression,
              resultLimit: 1,
              cursor: change === "malformed" ? "invalid-cursor" : cursor,
            });
            expect(continued.outcome).toBe("cursor-expired");

            // The changed query remains valid when restarted without the old cursor.
            const restarted = yield* KnowledgeDiscovery.search({
              scope,
              expression,
              resultLimit: 1,
            });
            if (restarted.outcome !== "ready") throw new Error("Expected a page");
            expect(restarted.page).toMatchObject({ count: 2, hasMore: true });
            expect(restarted.page.items).toHaveLength(1);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
    });
});
