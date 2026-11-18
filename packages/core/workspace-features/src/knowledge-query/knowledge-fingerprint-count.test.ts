/**
 * A captured Knowledge corpus is fingerprinted once, by the index snapshot
 * that publishes the fingerprint. A bundle fingerprint is hashed separately
 * only when its sources differ from the whole corpus's.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { vi } from "vitest";
import { KnowledgeBundleFqnSchema } from "@agentxm/extension-model/unstable/knowledge/concept-ref";
import { captureKnowledgeIndexBundles } from "./knowledge-capture.js";
import { makeKnowledgeIndexSnapshot } from "./knowledge-index.js";
import { computeKnowledgeCorpusFingerprint } from "./knowledge-revision.js";

/** Every SHA-256 the process creates, with the parts written to it. */
const hashes = vi.hoisted(() => {
  const created: Array<Array<unknown>> = [];
  return { created };
});

vi.mock("node:crypto", async (importOriginal) => {
  const crypto = await importOriginal<typeof import("node:crypto")>();
  return {
    ...crypto,
    createHash: (...args: Parameters<typeof crypto.createHash>) => {
      const hash = crypto.createHash(...args);
      const parts: Array<unknown> = [];
      hashes.created.push(parts);
      const update = hash.update.bind(hash);
      return Object.assign(hash, {
        update: (...input: Parameters<typeof update>) => {
          parts.push(input[0]);
          return update(...input);
        },
      });
    },
  };
});

/** Revision hashes write the length-prefixed domain as their first part. */
const hashesOf = (domain: string): number =>
  hashes.created.filter((parts) => {
    const written = parts[2];
    return written instanceof Uint8Array && new TextDecoder().decode(written) === domain;
  }).length;

const CORPUS_DOMAIN = "axm-knowledge-corpus-fingerprint-v1";
const SOURCE_DOMAIN = "axm-knowledge-source-revision-v1";

const bundleFqn = Schema.decodeUnknownSync(KnowledgeBundleFqnSchema);

const writeBundle = (root: string, topic: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.writeFileString(
      path.join(root, "index.md"),
      `---\nokf_version: "0.2"\n---\n# ${topic}\n\n- [Start](start.md)\n`,
    );
    yield* fs.writeFileString(
      path.join(root, "start.md"),
      `---\ntype: guide\ndescription: Start with ${topic}\n---\n# Start\n\n${topic} details.\n`,
    );
  });

/** Capture the descriptors' corpus and index it, counting hashes of both steps. */
const captureAndIndex = (
  descriptors: Parameters<typeof captureKnowledgeIndexBundles>[0],
  options?: Parameters<typeof captureKnowledgeIndexBundles>[1],
) =>
  Effect.gen(function* () {
    hashes.created.length = 0;
    const captured = yield* captureKnowledgeIndexBundles(descriptors, options);
    const capture = { corpus: hashesOf(CORPUS_DOMAIN), source: hashesOf(SOURCE_DOMAIN) };
    const snapshot = makeKnowledgeIndexSnapshot(captured);
    const total = { corpus: hashesOf(CORPUS_DOMAIN), source: hashesOf(SOURCE_DOMAIN) };
    return { captured, snapshot, capture, total };
  });

layer(NodeServices.layer, { excludeTestServices: true })("Knowledge corpus fingerprint", (it) => {
  it.effect("fingerprints a one-bundle corpus once and reuses it as the bundle's", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* writeBundle(root, "Platform");
      const { captured, snapshot, capture, total } = yield* captureAndIndex([
        { bundle: bundleFqn("@agentxm/knowledge/platform"), version: "1.0.0", sourceRoot: root },
      ]);

      expect(capture).toEqual({ corpus: 0, source: 2 });
      expect(total).toEqual({ corpus: 1, source: 2 });
      expect(snapshot.fingerprint).toBe(
        computeKnowledgeCorpusFingerprint(captured.flatMap(({ sources }) => sources)),
      );
      expect(snapshot.concepts).not.toHaveLength(0);
      expect(new Set(snapshot.concepts.map(({ ref }) => ref.bundleFingerprint))).toEqual(
        new Set([snapshot.fingerprint]),
      );
    }).pipe(Effect.scoped),
  );

  it.effect("fingerprints each bundle of a two-bundle corpus and the corpus once", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const platform = path.join(root, "platform");
      const handbook = path.join(root, "handbook");
      yield* fs.makeDirectory(platform);
      yield* fs.makeDirectory(handbook);
      yield* writeBundle(platform, "Platform");
      yield* writeBundle(handbook, "Handbook");
      const { captured, snapshot, capture, total } = yield* captureAndIndex([
        {
          bundle: bundleFqn("@agentxm/knowledge/platform"),
          version: "1.0.0",
          sourceRoot: platform,
        },
        {
          bundle: bundleFqn("@agentxm/knowledge/handbook"),
          version: "1.0.0",
          sourceRoot: handbook,
        },
      ]);

      expect(capture).toEqual({ corpus: 0, source: 4 });
      expect(total).toEqual({ corpus: 3, source: 4 });
      expect(snapshot.fingerprint).toBe(
        computeKnowledgeCorpusFingerprint(captured.flatMap(({ sources }) => sources)),
      );
      const bundleFingerprints = new Map(
        snapshot.concepts.map(({ ref }) => [ref.bundle, ref.bundleFingerprint]),
      );
      expect(bundleFingerprints.size).toBe(2);
      for (const bundle of captured) {
        expect(bundleFingerprints.get(bundle.bundle)).toBe(
          computeKnowledgeCorpusFingerprint(bundle.sources),
        );
        expect(bundleFingerprints.get(bundle.bundle)).not.toBe(snapshot.fingerprint);
      }
      expect(new Set(bundleFingerprints.values()).size).toBe(2);
    }).pipe(Effect.scoped),
  );

  it.effect("fingerprints an empty corpus once", () =>
    Effect.gen(function* () {
      const { snapshot, capture, total } = yield* captureAndIndex([]);

      expect(capture).toEqual({ corpus: 0, source: 0 });
      expect(total).toEqual({ corpus: 1, source: 0 });
      expect(snapshot.fingerprint).toBe(computeKnowledgeCorpusFingerprint([]));
    }),
  );

  it.effect("hashes only the settled capture of a corpus that changed once", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* writeBundle(root, "Platform");
      const start = path.join(root, "start.md");
      let reads = 0;
      const { snapshot, capture, total } = yield* captureAndIndex([
        { bundle: bundleFqn("@agentxm/knowledge/platform"), version: "1.0.0", sourceRoot: root },
      ]).pipe(
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          readFile: (file) =>
            file === start && ++reads === 1
              ? Effect.succeed(new TextEncoder().encode("# Changing\n"))
              : fs.readFile(file),
        }),
      );

      expect(reads).toBe(4);
      expect(capture).toEqual({ corpus: 0, source: 2 });
      expect(total).toEqual({ corpus: 1, source: 2 });
      expect(snapshot.concepts).not.toHaveLength(0);
    }).pipe(Effect.scoped),
  );
});
