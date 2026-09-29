import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { NativeWriteAuthorityLive } from "../projection/live.js";
import { WorkspaceFileWriteLocksLive } from "../settlement/live.js";
import { WorkspaceReadTest } from "../workspace-state/testing.js";
import { createCanonicalDirectory } from "./canonical-directory.js";
import { PackageMaterializationFailed } from "./errors.js";
import { prepareCanonicalParents, retireCanonicalDirectory } from "./canonical-parent-receipts.js";

describe("canonical parent creation receipts", () => {
  for (const eligible of [true, false]) {
    it.effect(
      `${eligible ? "retires" : "retains"} empty parents after ${eligible ? "eligible" : "ineligible"} acquisition`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const canonicalPath = path.join(root, "registry", "@acme", "rules", "guide");
          const authority = NativeWriteAuthorityLive.pipe(
            Layer.provide(
              Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive),
            ),
          );
          yield* Effect.gen(function* () {
            yield* createCanonicalDirectory({
              baseDir: root,
              canonicalPath,
              subject: "Rule",
              prepareParents: prepareCanonicalParents({ canonicalPath, eligible }),
              populate: (staged) =>
                fs.writeFileString(path.join(staged, "rule.json"), "{}").pipe(
                  Effect.mapError(
                    (cause) =>
                      new PackageMaterializationFailed({
                        path: staged,
                        step: "prepare-staging",
                        cause,
                      }),
                  ),
                ),
            });
            yield* retireCanonicalDirectory(canonicalPath);
          }).pipe(Effect.provide(authority));
          expect(yield* fs.exists(canonicalPath)).toBe(false);
          expect(yield* fs.exists(path.join(root, "registry"))).toBe(!eligible);
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  it.effect("retains a foreign sibling within an eligible created parent", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const canonicalPath = path.join(root, "registry", "@acme", "rules", "guide");
      const foreignPath = path.join(root, "registry", "foreign.txt");
      const authority = NativeWriteAuthorityLive.pipe(
        Layer.provide(
          Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive),
        ),
      );
      yield* Effect.gen(function* () {
        yield* createCanonicalDirectory({
          baseDir: root,
          canonicalPath,
          subject: "Rule",
          prepareParents: prepareCanonicalParents({ canonicalPath, eligible: true }),
          populate: (staged) =>
            fs.writeFileString(path.join(staged, "rule.json"), "{}").pipe(
              Effect.mapError(
                (cause) =>
                  new PackageMaterializationFailed({
                    path: staged,
                    step: "prepare-staging",
                    cause,
                  }),
              ),
            ),
        });
        yield* fs.writeFileString(foreignPath, "foreign");
        yield* retireCanonicalDirectory(canonicalPath);
      }).pipe(Effect.provide(authority));
      expect(yield* fs.readFileString(foreignPath)).toBe("foreign");
      expect(yield* fs.exists(path.join(root, "registry", "@acme"))).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
