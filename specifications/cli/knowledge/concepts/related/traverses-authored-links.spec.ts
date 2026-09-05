import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Schema from "effect/Schema";
import {
  handleKnowledgeConceptRelated,
  KnowledgeConceptRelatedOutputSchema,
} from "axm.sh/specification-harness";
import {
  knowledgeDocument,
  makeKnowledgeSpecWorkspace,
} from "../../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/related/traverses-authored-links",
  title: "Related concepts follow authored links with evidence",
  statement:
    "When exploring related Knowledge concepts, AXM shall return outgoing links and backlinks within the requested depth with authored-link evidence, suppressing the starting concept, repeated visits, and index backlinks unless requested.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/help/topics/knowledge.md",
    "packages/knowledge-query/src/knowledge-graph.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Related Knowledge", () => {
  it.effect("traverses links and backlinks with depth and cycle suppression", () => {
    const workspace = makeKnowledgeSpecWorkspace({
      bundles: [
        {
          name: "platform",
          documents: {
            "index.md": '---\nokf_version: "0.2"\n---\n# Index\n\n[Alpha](alpha.md)\n',
            "alpha.md": knowledgeDocument("# Alpha\n\n[Beta](beta.md)\n"),
            "beta.md": knowledgeDocument("# Beta\n\n[Gamma](gamma.md)\n\n[Alpha](alpha.md)\n"),
            "gamma.md": knowledgeDocument("# Gamma\n\n[Beta](beta.md)\n"),
            "incoming.md": knowledgeDocument("# Incoming\n\n[Alpha](alpha.md)\n"),
          },
        },
      ],
    });
    return workspace.provide(
      Effect.gen(function* () {
        const read = () =>
          Schema.decodeUnknownSync(KnowledgeConceptRelatedOutputSchema)(
            workspace.rendererState.results.at(-1)?.data,
          );
        yield* handleKnowledgeConceptRelated("@acme/knowledge/platform#alpha", 1);
        expect(read().items.map((item) => [item.ref.conceptId, item.depth])).toEqual([
          ["beta", 1],
          ["incoming", 1],
        ]);
        yield* handleKnowledgeConceptRelated("@acme/knowledge/platform#alpha", 3);
        const deep = read();
        expect(deep.items.map((item) => [item.ref.conceptId, item.depth])).toEqual([
          ["beta", 1],
          ["incoming", 1],
          ["gamma", 2],
        ]);
        expect(new Set(deep.items.map((item) => item.ref.conceptId)).size).toBe(deep.count);
        for (const item of deep.items) {
          expect(item.evidence.sourceRelativePath).toMatch(/\.md$/u);
          expect(item.evidence.line).toBeGreaterThan(0);
        }
        yield* handleKnowledgeConceptRelated("@acme/knowledge/platform#alpha", 1, true);
        expect(read().items).toContainEqual(
          expect.objectContaining({
            relation: "backlink",
            ref: expect.objectContaining({ conceptId: "index" }),
          }),
        );
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });
});
