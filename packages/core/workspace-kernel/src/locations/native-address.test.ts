import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";

import { assertNativeMutationWithin, resolveNativeReferent } from "./native-address.js";
import { observationViewLayer } from "./observation-view.js";

// Model Windows realPath's documented preservation of caller spelling.
// Native binary CI separately establishes behavior on the real filesystem.
describe("Windows physical spelling", () => {
  for (const sensitive of [false, true]) {
    it.effect(
      `preserves physical case identity on a ${sensitive ? "sensitive" : "folding"} volume`,
      () =>
        Effect.gen(function* () {
          const host = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* host.makeTempDirectoryScoped();
          const upper = path.join(root, "upper");
          const lower = path.join(root, "lower");
          yield* host.makeDirectory(upper);
          yield* host.makeDirectory(lower);
          const upperInfo = yield* host.stat(upper);
          const lowerInfo = yield* host.stat(lower);
          const fs = FileSystem.makeNoop({
            realPath: (target) => Effect.succeed(target),
            readDirectory: (target) =>
              Effect.succeed(
                target === "C:\\"
                  ? ["Repo"]
                  : target === "C:\\Repo"
                    ? sensitive
                      ? [".Agents", ".agents"]
                      : [".Agents"]
                    : ["skills"],
              ),
            stat: (target) =>
              Effect.succeed(sensitive && target.includes("\\.agents") ? lowerInfo : upperInfo),
          });
          const observed = yield* resolveNativeReferent("c:\\Repo\\.agents\\skills").pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provide(NodePath.layerWin32),
          );
          expect(observed).toBe(
            sensitive ? "C:\\Repo\\.agents\\skills" : "C:\\Repo\\.Agents\\skills",
          );
          const boundary = yield* assertNativeMutationWithin(
            "C:\\Repo\\.Agents",
            "C:\\Repo\\.agents\\skills",
          ).pipe(
            Effect.result,
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provide(NodePath.layerWin32),
          );
          expect(boundary._tag).toBe(sensitive ? "Failure" : "Success");
          if (boundary._tag === "Failure") expect(boundary.failure.reason).toBe("escape");
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  it.effect("resolves a short-name spelling through the directory's actual entry identity", () =>
    Effect.gen(function* () {
      const host = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* host.makeTempDirectoryScoped();
      const other = path.join(root, "other");
      yield* host.makeDirectory(other);
      const ownerInfo = yield* host.stat(root);
      const otherInfo = yield* host.stat(other);
      const fs = FileSystem.makeNoop({
        realPath: (target) => Effect.succeed(target),
        readDirectory: (target) =>
          Effect.succeed(
            target === "C:\\"
              ? ["Users"]
              : target === "C:\\Users"
                ? ["RunnerAdmin", "Other"]
                : ["Project"],
          ),
        stat: (target) => Effect.succeed(target.endsWith("\\Other") ? otherInfo : ownerInfo),
      });
      const observed = yield* resolveNativeReferent("C:\\Users\\RUNNER~1\\Project").pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provide(NodePath.layerWin32),
      );
      expect(observed).toBe("C:\\Users\\RunnerAdmin\\Project");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect(
    "normalizes a captured namespace without reading outside its filesystem capability",
    () =>
      Effect.gen(function* () {
        const host = yield* FileSystem.FileSystem;
        const root = yield* host.makeTempDirectoryScoped();
        const info = yield* host.stat(root);
        const captured = "C:\\Captured";
        const fs = FileSystem.makeNoop({
          realPath: (target) => Effect.succeed(target),
          readLink: (target) =>
            Effect.fail(
              PlatformError.systemError({
                _tag: "Unknown",
                module: "FileSystem",
                method: "readLink",
                pathOrDescriptor: target,
                cause: { code: "EINVAL" },
              }),
            ),
          stat: () => Effect.succeed(info),
          readDirectory: (target) =>
            target === captured
              ? Effect.succeed([".Agents"])
              : target === `${captured}\\.Agents`
                ? Effect.succeed(["skills"])
                : Effect.fail(
                    PlatformError.systemError({
                      _tag: "PermissionDenied",
                      module: "FileSystem",
                      method: "readDirectory",
                      pathOrDescriptor: target,
                    }),
                  ),
        });
        const observed = yield* Effect.gen(function* () {
          const selected = yield* FileSystem.FileSystem;
          const sibling = yield* selected
            .realPath("C:\\captured\\.Agents\\skills")
            .pipe(Effect.result);
          expect(sibling._tag).toBe("Failure");
          if (sibling._tag === "Failure")
            expect(sibling.failure.reason._tag).toBe("PermissionDenied");
          return yield* resolveNativeReferent(`${captured}\\.agents\\skills`);
        }).pipe(
          Effect.provide(
            observationViewLayer({
              kind: "git-index",
              readRoot: captured,
              displayRoot: "C:\\Live",
              fingerprint: "captured-index",
            }),
          ),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provide(NodePath.layerWin32),
        );
        expect(observed).toBe(`${captured}\\.Agents\\skills`);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
