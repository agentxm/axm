import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { KnowledgeProjectedConcept } from "./knowledge-projection.js";
import {
  captureKnowledgeCorpus,
  computeKnowledgeCorpusFingerprint,
  computeKnowledgeProjectionRevision,
  computeKnowledgeSourceRevision,
  type CapturedKnowledgeSource,
} from "./knowledge-revision.js";

const encoder = new TextEncoder();
const bytes = (value: string): Uint8Array => encoder.encode(value);

const projectedConcept = (title: string): KnowledgeProjectedConcept => ({
  bundle: "@agentxm/knowledge/platform",
  conceptId: "guides/start",
  kind: "concept",
  title,
  relativePath: "guides/start.md",
  bodyPassages: [{ text: "Body", section: ["Start"], startLine: 3, endLine: 3 }],
  searchableUnits: [{ field: "title", text: title }],
  outgoingLinks: [],
  backlinks: [],
});

it("derives source revisions from the exact authoritative bytes", () => {
  expect(computeKnowledgeSourceRevision(bytes("# Start\n"))).toBe(
    computeKnowledgeSourceRevision(bytes("# Start\n")),
  );
  expect(computeKnowledgeSourceRevision(bytes("# Start\n"))).not.toBe(
    computeKnowledgeSourceRevision(bytes("# Start\n\n")),
  );
});

it("fingerprints a normalized, order-independent corpus without filesystem timestamps", () => {
  const start: CapturedKnowledgeSource = {
    bundle: "@agentxm/knowledge/platform",
    relativePath: "guides\\start.md",
    modifiedAt: 1,
    bytes: bytes("start"),
    sourceRevision: computeKnowledgeSourceRevision(bytes("start")),
  };
  const index: CapturedKnowledgeSource = {
    bundle: "@agentxm/knowledge/platform",
    relativePath: "index.md",
    modifiedAt: 2,
    bytes: bytes("index"),
    sourceRevision: computeKnowledgeSourceRevision(bytes("index")),
  };
  const first = [start, index];
  const equivalent = [
    { ...index, modifiedAt: 999 },
    { ...start, relativePath: "guides/start.md", modifiedAt: 998 },
  ];

  expect(computeKnowledgeCorpusFingerprint(first)).toBe(
    computeKnowledgeCorpusFingerprint(equivalent),
  );
  expect(
    computeKnowledgeCorpusFingerprint([
      { ...index, modifiedAt: 999 },
      { ...start, relativePath: "guides/start.md", modifiedAt: 998, bytes: bytes("changed") },
    ]),
  ).not.toBe(computeKnowledgeCorpusFingerprint(equivalent));
});

it("derives projection revisions canonically and only from the projected record", () => {
  const original = projectedConcept("Start");
  const reordered = {
    backlinks: original.backlinks,
    outgoingLinks: original.outgoingLinks,
    searchableUnits: original.searchableUnits,
    bodyPassages: original.bodyPassages,
    relativePath: original.relativePath,
    title: "Start",
    kind: original.kind,
    conceptId: original.conceptId,
    bundle: original.bundle,
  } satisfies KnowledgeProjectedConcept;

  expect(computeKnowledgeProjectionRevision(original)).toBe(
    computeKnowledgeProjectionRevision(reordered),
  );
  expect(computeKnowledgeProjectionRevision(projectedConcept("Changed"))).not.toBe(
    computeKnowledgeProjectionRevision(original),
  );
});

it("derives a stable projection revision when YAML aliases form a cycle", () => {
  const producer: Record<string, unknown> = {};
  producer["self"] = producer;
  const concept = {
    ...projectedConcept("Cyclic"),
    frontmatter: { producer },
  } satisfies KnowledgeProjectedConcept;

  expect(computeKnowledgeProjectionRevision(concept)).toBe(
    computeKnowledgeProjectionRevision(concept),
  );
});

it.effect("retries a changing corpus and returns one stable capture", () =>
  Effect.gen(function* () {
    let reads = 0;
    const corpus = yield* captureKnowledgeCorpus(
      [{ bundle: "@agentxm/knowledge/platform", relativePath: "index.md" }],
      () => Effect.sync(() => bytes(reads++ === 0 ? "first" : "stable")),
    );

    expect(reads).toBe(4);
    expect(new TextDecoder().decode(corpus.sources[0]?.bytes)).toBe("stable");
    expect(corpus.sources[0]?.sourceRevision).toBe(computeKnowledgeSourceRevision(bytes("stable")));
  }),
);

it.effect("fails with a typed error rather than yielding a mixed changing corpus", () =>
  Effect.gen(function* () {
    let reads = 0;
    const failure = yield* captureKnowledgeCorpus(
      [{ bundle: "@agentxm/knowledge/platform", relativePath: "index.md" }],
      () => Effect.sync(() => bytes(`version-${reads++}`)),
      { maxAttempts: 2 },
    ).pipe(Effect.flip);

    expect(failure).toMatchObject({ _tag: "KnowledgeCorpusChangingError", attempts: 2 });
  }),
);

const corpusSources = [
  { bundle: "@agentxm/knowledge/platform", relativePath: "index.md" },
  { bundle: "@agentxm/knowledge/platform", relativePath: "guides/start.md" },
  { bundle: "@agentxm/knowledge/platform", relativePath: "guides/next.md" },
];

const hashedSources = (
  facts: ReadonlyArray<{ kind: string; attributes: { "axm.work.count"?: number } }>,
) =>
  facts
    .filter((fact) => fact.kind === "axm.hash.content")
    .reduce((total, fact) => total + (fact.attributes["axm.work.count"] ?? 0), 0);

it.effect("hashes each source of a stable capture once, after the confirming read", () =>
  Effect.gen(function* () {
    const work = workObservations(false);
    let reads = 0;
    const corpus = yield* captureKnowledgeCorpus(corpusSources, (source) =>
      Effect.sync(() => {
        reads += 1;
        return bytes(`content of ${source.relativePath}`);
      }),
    ).pipe(work.provide);

    expect(reads).toBe(6);
    expect(hashedSources(work.facts)).toBe(3);
    expect(corpus.sources.map((source) => source.relativePath)).toEqual([
      "guides/next.md",
      "guides/start.md",
      "index.md",
    ]);
    expect(corpus.sources.map((source) => source.sourceRevision)).toEqual(
      corpus.sources.map((source) =>
        computeKnowledgeSourceRevision(bytes(`content of ${source.relativePath}`)),
      ),
    );
  }),
);

it.effect("hashes only the capture that settles after a changing attempt", () =>
  Effect.gen(function* () {
    const work = workObservations(false);
    let reads = 0;
    const corpus = yield* captureKnowledgeCorpus(corpusSources, (source) =>
      Effect.sync(() => {
        reads += 1;
        return bytes(reads <= 3 ? `first ${source.relativePath}` : `stable ${source.relativePath}`);
      }),
    ).pipe(work.provide);

    expect(reads).toBe(12);
    expect(hashedSources(work.facts)).toBe(3);
    expect(corpus.sources.map((source) => source.sourceRevision)).toEqual(
      corpus.sources.map((source) =>
        computeKnowledgeSourceRevision(bytes(`stable ${source.relativePath}`)),
      ),
    );
  }),
);

it.effect("hashes no source when the corpus never settles", () =>
  Effect.gen(function* () {
    const work = workObservations(false);
    let reads = 0;
    const failure = yield* captureKnowledgeCorpus(
      corpusSources,
      () => Effect.sync(() => bytes(`version-${reads++}`)),
      { maxAttempts: 2 },
    ).pipe(work.provide, Effect.flip);

    expect(failure).toMatchObject({ _tag: "KnowledgeCorpusChangingError", attempts: 2 });
    expect(reads).toBe(12);
    expect(hashedSources(work.facts)).toBe(0);
  }),
);

it.effect("records no hash work for an empty corpus", () =>
  Effect.gen(function* () {
    const work = workObservations(false);
    const corpus = yield* captureKnowledgeCorpus([], () => Effect.succeed(bytes("unused"))).pipe(
      work.provide,
    );

    expect(corpus.sources).toEqual([]);
    expect(work.facts.filter((fact) => fact.kind === "axm.hash.content")).toEqual([]);
  }),
);
