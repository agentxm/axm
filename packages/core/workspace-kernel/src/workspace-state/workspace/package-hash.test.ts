import { withDetailedWork } from "../../locations/testing.js";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import { fc as FastCheck, it as fastCheckIt } from "@fast-check/vitest";
import * as Effect from "effect/Effect";
import * as Tracer from "effect/Tracer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import { computePackageContentHash } from "./package-hash.js";

layer(NodeServices.layer)("package content hashing", (it) => {
  it.effect("distinguishes paths and contents that collide with newline delimiters", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const first = yield* fs.makeTempDirectoryScoped();
      const second = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(first, "a"), "b");
      yield* fs.writeFileString(path.join(first, "c"), "");
      yield* fs.writeFileString(path.join(second, "a"), "b\nc\n");

      expect(yield* computePackageContentHash(first)).not.toBe(
        yield* computePackageContentHash(second),
      );
    }).pipe(Effect.scoped),
  );

  it.effect("changes when a nested subdirectory file changes", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(root, "sub"));
      yield* fs.writeFileString(path.join(root, "SKILL.md"), "# skill\n");
      yield* fs.writeFileString(path.join(root, "sub", "nested.md"), "v1");
      const before = yield* computePackageContentHash(root);
      yield* fs.writeFileString(path.join(root, "sub", "nested.md"), "v2");

      expect(yield* computePackageContentHash(root)).not.toBe(before);
    }).pipe(Effect.scoped),
  );

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

  /** A package whose root manifest and fixture hold bytes that do not round-trip through text. */
  const awkwardPackage = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    yield* fs.writeFile(
      path.join(root, "hook.json"),
      new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('{"a":1}')]),
    );
    yield* fs.makeDirectory(path.join(root, "fixtures"));
    yield* fs.writeFile(
      path.join(root, "fixtures", "input.json"),
      new Uint8Array([0x22, 0xff, 0x22]),
    );
    return root;
  });

  it.effect(
    "frames supplied root-file bytes and decodes named files without changing the hash",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* awkwardPackage;
        const plain = yield* computePackageContentHash(root);
        const received: Array<readonly [string, string]> = [];
        const reads: Array<string> = [];
        const hashed = yield* computePackageContentHash(root, {
          rootFile: { name: "hook.json", bytes: yield* fs.readFile(path.join(root, "hook.json")) },
          decodeText: {
            entries: ["hook.json", "fixtures/input.json", "absent.json"],
            receive: (relative, text) => {
              received.push([relative, text]);
            },
          },
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            readFile: (target) => {
              reads.push(path.relative(root, target));
              return fs.readFile(target);
            },
          }),
        );
        expect(hashed).toBe(plain);
        expect(reads).toEqual(["fixtures/input.json"]);
        expect(received).toEqual([
          [
            "fixtures/input.json",
            yield* fs.readFileString(path.join(root, "fixtures", "input.json")),
          ],
          ["hook.json", yield* fs.readFileString(path.join(root, "hook.json"))],
        ]);
      }).pipe(Effect.scoped),
  );

  it.effect("frames supplied bytes only for a regular file at the package root", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* awkwardPackage;
      const other = new TextEncoder().encode("other");
      const plain = yield* computePackageContentHash(root);
      // Bytes framed in place of a regular root file are what the hash covers.
      expect(
        yield* computePackageContentHash(root, { rootFile: { name: "hook.json", bytes: other } }),
      ).not.toBe(plain);
      // A nested file of the same name and a linked root entry are read as usual.
      expect(
        yield* computePackageContentHash(root, {
          rootFile: { name: "input.json", bytes: other },
        }),
      ).toBe(plain);
      yield* fs.rename(path.join(root, "hook.json"), path.join(root, "fixtures", "hook.json"));
      yield* fs.symlink("fixtures/hook.json", path.join(root, "hook.json"));
      const linked = yield* computePackageContentHash(root);
      const received: Array<string> = [];
      expect(
        yield* computePackageContentHash(root, {
          rootFile: { name: "hook.json", bytes: other },
          decodeText: { entries: ["hook.json"], receive: (relative) => received.push(relative) },
        }),
      ).toBe(linked);
      expect(received).toEqual([]);
    }).pipe(Effect.scoped),
  );
});

fastCheckIt.prop(
  { contents: FastCheck.uniqueArray(FastCheck.string(), { minLength: 2, maxLength: 2 }) },
  { numRuns: 100, seed: 0x41584d },
)("package content hashing changes when arbitrary file content changes", ({ contents }) => {
  const [firstContent = "", secondContent = ""] = contents;
  // eslint-disable-next-line no-restricted-syntax -- The fast-check Vitest adapter requires a Promise-returning property callback.
  return Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const file = path.join(yield* fs.makeTempDirectoryScoped(), "SKILL.md");
      yield* fs.writeFileString(file, firstContent);
      const first = yield* computePackageContentHash(path.dirname(file));
      yield* fs.writeFileString(file, secondContent);
      expect(yield* computePackageContentHash(path.dirname(file))).not.toBe(first);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
