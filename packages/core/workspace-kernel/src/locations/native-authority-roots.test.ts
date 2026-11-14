/**
 * The selected root's resolution reported by a route assertion, against fresh
 * resolutions of the same root on a real filesystem.
 */
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { CanonicalNativePathLive } from "./live.js";
import { resolveNativeReferent } from "./native-address.js";
import { assertNativeMutationWithinRoots } from "./native-authority-roots.js";
import { NativePlatformTest } from "./testing.js";

const platform = Layer.merge(NativePlatformTest, CanonicalNativePathLive);

/** The root reported for a mutation of `root/file.txt`, and the root resolved fresh. */
const reported = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { root: selected } = yield* assertNativeMutationWithinRoots(
      [root],
      path.join(root, "file.txt"),
      "entry",
      root,
    );
    return {
      selected,
      physicalRoot: yield* resolveNativeReferent(root),
      linkTarget: Option.getOrUndefined(yield* fs.readLink(root).pipe(Effect.option)),
    };
  });

const temporaryRoot = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped().pipe(Effect.flatMap(resolveNativeReferent));
});

describe("selected native root", () => {
  it.effect("reports an ordinary directory at its physical spelling as ordinary", () =>
    Effect.gen(function* () {
      const root = yield* temporaryRoot;
      const { selected, physicalRoot, linkTarget } = yield* reported(root);
      expect(selected).toEqual({ physicalRoot, linkTarget, ordinary: true });
      expect(selected.physicalRoot).toBe(root);
      expect(selected.linkTarget).toBeUndefined();
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("does not report a symlinked root as ordinary", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const temporary = yield* temporaryRoot;
      const physical = path.join(temporary, "physical");
      const link = path.join(temporary, "link");
      yield* fs.makeDirectory(physical);
      yield* fs.symlink(physical, link);
      const { selected, physicalRoot, linkTarget } = yield* reported(link);
      expect(selected).toEqual({ physicalRoot, linkTarget, ordinary: false });
      expect(selected.physicalRoot).toBe(physical);
      expect(selected.linkTarget).toBe(physical);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("does not report a root spelled through an aliased parent as ordinary", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const temporary = yield* temporaryRoot;
      const parent = path.join(temporary, "physical");
      yield* fs.makeDirectory(path.join(parent, "root"), { recursive: true });
      yield* fs.symlink(parent, path.join(temporary, "alias"));
      const { selected, physicalRoot, linkTarget } = yield* reported(
        path.join(temporary, "alias", "root"),
      );
      expect(selected).toEqual({ physicalRoot, linkTarget, ordinary: false });
      expect(selected.physicalRoot).toBe(path.join(parent, "root"));
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it.effect("does not report an absent root as ordinary", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const root = path.join(yield* temporaryRoot, "absent");
      const { selected, physicalRoot, linkTarget } = yield* reported(root);
      expect(selected).toEqual({ physicalRoot, linkTarget, ordinary: false });
      expect(selected.physicalRoot).toBe(root);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );
});
