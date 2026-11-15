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
