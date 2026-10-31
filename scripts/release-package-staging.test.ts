import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { withReleaseFileSnapshots } from "./release-package-staging.js";

describe("preview package source restoration", () => {
  for (const outcome of ["success", "failure", "interruption"] as const) {
    it.effect(`restores every authored file after ${outcome}`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-staging-test-" });
        const files = [path.join(root, "package.json"), path.join(root, "skill.md")];
        yield* Effect.forEach(files, (file) => fs.writeFileString(file, `original:${file}`));
        const stamped = yield* Deferred.make<void>();
        const operation = withReleaseFileSnapshots(files, (snapshots) =>
          Effect.gen(function* () {
            yield* Effect.forEach(snapshots, ({ path }) => fs.writeFileString(path, "preview"));
            yield* Deferred.succeed(stamped, undefined);
            if (outcome === "interruption") return yield* Effect.never;
            if (outcome === "failure") return yield* Effect.fail("build failed");
          }),
        );
        if (outcome === "interruption") {
          const fiber = yield* Effect.forkChild(operation);
          yield* Deferred.await(stamped);
          yield* Fiber.interrupt(fiber);
        } else if (outcome === "failure") {
          expect(yield* Effect.flip(operation)).toBe("build failed");
        } else {
          yield* operation;
        }
        for (const file of files) expect(yield* fs.readFileString(file)).toBe(`original:${file}`);
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  }
});
