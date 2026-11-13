import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { LocalInspection } from "../index.js";
import { knowledgeDocument, makeKnowledgeInventoryFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/list/reports-bundle-inspection",
  title: "Knowledge inventory counts every inspected document from current source",
  statement:
    "When inspecting Knowledge bundles with show --all, AXM shall count every inspected document in the bundle, including its reserved index, and shall re-inspect current source on each invocation so concept and diagnostic counts follow repairs.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  boundaryRationale:
    "Production workspace services execute over native temporary files and directories; the default examples observe their state and outcomes without a separate CLI process.",
  boundary: "platform",
  methods: ["example"],
  derivedFrom: [
    "packages/core/workspace-features/src/inspection/knowledge/list-knowledge.ts",
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
          const first = yield* LocalInspection.query({
            selection: { kind: "all" },
            types: ["knowledge"],
          });
          // Inspection counts the valid index and guide; the malformed document
          // is diagnosed. Concept-query defaults exclude index documents; this
          // inventory counts everything inspection found.
          expect(first).toMatchObject({
            items: [
              {
                identity: { name: "platform" },
                knowledge: { concepts: 2 },
              },
            ],
          });
          expect(first.items[0]?.knowledge?.diagnostics).toBeGreaterThan(0);

          fixture.writeDocument("platform", "broken.md", knowledgeDocument("# Repaired\n"));
          fixture.writeDocument("platform", "added.md", knowledgeDocument("# Added\n"));
          fixture.writeDocument(
            "platform",
            "index.md",
            '---\nokf_version: "0.2"\n---\n# Platform\n\n[Guide](guide.md)\n[Repaired](broken.md)\n[Added](added.md)\n',
          );
          const repaired = yield* LocalInspection.query({
            selection: { kind: "all" },
            types: ["knowledge"],
          });
          expect(repaired).toMatchObject({
            items: [{ identity: { name: "platform" }, knowledge: { concepts: 4, diagnostics: 0 } }],
          });
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});
