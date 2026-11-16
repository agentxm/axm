import { withDetailedWork } from "../../locations/testing.js";
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Tracer from "effect/Tracer";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import {
  computeMaterializedTreeDigests,
  computeMaterializedTreeDigestsMatching,
  computeMaterializedTreeIntegrity,
} from "./materialized-tree.js";
import { computePackageContentHash } from "./package-hash.js";

const layer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

describe("computeMaterializedTreeIntegrity", () => {
  it.effect("retains the persisted digest for a mixed package tree", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(root, "empty"));
      yield* fs.makeDirectory(path.join(root, "src"));
      yield* fs.writeFileString(path.join(root, "src", "a.txt"), "one\n");
      yield* fs.chmod(path.join(root, "src", "a.txt"), 0o644);
      yield* fs.symlink("src/a.txt", path.join(root, "link.txt"));
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      expect(yield* computeMaterializedTreeIntegrity(root).pipe(withDetailedWork(tracer))).toBe(
        "sha256-tree-v2:42310023912ae6c902e6d85f3181c2b6d615edd8b018f59e8c9707303be9d903",
      );
      const hashes = spans.filter((span) => span.name === "axm.hash.materialized-tree");
      expect(hashes).toHaveLength(1);
      expect(hashes[0]?.attributes.get("axm.work.bytes")).toBe(13);
      expect(hashes[0]?.attributes.get("axm.work.count")).toBe(4);
    }).pipe(Effect.scoped, Effect.provide(layer)),
  );

  for (const method of ["lstat", "readLink"] as const) {
    it.effect(`preserves ${method} failures instead of hashing a link referent`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        yield* fs.writeFileString(path.join(root, "target.txt"), "target");
        const link = path.join(root, "link.txt");
        yield* fs.symlink("target.txt", link);
        const failure = PlatformError.systemError({
          _tag: "PermissionDenied",
          module: "FileSystem",
          method,
          pathOrDescriptor: link,
        });
        const observed = yield* computeMaterializedTreeIntegrity(root).pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            lstat: (target) =>
              method === "lstat" && target === link ? Effect.fail(failure) : fs.lstat(target),
            readLink: (target) =>
              method === "readLink" && target === link ? Effect.fail(failure) : fs.readLink(target),
          }),
          Effect.flip,
        );
        expect(observed).toMatchObject({ _tag: "MaterializedTreeInvalid", cause: failure });
      }).pipe(Effect.scoped, Effect.provide(layer)),
    );
  }

  it.effect("is deterministic and changes for edits, additions, and removals", () =>
    Effect.gen(function* () {
      const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-tree-"));
      nodeFs.mkdirSync(nodePath.join(root, "src"));
      nodeFs.writeFileSync(nodePath.join(root, "src", "a.txt"), "one");
      const first = yield* computeMaterializedTreeIntegrity(root).pipe(Effect.provide(layer));
      const repeated = yield* computeMaterializedTreeIntegrity(root).pipe(Effect.provide(layer));
      expect(repeated).toBe(first);
      nodeFs.writeFileSync(nodePath.join(root, "src", "a.txt"), "two");
      const edited = yield* computeMaterializedTreeIntegrity(root).pipe(Effect.provide(layer));
      expect(edited).not.toBe(first);
      nodeFs.writeFileSync(nodePath.join(root, "src", "b.txt"), "extra");
      const added = yield* computeMaterializedTreeIntegrity(root).pipe(Effect.provide(layer));
      expect(added).not.toBe(edited);
      nodeFs.rmSync(nodePath.join(root, "src", "a.txt"));
      const removed = yield* computeMaterializedTreeIntegrity(root).pipe(Effect.provide(layer));
      expect(removed).not.toBe(added);
    }),
  );

  it.effect("includes contained link targets, executable bits, and empty directories", () =>
    Effect.gen(function* () {
      const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-tree-link-"));
      nodeFs.writeFileSync(nodePath.join(root, "target.txt"), "target");
      nodeFs.symlinkSync("target.txt", nodePath.join(root, "link.txt"));
      const first = yield* computeMaterializedTreeIntegrity(root).pipe(Effect.provide(layer));
      nodeFs.unlinkSync(nodePath.join(root, "link.txt"));
      nodeFs.symlinkSync("./target.txt", nodePath.join(root, "link.txt"));
      const changedLink = yield* computeMaterializedTreeIntegrity(root).pipe(Effect.provide(layer));
      expect(changedLink).not.toBe(first);
      nodeFs.chmodSync(nodePath.join(root, "target.txt"), 0o755);
      const executable = yield* computeMaterializedTreeIntegrity(root).pipe(Effect.provide(layer));
      expect(executable).not.toBe(changedLink);
      nodeFs.mkdirSync(nodePath.join(root, "empty"));
      const directory = yield* computeMaterializedTreeIntegrity(root).pipe(Effect.provide(layer));
      expect(directory).not.toBe(executable);
      nodeFs.unlinkSync(nodePath.join(root, "link.txt"));
      nodeFs.symlinkSync("../outside.txt", nodePath.join(root, "link.txt"));
      const result = yield* Effect.result(
        computeMaterializedTreeIntegrity(root).pipe(Effect.provide(layer)),
      );
      expect(result._tag).toBe("Failure");
    }),
  );
});

describe("computeMaterializedTreeDigests", () => {
  /**
   * A tree whose per-directory code-unit order differs from its locale order,
   * with an executable file, a contained link, and nested and empty directories.
   */
  const writeMixedTree = (root: string) => {
    nodeFs.writeFileSync(nodePath.join(root, "B.txt"), "upper");
    nodeFs.chmodSync(nodePath.join(root, "B.txt"), 0o755);
    nodeFs.writeFileSync(nodePath.join(root, "a.txt"), "lower");
    nodeFs.mkdirSync(nodePath.join(root, "_under"));
    nodeFs.writeFileSync(nodePath.join(root, "_under", "z.txt"), "z");
    nodeFs.mkdirSync(nodePath.join(root, "empty"));
    nodeFs.symlinkSync("a.txt", nodePath.join(root, "link"));
    nodeFs.mkdirSync(nodePath.join(root, "nested", "deeper"), { recursive: true });
    nodeFs.writeFileSync(nodePath.join(root, "nested", "deeper", "run.sh"), "#!/bin/sh\n");
    nodeFs.chmodSync(nodePath.join(root, "nested", "deeper", "run.sh"), 0o700);
    return {
      files: ["B.txt", "a.txt", "_under/z.txt", "nested/deeper/run.sh"],
      directories: ["", "_under", "empty", "nested", "nested/deeper"],
      links: ["link"],
    };
  };

  const spanTracer = () => {
    const spans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    const work = (name: string) =>
      spans
        .filter((span) => span.name === name)
        .map((span) => ({
          count: span.attributes.get("axm.work.count"),
          bytes: span.attributes.get("axm.work.bytes"),
        }));
    return { tracer, work };
  };

  it.effect("frames both digests from one walk and one read of each file", () =>
    Effect.gen(function* () {
      const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-tree-digests-"));
      try {
        const tree = writeMixedTree(root);
        const separate = spanTracer();
        const expected = {
          treeIntegrity: yield* computeMaterializedTreeIntegrity(root).pipe(
            withDetailedWork(separate.tracer),
          ),
          contentHash: yield* computePackageContentHash(root).pipe(
            withDetailedWork(separate.tracer),
          ),
        };
        const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
        const combined = spanTracer();
        const digests = yield* computeMaterializedTreeDigests(root).pipe(
          withDetailedWork(combined.tracer),
          Effect.provideService(FileSystem.FileSystem, fileSystem),
        );
        expect(digests).toEqual(expected);
        // Both digests stay observable as the same logical hash work.
        for (const kind of ["axm.hash.materialized-tree", "axm.hash.package"])
          expect(combined.work(kind)).toEqual(separate.work(kind));
        const absolute = (relative: string) =>
          relative === "" ? root : nodePath.join(root, relative);
        expect({
          reads: tree.files.map((file) => recording.contentReads(absolute(file))),
          inspections: [...tree.files, ...tree.directories.slice(1), ...tree.links].map(
            (entry) => recording.counts(absolute(entry)).lstat,
          ),
          listings: tree.directories.map(
            (directory) => recording.counts(absolute(directory)).readDirectory,
          ),
          linkReads: tree.links.map((link) => recording.counts(absolute(link)).readLink),
        }).toEqual({
          reads: [1, 1, 1, 1],
          inspections: [1, 1, 1, 1, 1, 1, 1, 1, 1],
          listings: [1, 1, 1, 1, 1],
          linkReads: [1],
        });
      } finally {
        nodeFs.rmSync(root, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(layer)),
  );

  it.effect("frames the package hash only of a walk that matches the expected tree", () =>
    Effect.gen(function* () {
      const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-tree-digests-"));
      try {
        writeMixedTree(root);
        const expected = yield* computeMaterializedTreeDigests(root);
        const other = yield* computeMaterializedTreeIntegrity(root, {
          includeFile: (relative) => relative !== "a.txt",
        });
        const judged = (integrity: typeof other, frame: boolean) =>
          Effect.gen(function* () {
            const { tracer, work } = spanTracer();
            const digests = yield* computeMaterializedTreeDigestsMatching(
              root,
              integrity,
              frame,
            ).pipe(withDetailedWork(tracer));
            return {
              digests,
              walks: work("axm.hash.materialized-tree").length,
              framings: work("axm.hash.package").length,
            };
          });
        expect({
          matching: yield* judged(expected.treeIntegrity, true),
          unframed: yield* judged(expected.treeIntegrity, false),
          mismatched: yield* judged(other, true),
        }).toEqual({
          matching: {
            digests: {
              treeIntegrity: expected.treeIntegrity,
              contentHash: Option.some(expected.contentHash),
            },
            walks: 1,
            framings: 1,
          },
          unframed: {
            digests: { treeIntegrity: expected.treeIntegrity, contentHash: Option.none() },
            walks: 1,
            framings: 0,
          },
          mismatched: {
            digests: { treeIntegrity: expected.treeIntegrity, contentHash: Option.none() },
            walks: 1,
            framings: 0,
          },
        });
      } finally {
        nodeFs.rmSync(root, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(layer)),
  );

  it.effect("reports the first unreadable payload file in tree order", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-tree-digests-"));
      try {
        writeMixedTree(root);
        const unreadable = new Set([nodePath.join(root, "B.txt"), nodePath.join(root, "a.txt")]);
        const observed = yield* computeMaterializedTreeDigests(root).pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            readFile: (target) =>
              unreadable.has(target)
                ? Effect.fail(
                    PlatformError.systemError({
                      _tag: "PermissionDenied",
                      module: "FileSystem",
                      method: "readFile",
                      pathOrDescriptor: target,
                    }),
                  )
                : fs.readFile(target),
          }),
          Effect.flip,
        );
        expect(observed).toMatchObject({
          _tag: "MaterializedTreeInvalid",
          root,
          reason: "cannot read a.txt",
        });
      } finally {
        nodeFs.rmSync(root, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(layer)),
  );
});
