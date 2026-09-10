import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ListKnowledge } from "./list-knowledge.js";
import { knowledgeDocument, makeKnowledgeInventoryFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/list/reports-bundle-inspection",
  title: "Knowledge inventory counts every inspected document from current source",
  statement:
    "When listing Knowledge bundles, AXM shall count every inspected document in the bundle, including its reserved index, and shall re-inspect current source on each listing so concept and diagnostic counts follow repairs.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/core/workspace-inspection/src/knowledge/list-knowledge.ts",
    "apps/cli-e2e/src/knowledge.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Knowledge bundle inventory", () => {
  it.effect("reports source inspection and changes after a source repair", () => {
    const fixture = makeKnowledgeInventoryFixture({
      bundles: [
        {
          name: "platform",
          documents: {
            "index.md":
              '---\nokf_version: "0.2"\n---\n# Platform\n\n[Guide](guide.md)\n[Broken](broken.md)\n',
            "guide.md": knowledgeDocument("# Guide\n"),
            "broken.md": "---\ntype: [broken\n---\n# Broken\n",
          },
        },
      ],
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const first = yield* ListKnowledge.query();
          // Inspection counts the valid index and guide; the malformed document
          // is diagnosed. Concept-query defaults exclude index documents; this
          // inventory counts everything inspection found.
          expect(first.document).toMatchObject({
            count: 1,
            items: [{ name: "platform", sourceRoot: fixture.sourceRoot("platform"), concepts: 2 }],
          });
          expect(first.document.items[0]?.diagnostics).toBeGreaterThan(0);

          fixture.writeDocument("platform", "broken.md", knowledgeDocument("# Repaired\n"));
          fixture.writeDocument("platform", "added.md", knowledgeDocument("# Added\n"));
          fixture.writeDocument(
            "platform",
            "index.md",
            '---\nokf_version: "0.2"\n---\n# Platform\n\n[Guide](guide.md)\n[Repaired](broken.md)\n[Added](added.md)\n',
          );
          const repaired = yield* ListKnowledge.query();
          expect(repaired.document).toMatchObject({
            count: 1,
            items: [{ name: "platform", concepts: 4, diagnostics: 0 }],
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});
