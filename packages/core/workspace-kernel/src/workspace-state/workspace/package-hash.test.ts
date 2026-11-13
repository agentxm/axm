import { withDetailedWork } from "../../locations/testing.js";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Tracer from "effect/Tracer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import { computePackageContentHash } from "./package-hash.js";

layer(NodeServices.layer)("package content hashing", (it) => {
  it.effect("retains the change marker for a mixed package tree", () =>
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
        span: (options) => {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      expect(yield* computePackageContentHash(root).pipe(withDetailedWork(tracer))).toBe(
        "034fc2944cc153df71385d1e0f6e1c4e94c517dc17a6b56d2062162199119fc7",
      );
      const hash = spans.find((span) => span.name === "axm.hash.package");
      // Two directory frames, one file with four bytes, and one nine-byte link target.
      expect(hash?.attributes.get("axm.work.count")).toBe(4);
      expect(hash?.attributes.get("axm.work.bytes")).toBe(13);
    }).pipe(Effect.scoped),
  );

  it.effect("hashes dangling links and directory cycles without following them", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.symlink("absent", path.join(root, "dangling"));
      yield* fs.symlink(".", path.join(root, "cycle"));
      const first = yield* computePackageContentHash(root);
      yield* fs.remove(path.join(root, "dangling"));
      yield* fs.symlink("different", path.join(root, "dangling"));
      expect(yield* computePackageContentHash(root)).not.toBe(first);
    }).pipe(Effect.scoped),
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
        const observed = yield* computePackageContentHash(root).pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            lstat: (target) =>
              method === "lstat" && target === link ? Effect.fail(failure) : fs.lstat(target),
            readLink: (target) =>
              method === "readLink" && target === link ? Effect.fail(failure) : fs.readLink(target),
          }),
          Effect.flip,
        );
        expect(observed).toMatchObject({ _tag: "PackageContentHashFailed", cause: failure });
      }).pipe(Effect.scoped),
    );
  }
});
