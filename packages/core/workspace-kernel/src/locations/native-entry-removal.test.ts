import * as Layer from "effect/Layer";
import { NativePlatformTest } from "./testing.js";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { CanonicalNativePathLive } from "./live.js";
import { NativeEntryRemoval } from "./native-entry-removal.js";
import { resolveNativeReferent } from "./native-address.js";

const platform = Layer.merge(NativePlatformTest, CanonicalNativePathLive);

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const removal = yield* NativeEntryRemoval;
  const root = yield* fs
    .makeTempDirectoryScoped({ prefix: "axm-native-removal-" })
    .pipe(Effect.flatMap(resolveNativeReferent));
  return { fs, path, removal, root };
});

describe("native entry removal", () => {
  it.effect("unlinks a directory link without touching its source contents or mode", () =>
    Effect.gen(function* () {
      const { fs, path, removal, root } = yield* fixture;
      const source = path.join(root, "source");
      const link = path.join(root, "link");
      yield* fs.makeDirectory(source);
      yield* fs.writeFileString(path.join(source, "keep"), "foreign contents");
      yield* fs.symlink(source, link);
      const before = yield* fs.stat(source);
      yield* removal.unlink(link);
      expect(yield* fs.exists(link)).toBe(false);
      expect(yield* fs.readFileString(path.join(source, "keep"))).toBe("foreign contents");
      expect((yield* fs.stat(source)).mode).toBe(before.mode);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("removes an empty directory and preserves a populated directory", () =>
    Effect.gen(function* () {
      const { fs, path, removal, root } = yield* fixture;
      const empty = path.join(root, "empty");
      const occupied = path.join(root, "occupied");
      yield* fs.makeDirectory(empty);
      yield* fs.makeDirectory(occupied);
      yield* fs.writeFileString(path.join(occupied, "keep"), "foreign contents");
      yield* removal.removeEmptyDirectory(empty);
      expect(yield* fs.exists(empty)).toBe(false);
      const refused = yield* removal.removeEmptyDirectory(occupied).pipe(Effect.flip);
      expect(refused._tag).toBe("PlatformError");
      expect(refused.reason).toMatchObject({
        module: "NativeEntryRemoval",
        method: "removeEmptyDirectory",
        pathOrDescriptor: occupied,
      });
      expect(yield* fs.readFileString(path.join(occupied, "keep"))).toBe("foreign contents");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("retains the original native cause when an entry is missing", () =>
    Effect.gen(function* () {
      const { path, removal, root } = yield* fixture;
      const absent = path.join(root, "absent");
      const failure = yield* removal.unlink(absent).pipe(Effect.flip);
      expect(failure.reason).toMatchObject({
        _tag: "NotFound",
        module: "NativeEntryRemoval",
        method: "unlink",
        pathOrDescriptor: absent,
        cause: { code: "ENOENT" },
      });
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});
