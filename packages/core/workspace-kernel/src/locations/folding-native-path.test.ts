import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import {
  NativeResolutionRoot,
  resolveNativeEntry,
  assertNativeMutationWithin,
} from "./native-address.js";
import { CanonicalNativePathLive } from "./live.js";

const fixture = process.env["AXM_CASEFOLD_FIXTURE"];

describe.skipIf(process.platform !== "linux" || fixture === undefined)(
  "Linux casefold native spelling",
  () => {
    it.effect(
      "agrees with directory-entry spelling for case and Unicode aliases without listings",
      () =>
        Effect.gen(function* () {
          if (fixture === undefined) return yield* Effect.die("casefold fixture missing");
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const names = [
            ["MixedCase", "mixedcase"],
            ["caf\u00e9", "cafe\u0301"],
            ["\u212aelvin", "kelvin"],
          ] as const;
          const listings = yield* Ref.make<ReadonlyArray<string>>([]);
          const observed = {
            ...fs,
            readDirectory: (target: string) =>
              Ref.update(listings, (seen) => [...seen, target]).pipe(
                Effect.andThen(fs.readDirectory(target)),
              ),
          } satisfies FileSystem.FileSystem;
          for (const [stored, alias] of names) {
            const directory = path.join(fixture, stored);
            const target = path.join(fixture, alias, "config.json");
            yield* fs.makeDirectory(directory);
            yield* fs.writeFileString(path.join(directory, "config.json"), "{}");
            // The fixture must actually fold, rather than silently exercising a sensitive volume.
            expect((yield* fs.stat(path.join(fixture, alias))).ino).toEqual(
              (yield* fs.stat(directory)).ino,
            );
            const old = yield* resolveNativeEntry(target).pipe(
              Effect.provideService(NativeResolutionRoot, "/"),
            );
            const current = yield* resolveNativeEntry(target).pipe(
              Effect.provideService(FileSystem.FileSystem, observed),
              Effect.provide(CanonicalNativePathLive),
            );
            expect(current).toEqual(old);
            expect(current.entryPath).toBe(path.join(directory, "config.json"));
            const admission = yield* assertNativeMutationWithin(directory, target, "content").pipe(
              Effect.provide(CanonicalNativePathLive),
            );
            expect(admission.referentPath).toBe(current.referentPath);
          }
          expect(yield* Ref.get(listings)).toEqual([]);
        }).pipe(Effect.provide(NodeServices.layer)),
    );
  },
);
