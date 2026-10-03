import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { validateContainedLink } from "./contained-link.js";

describe("Relocatable payload links", () => {
  it.effect("allows cycles and repeated finite links without following referents", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.symlink("b", path.join(root, "a"));
      yield* fs.symlink("a", path.join(root, "b"));
      yield* fs.symlink(".", path.join(root, "self"));
      yield* validateContainedLink(root, path.join(root, "a"), "b");
      yield* validateContainedLink(root, path.join(root, "repeat"), "self/self/missing");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("checks parent segments after resolving intermediate links", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(root, "nested"));
      yield* fs.symlink("..", path.join(root, "nested", "up"));
      const failure = yield* validateContainedLink(
        root,
        path.join(root, "escape"),
        "nested/up/../outside",
      ).pipe(Effect.flip);
      expect(failure.reason).toBe("escape");
      const absolute = yield* validateContainedLink(root, path.join(root, "absolute"), root).pipe(
        Effect.flip,
      );
      expect(absolute.reason).toBe("escape");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
