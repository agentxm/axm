import { describe, expect, it } from "@effect/vitest";
import * as ByteSize from "effect/ByteSize";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";

import { nativeInode, nativeLinkIdentity } from "./native-inode.js";

const linkInfo = {
  type: "SymbolicLink",
  mtime: Option.none(),
  atime: Option.none(),
  birthtime: Option.some(new Date("2030-01-01T00:00:00Z")),
  dev: 9007199254740993n,
  ino: Option.some(9007199254740995n),
  mode: 0o120777,
  nlink: Option.some(1n),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: ByteSize.bytes(0),
  blksize: Option.none(),
  blocks: Option.none(),
} satisfies FileSystem.File.Info;

describe("native identity metadata", () => {
  it("keeps inode precision and represents unavailable identity as absence", () => {
    expect(nativeInode(linkInfo)).toEqual(Option.some("9007199254740995"));
    expect(nativeInode({ ...linkInfo, ino: Option.none() })).toEqual(Option.none());
    expect(nativeInode({ ...linkInfo, ino: Option.some(0n) })).toEqual(Option.none());
  });

  it.effect("reads link identity through the supplied filesystem without following it", () =>
    Effect.gen(function* () {
      const fs = FileSystem.makeNoop({
        lstat: (target) => {
          expect(target).toBe("/captured/link");
          return Effect.succeed(linkInfo);
        },
      });
      expect(
        yield* nativeLinkIdentity("/captured/link").pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
        ),
      ).toEqual(
        Option.some({
          device: "9007199254740993",
          inode: "9007199254740995",
          birthtime: Date.parse("2030-01-01T00:00:00Z"),
        }),
      );
    }),
  );

  for (const [label, info] of [
    ["ordinary file", { ...linkInfo, type: "File" }],
    ["missing inode", { ...linkInfo, ino: Option.none() }],
    ["zero inode", { ...linkInfo, ino: Option.some(0n) }],
    ["missing birthtime", { ...linkInfo, birthtime: Option.none() }],
    ["zero birthtime", { ...linkInfo, birthtime: Option.some(new Date(0)) }],
  ] satisfies ReadonlyArray<readonly [string, FileSystem.File.Info]>) {
    it.effect(`withholds identity for ${label}`, () =>
      Effect.gen(function* () {
        expect(
          yield* nativeLinkIdentity("/captured/link").pipe(
            Effect.provideService(
              FileSystem.FileSystem,
              FileSystem.makeNoop({ lstat: () => Effect.succeed(info) }),
            ),
          ),
        ).toEqual(Option.none());
      }),
    );
  }

  it.effect("treats only a missing entry as absent", () =>
    Effect.gen(function* () {
      const missing = PlatformError.systemError({
        _tag: "NotFound",
        module: "FileSystem",
        method: "lstat",
        pathOrDescriptor: "/captured/link",
      });
      expect(
        yield* nativeLinkIdentity("/captured/link").pipe(
          Effect.provideService(
            FileSystem.FileSystem,
            FileSystem.makeNoop({ lstat: () => Effect.fail(missing) }),
          ),
        ),
      ).toEqual(Option.none());
    }),
  );

  it.effect("preserves the original typed permission failure", () =>
    Effect.gen(function* () {
      const denied = PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "lstat",
        pathOrDescriptor: "/captured/link",
      });
      const failure = yield* nativeLinkIdentity("/captured/link").pipe(
        Effect.provideService(
          FileSystem.FileSystem,
          FileSystem.makeNoop({ lstat: () => Effect.fail(denied) }),
        ),
        Effect.flip,
      );
      expect(failure).toBe(denied);
    }),
  );
});
