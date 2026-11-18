import { withDetailedWork } from "../locations/testing.js";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Tracer from "effect/Tracer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { computeDistributionTreeIntegrity, resolveFileSelection } from "./index.js";

describe("selected distribution identity", () => {
  it.effect("refuses a retained link to omitted Git administration", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(root, ".git"));
      yield* fs.writeFileString(path.join(root, ".git", "config"), "administration");
      yield* fs.symlink(".git/config", path.join(root, "link"));
      const failure = yield* computeDistributionTreeIntegrity(root).pipe(Effect.flip);
      expect(failure.detail).toContain('points to excluded content ".git"');
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses selected links to omitted files or wholly omitted directories", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(root, "drafts"));
      yield* fs.writeFileString(path.join(root, "drafts", "note.md"), "unpublished");
      yield* fs.symlink("drafts", path.join(root, "link"));
      const selection = resolveFileSelection({
        packageDirectory: "",
        gitignore: [],
        exclude: ["drafts/"],
        manifest: "skill.json",
      });
      const failure = yield* computeDistributionTreeIntegrity(root, selection).pipe(Effect.flip);
      expect(failure.detail).toContain('points to excluded content "drafts"');
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "drops excluded directories and preserves implied parents and retained empty directories",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "source");
        const registry = path.join(root, "registry");
        for (const directory of [
          path.join(source, "evals"),
          path.join(source, "src", "deep"),
          path.join(source, "empty"),
          path.join(registry, "src", "deep"),
          path.join(registry, "empty"),
        ])
          yield* fs.makeDirectory(directory, { recursive: true });
        yield* fs.writeFileString(path.join(source, "evals", "case.json"), "{}");
        for (const directory of [source, registry]) {
          yield* fs.writeFileString(path.join(directory, "src", "deep", "body.md"), "content");
          yield* fs.writeFileString(path.join(directory, "skill.json"), "{}");
        }
        const selection = resolveFileSelection({
          packageDirectory: "",
          gitignore: [],
          exclude: ["evals/"],
          manifest: "skill.json",
        });
        const expected = yield* computeDistributionTreeIntegrity(registry);
        const spans: Tracer.NativeSpan[] = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        expect(
          yield* computeDistributionTreeIntegrity(source, selection).pipe(withDetailedWork(tracer)),
        ).toBe(expected);
        const hashes = spans.filter((span) => span.name === "axm.hash.distribution-tree");
        expect(hashes).toHaveLength(1);
        expect(hashes[0]?.attributes.get("axm.work.bytes")).toBe(9);
        expect(hashes[0]?.attributes.get("axm.work.count")).toBe(5);
        yield* fs.remove(path.join(registry, "empty"), { recursive: true });
        expect(yield* computeDistributionTreeIntegrity(registry)).not.toBe(expected);
        yield* fs.makeDirectory(path.join(registry, "empty"));
        yield* fs.chmod(path.join(registry, "src", "deep", "body.md"), 0o755);
        expect(yield* computeDistributionTreeIntegrity(registry)).not.toBe(expected);
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});

/**
 * Work evidence for one distribution-tree hash: every directory below the root
 * is listed exactly once, and a manifest whose bytes the caller already read is
 * not read again, while the walk keeps its link, stat and selection checks.
 */
describe("distribution identity work", () => {
  const recordingLayer = Layer.merge(
    NodeServices.layer,
    layerRecordingFileSystem(NodeFileSystem.layer),
  );

  /** A package tree with nested content, an empty directory and an excluded non-empty directory. */
  const writePackage = (directory: string, options: { readonly evals: boolean }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory(path.join(directory, "src", "deep"), { recursive: true });
      yield* fs.makeDirectory(path.join(directory, "empty"));
      yield* fs.writeFileString(path.join(directory, "src", "deep", "body.md"), "content");
      yield* fs.writeFileString(path.join(directory, "skill.json"), "{}");
      if (options.evals) {
        yield* fs.makeDirectory(path.join(directory, "evals"));
        yield* fs.writeFileString(path.join(directory, "evals", "case.json"), "{}");
      }
    });

  const excludeEvals = resolveFileSelection({
    packageDirectory: "",
    gitignore: [],
    exclude: ["evals/"],
    manifest: "skill.json",
  });

  it.effect("lists each directory of the walk once, including excluded ones", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const recording = yield* FileSystemRecorder;
      const root = yield* fs.makeTempDirectoryScoped();
      const source = path.join(root, "source");
      const twin = path.join(root, "twin");
      yield* writePackage(source, { evals: true });
      yield* writePackage(twin, { evals: false });
      const expected = yield* computeDistributionTreeIntegrity(twin);
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      recording.reset();

      expect(
        yield* computeDistributionTreeIntegrity(source, excludeEvals).pipe(
          withDetailedWork(tracer),
        ),
      ).toBe(expected);

      const listings = (directory: string) =>
        recording.calls({ method: "readDirectory", path: directory }).length;
      expect({
        root: listings(source),
        src: listings(path.join(source, "src")),
        deep: listings(path.join(source, "src", "deep")),
        empty: listings(path.join(source, "empty")),
        evals: listings(path.join(source, "evals")),
        total: recording.calls({ method: "readDirectory" }).length,
      }).toEqual({ root: 1, src: 1, deep: 1, empty: 1, evals: 1, total: 5 });
      expect(spans.filter((span) => span.name === "axm.hash.distribution-tree")).toHaveLength(1);
    }).pipe(Effect.provide(recordingLayer)),
  );

  it.effect("hashes a prepared manifest without reading it again", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const recording = yield* FileSystemRecorder;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* writePackage(root, { evals: true });
      const manifest = path.join(root, "skill.json");
      const expected = yield* computeDistributionTreeIntegrity(root, excludeEvals);
      const bytes = yield* fs.readFile(manifest);
      recording.reset();

      expect(
        yield* computeDistributionTreeIntegrity(root, excludeEvals, {
          path: "skill.json",
          bytes,
        }),
      ).toBe(expected);
      expect(recording.contentReads(manifest)).toBe(0);
      expect(recording.counts(manifest)).toEqual({ readLink: 1, stat: 1 });
      expect(recording.contentReads(path.join(root, "src", "deep", "body.md"))).toBe(1);

      yield* fs.chmod(manifest, 0o755);
      expect(
        yield* computeDistributionTreeIntegrity(root, excludeEvals, { path: "skill.json", bytes }),
      ).not.toBe(expected);
    }).pipe(Effect.provide(recordingLayer)),
  );

  it.effect("ignores prepared bytes for a name the walk does not find as a regular file", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const recording = yield* FileSystemRecorder;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* writePackage(root, { evals: false });
      yield* fs.writeFileString(path.join(root, "target.json"), "{}");
      yield* fs.symlink("target.json", path.join(root, "linked.json"));
      const expected = yield* computeDistributionTreeIntegrity(root);
      const unrelated = new TextEncoder().encode("unrelated");
      recording.reset();

      for (const name of ["linked.json", "src", "missing.json", "SKILL.JSON"])
        expect(
          yield* computeDistributionTreeIntegrity(root, undefined, {
            path: name,
            bytes: unrelated,
          }),
        ).toBe(expected);
      expect(recording.contentReads(path.join(root, "skill.json"))).toBe(4);
      expect(recording.contentReads(path.join(root, "linked.json"))).toBe(0);
    }).pipe(Effect.provide(recordingLayer)),
  );
});
