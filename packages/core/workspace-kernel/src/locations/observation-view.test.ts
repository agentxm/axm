import { resolveNativeReferent } from "./native-address.js";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { observationViewLayer } from "./observation-view.js";

describe("captured filesystem view", () => {
  it.effect("maps absolute links to staged bytes and refuses external links before reading", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const live = yield* fs.makeTempDirectoryScoped().pipe(Effect.flatMap(resolveNativeReferent));
      const staged = yield* fs
        .makeTempDirectoryScoped()
        .pipe(Effect.flatMap(resolveNativeReferent));
      const external = yield* fs
        .makeTempDirectoryScoped()
        .pipe(Effect.flatMap(resolveNativeReferent));
      yield* fs.writeFileString(path.join(live, "config"), "live-only");
      yield* fs.writeFileString(path.join(staged, "config"), "staged-only");
      yield* fs.writeFileString(path.join(external, "config"), "external-only");
      yield* fs.symlink(path.join(live, "config"), path.join(staged, "alias"));
      yield* fs.symlink(path.join(external, "config"), path.join(staged, "escape"));
      yield* fs.symlink("loop", path.join(staged, "loop"));
      const view = yield* FileSystem.FileSystem.pipe(
        Effect.provide(
          observationViewLayer({
            kind: "git-index",
            readRoot: staged,
            displayRoot: live,
            fingerprint: "captured-index",
          }),
        ),
      );
      expect(yield* view.readFileString(path.join(staged, "alias"))).toBe("staged-only");
      expect(yield* view.readLink(path.join(staged, "alias"))).toBe(path.join(live, "config"));
      expect(yield* view.realPath(path.join(staged, "alias"))).toBe(path.join(staged, "config"));
      for (const file of [
        path.join(staged, "escape"),
        path.join(staged, "loop"),
        path.join(live, "config"),
      ]) {
        const result = yield* view.readFile(file).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") expect(result.failure.reason._tag).toBe("PermissionDenied");
      }
      expect(
        (yield* view.writeFileString(path.join(staged, "config"), "write").pipe(Effect.result))
          ._tag,
      ).toBe("Failure");
      expect(yield* fs.readFileString(path.join(staged, "config"))).toBe("staged-only");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
