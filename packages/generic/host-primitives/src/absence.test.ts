import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { isNotFound, readFileStringIfPresent } from "./absence.js";

describe("filesystem absence", () => {
  it.effect("reads present files and reports missing ones as none", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "present.txt");
      yield* fs.writeFileString(file, "present");
      expect(yield* readFileStringIfPresent(fs, file)).toEqual(Option.some("present"));
      expect(yield* readFileStringIfPresent(fs, path.join(root, "missing.txt"))).toEqual(
        Option.none(),
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps failures other than absence typed", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const failure = yield* readFileStringIfPresent(fs, root).pipe(Effect.flip);
      expect(isNotFound(failure)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
