import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import { computeMaterializedTreeIntegrity } from "./materialized-tree.js";

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
      expect(yield* computeMaterializedTreeIntegrity(root)).toBe(
        "sha256-tree-v2:42310023912ae6c902e6d85f3181c2b6d615edd8b018f59e8c9707303be9d903",
      );
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
