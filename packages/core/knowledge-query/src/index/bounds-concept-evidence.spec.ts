import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { KnowledgeDiscovery } from "../knowledge-discovery.js";
import { knowledgeDocument, makeKnowledgeFixtureWorkspace } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/query/bounds-concept-evidence",
  title: "Query evidence respects requested bounds",
  statement:
    "When a Knowledge query matches a concept through several fields or passages, AXM shall return one concept result with matching-field and source-location evidence within the caller-selected passage-count and passage-length bounds.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "apps/cli/help/topics/knowledge.md",
    "packages/core/knowledge-query/src/knowledge-index.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "What explanatory information should query --explain promise about why concepts matched and their ordering? The current strategy and numeric ranking weights are implementation evidence, not accepted output obligations.",
  ],
});

describe("Bounded source evidence", () => {
  it.effect("aggregates matching passages and preserves source coordinates", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        {
          name: "platform",
          documents: {
            "session.md": knowledgeDocument(
              "# Session\n\nAuthentication overview.\n\n## Details\n\nAuthentication implementation.\n",
              { tags: ["identity"] },
            ),
          },
        },
      ],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const bounded = yield* KnowledgeDiscovery.query({
            scope: "project",
            expression: "identity authentication",
            resultLimit: 1,
            passageLimit: 1,
            passageLength: 30,
          });
          if (bounded.outcome !== "ready") throw new Error("Expected a page");
          const page = bounded.page;
          expect(page.count).toBe(1);
          expect(page.items).toHaveLength(1);
          expect(page.items[0]?.matchedFields).toEqual(["body", "tag"]);
          expect(page.items[0]?.passages).toHaveLength(1);
          const passage = page.items[0]?.passages[0];
          expect(passage?.text.length).toBeLessThanOrEqual(30);
          expect(passage?.startLine).toBeGreaterThan(0);
          expect(passage?.endLine).toBeGreaterThanOrEqual(passage?.startLine ?? 0);
          expect(passage?.spans).toContainEqual(expect.objectContaining({ field: "body" }));

          const withoutPassages = yield* KnowledgeDiscovery.query({
            scope: "project",
            expression: "authentication",
            passageLimit: 0,
          });
          if (withoutPassages.outcome !== "ready") throw new Error("Expected a page");
          expect(withoutPassages.page.items[0]?.passages).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });
});
