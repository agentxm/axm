import { makeRecordingFileSystem } from "@agentxm/test-support";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";

import {
  captureCopiedDirectory,
  copiedDirectoryCanReplace,
  copiedDirectoryCanReplaceWith,
  copiedDirectoryIsCurrent,
  copiedDirectoryIsCurrentWith,
  copiedDirectoryOwnsPath,
  copiedDirectoryReceiptPath,
  readCopiedDirectory,
  retireCopiedDirectory,
} from "./copied-directory.js";
import { CanonicalNativePathLive } from "./live.js";
import { resolveNativeReferent } from "./native-address.js";

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs
    .makeTempDirectoryScoped({ prefix: "axm-copy-identity-" })
    .pipe(Effect.flatMap(resolveNativeReferent));
  const copy = path.join(root, "copy");
  const link = path.join(copy, "link");
  yield* fs.makeDirectory(copy);
  yield* fs.symlink("missing", link);
  const denied = PlatformError.systemError({
    _tag: "PermissionDenied",
    module: "FileSystem",
    method: "lstat",
    pathOrDescriptor: link,
  });
  const deniedFs = {
    ...fs,
    lstat: (target) => (target === link ? Effect.fail(denied) : fs.lstat(target)),
  } satisfies FileSystem.FileSystem;
  return { fs, copy, link, denied, deniedFs };
});

describe("copied link identity failures", () => {
  it.effect("recognizes only unchanged receipt children and preserves foreign additions", () =>
    Effect.gen(function* () {
      const { fs, copy, link } = yield* fixture;
      const path = yield* Path.Path;
      const owned = path.join(copy, "owned.txt");
      const foreign = path.join(copy, "foreign.txt");
      yield* fs.writeFileString(owned, "owned");
      expect(Option.isSome(yield* captureCopiedDirectory(copy, copy))).toBe(true);
      yield* fs.writeFileString(foreign, "owned");
      expect(yield* copiedDirectoryOwnsPath(copy, owned)).toBe(true);
      expect(yield* copiedDirectoryOwnsPath(copy, link)).toBe(true);
      expect(yield* copiedDirectoryOwnsPath(copy, foreign)).toBe(false);
      yield* fs.writeFileString(owned, "edited");
      expect(yield* copiedDirectoryOwnsPath(copy, owned)).toBe(false);
      expect(yield* fs.readFileString(foreign)).toBe("owned");
    }).pipe(Effect.scoped, Effect.provide([CanonicalNativePathLive, NodeServices.layer])),
  );
  it.effect("fails capture without writing a receipt when link identity cannot be read", () =>
    Effect.gen(function* () {
      const { fs, copy, link, denied, deniedFs } = yield* fixture;
      const failure = yield* captureCopiedDirectory(copy, copy).pipe(
        Effect.provideService(FileSystem.FileSystem, deniedFs),
        Effect.flip,
      );
      expect(failure).toBe(denied);
      expect(yield* fs.exists(yield* copiedDirectoryReceiptPath(copy))).toBe(false);
      expect(yield* fs.readLink(link)).toBe("missing");
    }).pipe(Effect.scoped, Effect.provide([CanonicalNativePathLive, NodeServices.layer])),
  );

  it.effect("preserves a dangling owned link when current identity cannot be proven", () =>
    Effect.gen(function* () {
      const { fs, copy, link, deniedFs } = yield* fixture;
      expect(Option.isSome(yield* captureCopiedDirectory(copy, copy))).toBe(true);
      yield* Effect.gen(function* () {
        expect(yield* copiedDirectoryCanReplace(copy)).toBe(false);
        expect(yield* copiedDirectoryIsCurrent(copy, copy)).toBe(false);
        expect(yield* retireCopiedDirectory(copy)).toBe(true);
      }).pipe(Effect.provideService(FileSystem.FileSystem, deniedFs));
      expect(yield* fs.readLink(link)).toBe("missing");
      expect(yield* fs.readDirectory(copy)).toEqual(["link"]);
    }).pipe(Effect.scoped, Effect.provide([CanonicalNativePathLive, NodeServices.layer])),
  );
});

const copiedFixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs
    .makeTempDirectoryScoped({ prefix: "axm-copy-receipt-" })
    .pipe(Effect.flatMap(resolveNativeReferent));
  const source = path.join(root, "source");
  const copy = path.join(root, "copy");
  for (const directory of [source, copy]) {
    yield* fs.makeDirectory(directory);
    for (const name of ["a.txt", "b.txt", "c.txt"])
      yield* fs.writeFileString(path.join(directory, name), `Original ${name}\n`);
    yield* fs.symlink("a.txt", path.join(directory, "link"));
  }
  expect(Option.isSome(yield* captureCopiedDirectory(copy, source))).toBe(true);
  return { fs, path, source, copy, receiptPath: yield* copiedDirectoryReceiptPath(copy) };
});

describe("copied receipt consumers", () => {
  it.effect.each([
    { name: "an unchanged copy", canReplace: true, isCurrent: true },
    { name: "a modified file", canReplace: false, isCurrent: false },
    { name: "a foreign addition", canReplace: false, isCurrent: true },
    { name: "a retargeted link", canReplace: false, isCurrent: false },
  ])("decide $name from a receipt the caller already read", (scenario) =>
    Effect.gen(function* () {
      const { fs, path, source, copy, receiptPath } = yield* copiedFixture;
      if (scenario.name === "a modified file")
        yield* fs.writeFileString(path.join(copy, "b.txt"), "Edited\n");
      if (scenario.name === "a foreign addition")
        yield* fs.writeFileString(path.join(copy, "foreign.txt"), "Foreign\n");
      if (scenario.name === "a retargeted link") {
        yield* fs.remove(path.join(copy, "link"));
        yield* fs.symlink("b.txt", path.join(copy, "link"));
      }
      const { fileSystem, recording } = makeRecordingFileSystem(fs);
      const receiptReads = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          recording.reset();
          const value = yield* effect;
          return { value, receiptReads: recording.counts(receiptPath).readFile ?? 0 };
        }).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
      const receipt = yield* readCopiedDirectory(copy);
      if (Option.isNone(receipt)) return yield* Effect.die("the fixture copy has a receipt");
      expect(yield* receiptReads(copiedDirectoryCanReplace(copy))).toEqual({
        value: scenario.canReplace,
        receiptReads: 1,
      });
      expect(yield* receiptReads(copiedDirectoryCanReplaceWith(copy, receipt.value))).toEqual({
        value: scenario.canReplace,
        receiptReads: 0,
      });
      expect(yield* receiptReads(copiedDirectoryIsCurrent(copy, source))).toEqual({
        value: scenario.isCurrent,
        receiptReads: 1,
      });
      expect(
        yield* receiptReads(copiedDirectoryIsCurrentWith(copy, receipt.value, source)),
      ).toEqual({ value: scenario.isCurrent, receiptReads: 0 });
    }).pipe(Effect.scoped, Effect.provide([CanonicalNativePathLive, NodeServices.layer])),
  );

  it.effect("distinguishes an absent receipt from a receipt listing no entries", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs
        .makeTempDirectoryScoped({ prefix: "axm-copy-empty-" })
        .pipe(Effect.flatMap(resolveNativeReferent));
      const source = path.join(root, "source");
      const copy = path.join(root, "copy");
      yield* fs.makeDirectory(source);
      yield* fs.makeDirectory(copy);
      const captured = yield* captureCopiedDirectory(copy, source);
      if (Option.isNone(captured)) return yield* Effect.die("the empty copy has a receipt");
      expect(captured.value.files).toEqual([]);
      const receipt = yield* readCopiedDirectory(copy);
      if (Option.isNone(receipt)) return yield* Effect.die("the empty copy has a receipt");
      expect(yield* copiedDirectoryCanReplace(copy)).toBe(true);
      expect(yield* copiedDirectoryCanReplaceWith(copy, receipt.value)).toBe(true);
      expect(yield* copiedDirectoryIsCurrent(copy, source)).toBe(true);
      expect(yield* copiedDirectoryIsCurrentWith(copy, receipt.value, source)).toBe(true);
      yield* fs.remove(yield* copiedDirectoryReceiptPath(copy));
      expect(Option.isNone(yield* readCopiedDirectory(copy))).toBe(true);
      expect(yield* copiedDirectoryCanReplace(copy)).toBe(false);
      expect(yield* copiedDirectoryIsCurrent(copy, source)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide([CanonicalNativePathLive, NodeServices.layer])),
  );
});

/** A source and its copy, each with files, a relative link and a nested directory. */
const treeFixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs
    .makeTempDirectoryScoped({ prefix: "axm-copy-entries-" })
    .pipe(Effect.flatMap(resolveNativeReferent));
  const source = path.join(root, "source");
  const copy = path.join(root, "copy");
  const fresh = path.join(root, "fresh");
  for (const directory of [source, copy, fresh]) {
    yield* fs.makeDirectory(path.join(directory, "scripts"), { recursive: true });
    for (const name of ["a.txt", "b.txt"])
      yield* fs.writeFileString(path.join(directory, name), `Original ${name}\n`);
    yield* fs.writeFileString(path.join(directory, "scripts", "run.sh"), "echo run\n");
    yield* fs.symlink("a.txt", path.join(directory, "link"));
  }
  const receipt = yield* captureCopiedDirectory(copy, source);
  if (Option.isNone(receipt)) return yield* Effect.die("the fixture copy has a receipt");
  const { fileSystem, recording } = makeRecordingFileSystem(fs);
  const recorded = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      recording.reset();
      return yield* effect.pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
    });
  const stats = (directory: string) =>
    Object.fromEntries(
      ["", "a.txt", "scripts", path.join("scripts", "run.sh"), "link"].map((relative) => [
        relative === "" ? "." : relative,
        recording.calls({ path: path.join(directory, relative), method: "stat" }).length,
      ]),
    );
  return { fs, path, source, copy, fresh, receipt: receipt.value, recorded, recording, stats };
});

describe("one copied entry check", () => {
  it.effect("still stats a copied directory's root after reading its receipt", () =>
    Effect.gen(function* () {
      const { copy, recorded, stats } = yield* treeFixture;
      expect(Option.isSome(yield* recorded(readCopiedDirectory(copy)))).toBe(true);
      // Its resolution, and the identity proof that follows the receipt read.
      expect(stats(copy)["."]).toBe(2);
    }).pipe(Effect.scoped, Effect.provide([CanonicalNativePathLive, NodeServices.layer])),
  );

  it.effect("stats each copied entry once while deciding currency and replacement", () =>
    Effect.gen(function* () {
      const { copy, source, receipt, recorded, stats } = yield* treeFixture;
      expect(yield* recorded(copiedDirectoryIsCurrentWith(copy, receipt, source))).toBe(true);
      expect({ copy: stats(copy), source: stats(source) }).toEqual({
        copy: { ".": 0, "a.txt": 1, scripts: 1, "scripts/run.sh": 1, link: 1 },
        source: { ".": 0, "a.txt": 1, scripts: 1, "scripts/run.sh": 1, link: 0 },
      });
      expect(yield* recorded(copiedDirectoryCanReplaceWith(copy, receipt))).toBe(true);
      expect(stats(copy)).toEqual({
        ".": 0,
        "a.txt": 1,
        scripts: 1,
        "scripts/run.sh": 1,
        link: 1,
      });
    }).pipe(Effect.scoped, Effect.provide([CanonicalNativePathLive, NodeServices.layer])),
  );

  it.effect("stats each entry of a new copy once while capturing it", () =>
    Effect.gen(function* () {
      const { fresh, source, recorded, stats } = yield* treeFixture;
      expect(Option.isSome(yield* recorded(captureCopiedDirectory(fresh, source)))).toBe(true);
      expect(stats(fresh)).toEqual({
        ".": 1,
        "a.txt": 1,
        scripts: 1,
        "scripts/run.sh": 1,
        link: 1,
      });
    }).pipe(Effect.scoped, Effect.provide([CanonicalNativePathLive, NodeServices.layer])),
  );

  it.effect("stats an owned child once while proving and retiring it", () =>
    Effect.gen(function* () {
      const { fs, path, copy, recorded, stats } = yield* treeFixture;
      expect(yield* recorded(copiedDirectoryOwnsPath(copy, path.join(copy, "a.txt")))).toBe(true);
      expect(stats(copy)["a.txt"]).toBe(1);
      expect(yield* recorded(copiedDirectoryOwnsPath(copy, path.join(copy, "scripts")))).toBe(true);
      expect(stats(copy)["scripts"]).toBe(1);
      expect(yield* recorded(retireCopiedDirectory(copy))).toBe(true);
      // The root's resolution and its identity proof after the receipt read both stay.
      expect(stats(copy)).toEqual({
        ".": 2,
        "a.txt": 1,
        scripts: 1,
        "scripts/run.sh": 1,
        link: 1,
      });
      expect(yield* fs.exists(copy)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide([CanonicalNativePathLive, NodeServices.layer])),
  );

  it.effect("still refuses a copied subdirectory replaced by identical contents", () =>
    Effect.gen(function* () {
      const { fs, path, copy, source, receipt } = yield* treeFixture;
      const scripts = path.join(copy, "scripts");
      yield* fs.remove(scripts, { recursive: true });
      yield* fs.makeDirectory(scripts);
      yield* fs.writeFileString(path.join(scripts, "run.sh"), "echo run\n");
      expect(yield* copiedDirectoryIsCurrentWith(copy, receipt, source)).toBe(false);
      expect(yield* copiedDirectoryCanReplaceWith(copy, receipt)).toBe(false);
      expect(yield* copiedDirectoryOwnsPath(copy, scripts)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide([CanonicalNativePathLive, NodeServices.layer])),
  );
});

/** A package root whose nested directory holds a file and `links` relative links to it. */
const linkedTree = (directory: string, links: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.join(directory, "sub"), { recursive: true });
    yield* fs.writeFileString(path.join(directory, "sub", "a"), "payload\n");
    for (const [index, target] of links.entries())
      yield* fs.symlink(target, path.join(directory, "sub", `l${index + 1}`));
  });

const linkWalkFixture = (sourceLinks: ReadonlyArray<string>, copyLinks = sourceLinks) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs
      .makeTempDirectoryScoped({ prefix: "axm-copy-links-" })
      .pipe(Effect.flatMap(resolveNativeReferent));
    const source = path.join(root, "source");
    const copy = path.join(root, "copy");
    yield* linkedTree(source, sourceLinks);
    yield* linkedTree(copy, copyLinks);
    const { fileSystem, recording } = makeRecordingFileSystem(fs);
    const recorded = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        recording.reset();
        return yield* effect.pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
      });
    const rootRealPaths = (directory: string) =>
      recording.calls({ path: directory, method: "realPath" }).length;
    return { fs, fileSystem, source, copy, recorded, rootRealPaths };
  });

describe("contained-link checks within one tree walk", () => {
  const relative = ["a", "a", "a"];

  it.effect("resolves a captured copy's root once for all of its links", () =>
    Effect.gen(function* () {
      const { copy, source, recorded, rootRealPaths } = yield* linkWalkFixture(relative);
      expect(Option.isSome(yield* recorded(captureCopiedDirectory(copy, source)))).toBe(true);
      expect(rootRealPaths(copy)).toBe(1);
    }).pipe(Effect.scoped, Effect.provide([CanonicalNativePathLive, NodeServices.layer])),
  );

  it.effect("resolves a source root once for all of its links while checking currency", () =>
    Effect.gen(function* () {
      const { copy, source, recorded, rootRealPaths } = yield* linkWalkFixture(relative);
      const receipt = yield* captureCopiedDirectory(copy, source);
      if (Option.isNone(receipt)) return yield* Effect.die("the fixture copy has a receipt");
      expect(yield* recorded(copiedDirectoryIsCurrentWith(copy, receipt.value, source))).toBe(true);
      expect(rootRealPaths(source)).toBe(1);
    }).pipe(Effect.scoped, Effect.provide([CanonicalNativePathLive, NodeServices.layer])),
  );

  it.effect("never resolves the root of a tree without links", () =>
    Effect.gen(function* () {
      const { copy, source, recorded, rootRealPaths } = yield* linkWalkFixture([]);
      const receipt = yield* recorded(captureCopiedDirectory(copy, source));
      expect(rootRealPaths(copy)).toBe(0);
      if (Option.isNone(receipt)) return yield* Effect.die("the fixture copy has a receipt");
      expect(yield* recorded(copiedDirectoryIsCurrentWith(copy, receipt.value, source))).toBe(true);
      expect(rootRealPaths(source)).toBe(0);
    }).pipe(Effect.scoped, Effect.provide([CanonicalNativePathLive, NodeServices.layer])),
  );

  it.effect("refuses an absolute link before resolving the root", () =>
    Effect.gen(function* () {
      const absolute = yield* linkWalkFixture(["/absolute"], ["a"]);
      const receipt = yield* captureCopiedDirectory(absolute.copy, absolute.source);
      if (Option.isNone(receipt)) return yield* Effect.die("the fixture copy has a receipt");
      expect(
        yield* absolute.recorded(
          copiedDirectoryIsCurrentWith(absolute.copy, receipt.value, absolute.source),
        ),
      ).toBe(false);
      expect(absolute.rootRealPaths(absolute.source)).toBe(0);

      const refused = yield* linkWalkFixture(["a"], ["/absolute"]);
      expect(
        yield* refused
          .recorded(captureCopiedDirectory(refused.copy, refused.source))
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "NativeLocationError", reason: "escape" });
      expect(refused.rootRealPaths(refused.copy)).toBe(0);
    }).pipe(Effect.scoped, Effect.provide([CanonicalNativePathLive, NodeServices.layer])),
  );

  it.effect("reports a root that cannot be resolved at its first relative link", () =>
    Effect.gen(function* () {
      const { fs, copy, source } = yield* linkWalkFixture(relative);
      const receipt = yield* captureCopiedDirectory(copy, source);
      if (Option.isNone(receipt)) return yield* Effect.die("the fixture copy has a receipt");
      yield* fs.remove(yield* copiedDirectoryReceiptPath(copy));
      const denied = (root: string) => {
        const failure = PlatformError.systemError({
          _tag: "PermissionDenied",
          module: "FileSystem",
          method: "realPath",
          pathOrDescriptor: root,
        });
        return {
          ...fs,
          realPath: (target) => (target === root ? Effect.fail(failure) : fs.realPath(target)),
        } satisfies FileSystem.FileSystem;
      };
      expect(
        yield* captureCopiedDirectory(copy, source).pipe(
          Effect.provideService(FileSystem.FileSystem, denied(copy)),
          Effect.flip,
        ),
      ).toMatchObject({ _tag: "NativeLocationError", target: copy, reason: "unreadable" });
      expect(
        yield* copiedDirectoryIsCurrentWith(copy, receipt.value, source).pipe(
          Effect.provideService(FileSystem.FileSystem, denied(source)),
        ),
      ).toBe(false);
    }).pipe(Effect.scoped, Effect.provide([CanonicalNativePathLive, NodeServices.layer])),
  );
});
