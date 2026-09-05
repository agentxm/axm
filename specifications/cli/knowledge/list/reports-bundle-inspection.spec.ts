import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Schema from "effect/Schema";
import { handleKnowledgeList, KnowledgeListQueryResultSchema } from "axm.sh/specification-harness";
import {
  makeKnowledgeSpecWorkspace,
  knowledgeDocument,
} from "../../../support/knowledge-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/list/reports-bundle-inspection",
  title: "Knowledge list reports the inspected bundle content",
  statement:
    "When listing Knowledge bundles, AXM shall identify locally available bundles with their source paths, inspected concept counts, and diagnostic counts.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/knowledge/list.ts",
    "packages/cli-e2e/src/knowledge.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Knowledge bundle inventory", () => {
  it.effect("reports source inspection and changes after a source repair", () => {
    const workspace = makeKnowledgeSpecWorkspace({
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
    return workspace.provide(
      Effect.gen(function* () {
        const read = () =>
          Schema.decodeUnknownSync(Schema.toType(KnowledgeListQueryResultSchema))(
            workspace.rendererState.results.at(-1)?.data,
          );
        yield* handleKnowledgeList();
        // Inspection includes the valid index and guide; the malformed document is diagnosed.
        // Concept query defaults exclude index documents, but bundle inventory counts inspection.
        expect(read()).toMatchObject({
          count: 1,
          items: [
            { name: "platform", sourceRoot: workspace.sourcePath("platform", ""), concepts: 2 },
          ],
        });
        expect(read().items[0]?.diagnostics).toBeGreaterThan(0);
        workspace.writeDocument("broken.md", knowledgeDocument("# Repaired\n"));
        workspace.writeDocument("added.md", knowledgeDocument("# Added\n"));
        workspace.writeDocument(
          "index.md",
          '---\nokf_version: "0.2"\n---\n# Platform\n\n[Guide](guide.md)\n[Repaired](broken.md)\n[Added](added.md)\n',
        );
        yield* handleKnowledgeList();
        expect(read()).toMatchObject({
          count: 1,
          items: [{ name: "platform", concepts: 4, diagnostics: 0 }],
        });
      }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
    );
  });
});
