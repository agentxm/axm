import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { defineSpecification } from "@agentxm/specification-metadata";

import { parseConceptRef } from "@agentxm/extension-model/unstable/knowledge";
import { relatedKnowledgeConcepts } from "../knowledge-graph.js";
import {
  captureFixtureSnapshot,
  knowledgeDocument,
  makeKnowledgeFixtureWorkspace,
} from "../testing.js";

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
    "apps/cli/help/topics/knowledge.md",
    "packages/core/knowledge-query/src/knowledge-graph.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const conceptRef = (reference: string) => {
  const parsed = parseConceptRef(reference);
  if (!Result.isSuccess(parsed)) throw new Error(`Expected a concept reference: ${reference}`);
  return parsed.success;
};

describe("Related Knowledge", () => {
  it.effect("traverses links and backlinks with depth and cycle suppression", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
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
    return Effect.gen(function* () {
      const snapshot = yield* captureFixtureSnapshot(workspace);
      const alpha = conceptRef("@acme/knowledge/platform#alpha");
      const shallow = relatedKnowledgeConcepts(snapshot, alpha, 1);
      expect(shallow.map((item) => [item.ref.conceptId, item.depth])).toEqual([
        ["beta", 1],
        ["incoming", 1],
      ]);
      const deep = relatedKnowledgeConcepts(snapshot, alpha, 3);
      expect(deep.map((item) => [item.ref.conceptId, item.depth])).toEqual([
        ["beta", 1],
        ["incoming", 1],
        ["gamma", 2],
      ]);
      expect(new Set(deep.map((item) => item.ref.conceptId)).size).toBe(deep.length);
      for (const item of deep) {
        expect(item.evidence.sourceRelativePath).toMatch(/\.md$/u);
        expect(item.evidence.line).toBeGreaterThan(0);
      }
      expect(
        relatedKnowledgeConcepts(snapshot, alpha, 1, { includeIndexBacklinks: true }),
      ).toContainEqual(
        expect.objectContaining({
          relation: "backlink",
          ref: expect.objectContaining({ conceptId: "index" }),
        }),
      );
    }).pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });
});
