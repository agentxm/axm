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
  copiedDirectoryIsCurrent,
  copiedDirectoryOwnsPath,
  copiedDirectoryReceiptPath,
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
