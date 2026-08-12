import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { KnowledgeBundleFqnSchema } from "./concept-ref.js";
import {
  KnowledgeIndex,
  KnowledgeIndexLive,
  makeKnowledgeIndexSnapshot,
  queryKnowledgeIndex,
  type KnowledgeIndexBundleInput,
} from "./knowledge-index.js";
import { makeKnowledgeQuery } from "./knowledge-query.js";
import { computeKnowledgeSourceRevision } from "./knowledge-revision.js";
import type { KnowledgeConcept, KnowledgeInspection } from "./okf.js";

const encoder = new TextEncoder();
const bundleFqn = Schema.decodeUnknownSync(KnowledgeBundleFqnSchema)("@agentxm/knowledge/platform");

const concept = (
  id: string,
  body: string,
  values?: Partial<KnowledgeConcept>,
): KnowledgeConcept => ({
  id,
  kind: "concept",
  title: id,
  authoredTitle: id,
  trust: "unverified",
  authoredLinks: [],
  relativePath: `${id}.md`,
  body,
  ...values,
});

const bundle = (concepts: ReadonlyArray<KnowledgeConcept>): KnowledgeIndexBundleInput => {
  const inspection: KnowledgeInspection = { concepts, diagnostics: [], okfVersion: "0.2" };
  return {
    bundle: bundleFqn,
    version: "1.2.3",
    inspection,
    sources: concepts.map((entry) => {
      const bytes = encoder.encode(entry.body);
      return {
        bundle: bundleFqn,
        relativePath: entry.relativePath,
        bytes,
        sourceRevision: computeKnowledgeSourceRevision(bytes),
      };
    }),
  };
};

it("builds resolved identities and deterministic source-backed revisions", () => {
  const snapshot = makeKnowledgeIndexSnapshot([
    bundle([concept("guides/start", "# Start\n\nBody")]),
  ]);

  expect(snapshot.concepts).toHaveLength(1);
  expect(snapshot.concepts[0]?.ref).toMatchObject({
    bundle: "@agentxm/knowledge/platform",
    conceptId: "guides/start",
    bundleVersion: "1.2.3",
  });
  expect(snapshot.concepts[0]?.ref.contentRevision).toMatch(/^sha256:[0-9a-f]{64}$/u);
  expect(snapshot.concepts[0]?.projectionRevision).toMatch(/^sha256:[0-9a-f]{64}$/u);
});

it("applies default kind and lifecycle filters before deterministic ranking", () => {
  const snapshot = makeKnowledgeIndexSnapshot([
    bundle([
      concept("index", "# Index", { kind: "index" }),
      concept("deprecated", "# Deprecated", { status: "deprecated" }),
      concept("beta", "# Beta\n\nAuthentication details", { tags: ["identity"] }),
      concept("alpha", "# Alpha\n\nAuthentication details", { tags: ["identity"] }),
    ]),
  ]);

  const defaults = queryKnowledgeIndex(snapshot, makeKnowledgeQuery("project", []));
  expect(defaults.items.map(({ ref }) => ref.conceptId)).toEqual(["alpha", "beta"]);

  const reserved = queryKnowledgeIndex(
    snapshot,
    makeKnowledgeQuery("project", [
      { kind: "metadata", field: "kind", operator: "equals", value: "index" },
    ]),
  );
  expect(reserved.items.map(({ ref }) => ref.conceptId)).toEqual(["index"]);

  const deprecated = queryKnowledgeIndex(
    snapshot,
    makeKnowledgeQuery("project", [
      { kind: "lifecycle", field: "status", operator: "equals", value: "deprecated" },
    ]),
  );
  expect(deprecated.items.map(({ ref }) => ref.conceptId)).toEqual(["deprecated"]);
});

it("aggregates field and multi-passage matches into one bounded concept result", () => {
  const snapshot = makeKnowledgeIndexSnapshot([
    bundle([
      concept(
        "guides/start",
        "# Start\n\nAuthentication overview.\n\n## Details\n\nAuthentication implementation.",
        { tags: ["source-of-truth"] },
      ),
    ]),
  ]);
  const page = queryKnowledgeIndex(
    snapshot,
    makeKnowledgeQuery(
      "project",
      [
        { kind: "term", value: "source" },
        { kind: "field", field: "body", clause: { kind: "term", value: "authentication" } },
      ],
      { passageLimit: 1, passageLength: 12 },
    ),
  );

  expect(page.count).toBe(1);
  expect(page.items).toHaveLength(1);
  expect(page.items[0]?.matchedFields).toEqual(["body", "tag"]);
  expect(page.items[0]?.passages).toHaveLength(1);
  expect(page.items[0]?.passages[0]?.text.length).toBeLessThanOrEqual(12);
  expect(page.items[0]).not.toHaveProperty("chunkId");
});

it("filters extension properties through the preserved RFC 6901 mapping", () => {
  const snapshot = makeKnowledgeIndexSnapshot([
    bundle([
      concept("guides/start", "# Start", {
        frontmatter: { producer: { name: "AgentXM" } },
      }),
      concept("guides/other", "# Other", {
        frontmatter: { producer: { name: "Elsewhere" } },
      }),
    ]),
  ]);
  const page = queryKnowledgeIndex(
    snapshot,
    makeKnowledgeQuery("project", [
      {
        kind: "property",
        pointer: "/producer/name",
        operator: "equals",
        value: "agentxm",
      },
    ]),
  );

  expect(page.items.map(({ ref }) => ref.conceptId)).toEqual(["guides/start"]);
});

it.effect("exposes the in-memory implementation through a replaceable Effect service", () =>
  Effect.gen(function* () {
    const index = yield* KnowledgeIndex;
    const snapshot = yield* index.makeSnapshot([
      bundle([concept("guides/start", "# Start\n\nAuthentication")]),
    ]);
    const page = yield* index.query(
      snapshot,
      makeKnowledgeQuery("project", [{ kind: "term", value: "authentication" }]),
    );
    expect(page.count).toBe(1);
  }).pipe(Effect.provide(KnowledgeIndexLive)),
);
