import { expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { KnowledgeBundleFqnSchema } from "./concept-ref.js";
import { relatedKnowledgeConcepts, resolveKnowledgeConcept } from "./knowledge-graph.js";
import { makeKnowledgeIndexSnapshot, type KnowledgeIndexBundleInput } from "./knowledge-index.js";
import { computeKnowledgeSourceRevision } from "./knowledge-revision.js";
import type { KnowledgeConcept } from "./okf.js";

const encoder = new TextEncoder();
const bundleFqn = Schema.decodeUnknownSync(KnowledgeBundleFqnSchema)("@acme/knowledge/platform");

const concept = (id: string, body: string): KnowledgeConcept => ({
  id,
  kind: "concept",
  title: id,
  authoredTitle: id,
  authoredLinks: [],
  relativePath: `${id}.md`,
  body,
});

const snapshot = () => {
  const linked: ReadonlyArray<KnowledgeConcept> = [
    {
      ...concept("alpha", "[Beta](beta.md)"),
      authoredLinks: [{ target: "beta.md", line: 1, resolvedConceptId: "beta" }],
    },
    {
      ...concept("beta", "[Gamma](gamma.md)"),
      authoredLinks: [{ target: "gamma.md", line: 1, resolvedConceptId: "gamma" }],
    },
    concept("gamma", "Done"),
  ];
  const input: KnowledgeIndexBundleInput = {
    bundle: bundleFqn,
    version: "1.0.0",
    inspection: { concepts: linked, diagnostics: [], okfVersion: "0.2" },
    sources: linked.map((entry) => {
      const bytes = encoder.encode(entry.body);
      return {
        bundle: bundleFqn,
        relativePath: entry.relativePath,
        bytes,
        sourceRevision: computeKnowledgeSourceRevision(bytes),
      };
    }),
  };
  return makeKnowledgeIndexSnapshot([input]);
};

it("traverses outgoing links and derived backlinks without cycles", () => {
  const related = relatedKnowledgeConcepts(
    snapshot(),
    { bundle: bundleFqn, conceptId: "alpha" },
    3,
  );
  expect(related.map(({ ref, depth }) => [ref.conceptId, depth])).toEqual([
    ["beta", 1],
    ["gamma", 2],
  ]);
});

it("resolves exact refs and bounds deterministic fuzzy candidates", () => {
  const current = snapshot();
  expect(resolveKnowledgeConcept(current, "@acme/knowledge/platform#alpha").outcome).toBe(
    "resolved",
  );
  const fuzzy = resolveKnowledgeConcept(current, "beta", 10, true);
  expect(fuzzy.outcome).toBe("resolved");
});
