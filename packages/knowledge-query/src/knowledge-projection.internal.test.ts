import { describe, expect, it } from "vitest";
import type { KnowledgeConcept } from "@agentxm/registry-protocol/unstable/knowledge/okf";
import {
  projectKnowledgeConcepts,
  resolveKnowledgeFrontmatterPointer,
} from "./knowledge-projection.js";

const concept = (
  values: Pick<KnowledgeConcept, "id" | "relativePath" | "body"> &
    Partial<Omit<KnowledgeConcept, "id" | "relativePath" | "body">>,
): KnowledgeConcept => ({
  kind: "concept",
  title: values.id,
  trust: "unverified",
  authoredLinks: [],
  ...values,
});

describe("Knowledge discovery projection", () => {
  it("projects independent fields, section-aware passages, graph evidence, and absent fields", () => {
    const source = concept({
      id: "guides/source",
      relativePath: "guides/source.md",
      body: "# Source\n\nOpening.\n\n## Details\n\nExact body text.\n",
      title: "Source",
      authoredTitle: "Source",
      description: "A source document",
      tags: ["source-of-truth", "design"],
      type: "reference",
      status: "stable",
      resource: "https://example.com/source",
      generated: { by: "process:indexer", at: "2026-08-12T00:00:00Z" },
      verified: [{ by: "human:reviewer" }],
      trust: "human-reviewed",
      frontmatter: {
        type: "reference",
        producer: { nested: ["one", { "a/b": "two" }] },
      },
      authoredLinks: [
        { target: "../target.md", line: 8, resolvedConceptId: "target" },
        { target: "https://example.com", line: 9 },
      ],
    });
    const target = concept({
      id: "target",
      relativePath: "target.md",
      body: "Body without a heading.\n",
    });

    const projected = projectKnowledgeConcepts("@example/knowledge/platform", [source, target]);
    const projectedSource = projected.find(({ conceptId }) => conceptId === source.id);
    const projectedTarget = projected.find(({ conceptId }) => conceptId === target.id);

    expect(projectedSource).toMatchObject({
      bundle: "@example/knowledge/platform",
      conceptId: "guides/source",
      kind: "concept",
      title: "Source",
      description: "A source document",
      status: "stable",
      trust: "human-reviewed",
    });
    expect(projectedSource?.bodyPassages).toEqual([
      { text: "Opening.", section: ["Source"], startLine: 3, endLine: 3 },
      { text: "Exact body text.", section: ["Source", "Details"], startLine: 7, endLine: 7 },
    ]);
    expect(projectedSource?.searchableUnits.filter(({ field }) => field === "tag")).toEqual([
      { field: "tag", text: "source-of-truth" },
      { field: "tag", text: "design" },
    ]);
    expect(projectedSource?.outgoingLinks).toEqual([
      {
        target: "../target.md",
        line: 8,
        resolvedConceptId: "target",
        origin: "authored",
        sourceConceptId: "guides/source",
        sourceRelativePath: "guides/source.md",
      },
      {
        target: "https://example.com",
        line: 9,
        origin: "authored",
        sourceConceptId: "guides/source",
        sourceRelativePath: "guides/source.md",
      },
    ]);
    expect(projectedTarget?.backlinks).toEqual([
      {
        origin: "derived-backlink",
        sourceConceptId: "guides/source",
        sourceRelativePath: "guides/source.md",
        targetConceptId: "target",
        line: 8,
      },
    ]);
    expect(projectedTarget).not.toHaveProperty("title");
    expect(projectedTarget?.searchableUnits.some(({ field }) => field === "title")).toBe(false);
  });

  it("resolves escaped JSON Pointer tokens over producer-defined frontmatter", () => {
    const frontmatter = {
      producer: { nested: ["one", { "a/b": { "c~d": "two" } }] },
    };
    expect(resolveKnowledgeFrontmatterPointer(frontmatter, "/producer/nested/1/a~1b/c~0d")).toEqual(
      { found: true, value: "two" },
    );
    expect(resolveKnowledgeFrontmatterPointer(frontmatter, "/producer/missing")).toEqual({
      found: false,
      reason: "not-found",
    });
    expect(resolveKnowledgeFrontmatterPointer(frontmatter, "producer/nested")).toEqual({
      found: false,
      reason: "invalid-pointer",
    });
    expect(resolveKnowledgeFrontmatterPointer(frontmatter, "/producer/~2invalid")).toEqual({
      found: false,
      reason: "invalid-pointer",
    });
  });
});
