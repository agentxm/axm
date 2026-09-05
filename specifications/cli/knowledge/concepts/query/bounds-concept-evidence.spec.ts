import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handleKnowledgeConceptQuery } from "axm.sh/specification-harness";
import {
  knowledgeDocument,
  knowledgeQueryOptions,
  makeKnowledgeSpecWorkspace,
} from "../../../../support/knowledge-harness.js";

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
    "packages/cli/help/topics/knowledge.md",
    "packages/knowledge-query/src/knowledge-index.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "What explanatory information should query --explain promise about why concepts matched and their ordering? The current strategy and numeric ranking weights are implementation evidence, not accepted output obligations.",
  ],
});

describe("Bounded source evidence", () => {
  it.effect("aggregates matching passages and preserves source coordinates", () => {
    const workspace = makeKnowledgeSpecWorkspace({
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
    return workspace.provide(
      Effect.gen(function* () {
        yield* handleKnowledgeConceptQuery("project", {
          ...knowledgeQueryOptions,
          expression: "identity authentication",
          resultLimit: 1,
          passageLimit: 1,
          passageLength: 30,
        });
        const page = workspace.readQueryPage();
        expect(page.count).toBe(1);
        expect(page.items).toHaveLength(1);
        expect(page.items[0]?.matchedFields).toEqual(["body", "tag"]);
        expect(page.items[0]?.passages).toHaveLength(1);
        const passage = page.items[0]?.passages[0];
        expect(passage?.text.length).toBeLessThanOrEqual(30);
        expect(passage?.startLine).toBeGreaterThan(0);
        expect(passage?.endLine).toBeGreaterThanOrEqual(passage?.startLine ?? 0);
        expect(passage?.spans).toContainEqual(expect.objectContaining({ field: "body" }));
        yield* handleKnowledgeConceptQuery("project", {
          ...knowledgeQueryOptions,
          expression: "authentication",
          passageLimit: 0,
        });
        expect(workspace.readQueryPage().items[0]?.passages).toEqual([]);
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });
});
