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
    expect(corpus.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
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
