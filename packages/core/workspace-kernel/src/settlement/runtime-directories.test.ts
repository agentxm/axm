import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import {
  captureContainerIdentity,
  NativeEntryRemoval,
  resolveNativeReferent,
} from "../locations/index.js";
import { CanonicalNativePathLive } from "../locations/live.js";
import { NativePlatformTest } from "../locations/testing.js";
import { removeEmptyRuntimeDirectories } from "./runtime-directories.js";

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

describe("empty runtime directory removal", () => {
  it.effect("preserves a foreign child added after directory identity verification", () =>
    Effect.gen(function* () {
      const { fs, path, removal, root } = yield* fixture;
      const directory = path.join(root, "owned");
      yield* fs.makeDirectory(directory);
      const identity = yield* captureContainerIdentity({ nativeRoot: root, target: directory });
      const attempted = yield* Ref.make(false);
      const raced = NativeEntryRemoval.of({
        ...removal,
        removeEmptyDirectory: (target) =>
          Effect.gen(function* () {
            expect(target).toBe(directory);
            yield* Ref.set(attempted, true);
            yield* fs.writeFileString(path.join(target, "foreign"), "arrived after proof");
            yield* removal.removeEmptyDirectory(target);
          }),
      });
      yield* removeEmptyRuntimeDirectories([identity]).pipe(
        Effect.provideService(NativeEntryRemoval, raced),
      );
      expect(yield* Ref.get(attempted)).toBe(true);
      expect(yield* fs.readFileString(path.join(directory, "foreign"))).toBe("arrived after proof");
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});
