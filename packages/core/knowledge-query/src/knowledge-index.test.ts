import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";
import { KnowledgeBundleFqnSchema } from "@agentxm/extension-model/unstable/knowledge/concept-ref";
import {
  KnowledgeIndex,
  makeKnowledgeIndexSnapshot,
  queryKnowledgeIndex,
  queryKnowledgeIndexResult,
  type KnowledgeIndexBundleInput,
} from "./knowledge-index.js";
import { KnowledgeIndexLive } from "./live.js";
import { makeKnowledgeQuery } from "./knowledge-query.js";
import { computeKnowledgeSourceRevision } from "./knowledge-revision.js";
import type {
  KnowledgeConcept,
  KnowledgeInspection,
} from "@agentxm/registry-protocol/unstable/knowledge/okf";

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

it("pages with an opaque cursor bound to corpus, query, position, and age", () => {
  const snapshot = makeKnowledgeIndexSnapshot([
    bundle([concept("alpha", "# Alpha"), concept("beta", "# Beta")]),
  ]);
  const firstQuery = makeKnowledgeQuery("project", [], { resultLimit: 1 });
  const first = queryKnowledgeIndex(snapshot, firstQuery, 1_000);
  expect(first.items.map(({ ref }) => ref.conceptId)).toEqual(["alpha"]);
  expect(first.hasMore).toBe(true);
  const cursor = first.cursor;
  if (cursor === undefined) throw new Error("Expected the first page to return a cursor");

  const second = queryKnowledgeIndex(
    snapshot,
    makeKnowledgeQuery("project", [], { resultLimit: 1, cursor }),
    2_000,
  );
  expect(second.items.map(({ ref }) => ref.conceptId)).toEqual(["beta"]);
  expect(second.hasMore).toBe(false);

  const changed = queryKnowledgeIndexResult(
    makeKnowledgeIndexSnapshot([bundle([concept("gamma", "# Gamma")])]),
    makeKnowledgeQuery("project", [], { resultLimit: 1, cursor }),
    2_000,
  );
  expect(Result.isFailure(changed) && changed.failure.reason).toBe("corpus-changed");

  const expired = queryKnowledgeIndexResult(
    snapshot,
    makeKnowledgeQuery("project", [], { resultLimit: 1, cursor }),
    86_401_001,
  );
  expect(Result.isFailure(expired) && expired.failure.reason).toBe("expired");
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

it("does not reward repeated body passages and reports exact phrase spans", () => {
  const snapshot = makeKnowledgeIndexSnapshot([
    bundle([
      concept("alpha", "# Alpha\n\nSession-flow details."),
      concept("beta", "# Beta\n\nSession flow.\n\n## Again\n\nSession flow."),
    ]),
  ]);
  const page = queryKnowledgeIndex(
    snapshot,
    makeKnowledgeQuery("project", [{ kind: "phrase", value: "session flow" }]),
    0,
  );

  expect(page.items.map(({ ref }) => ref.conceptId)).toEqual(["alpha", "beta"]);
  expect(page.items[0]?.passages[0]?.spans[0]).toMatchObject({
    start: 0,
    end: "Session-flow".length,
  });
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
