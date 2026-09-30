import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";

import {
  assertNativeMutationWithin,
  pathsOverlap,
  resolveNativeReferent,
} from "./native-address.js";
import { observationViewLayer } from "./observation-view.js";

// Model realPath preserving caller spelling on both path syntaxes.
// Native process CI separately establishes behavior on the real volume.
describe("physical spelling", () => {
  for (const syntax of ["posix", "win32"] as const) {
    const pathLayer = syntax === "win32" ? NodePath.layerWin32 : NodePath.layerPosix;
    for (const sensitive of [false, true]) {
      it.effect(
        `preserves ${syntax} physical case identity on a ${sensitive ? "sensitive" : "folding"} volume`,
        () =>
          Effect.gen(function* () {
            const host = yield* FileSystem.FileSystem;
            const hostPath = yield* Path.Path;
            const root = yield* host.makeTempDirectoryScoped();
            const upper = hostPath.join(root, "upper");
            const lower = hostPath.join(root, "lower");
            yield* host.makeDirectory(upper);
            yield* host.makeDirectory(lower);
            const upperInfo = yield* host.stat(upper);
            const lowerInfo = yield* host.stat(lower);
            const path = yield* Path.Path.pipe(Effect.provide(pathLayer));
            const volume = syntax === "win32" ? "C:\\" : "/";
            const repo = path.join(volume, "Repo");
            const upperAgents = path.join(repo, ".Agents");
            const lowerAgents = path.join(repo, ".agents");
            const fs = FileSystem.makeNoop({
              realPath: (target) => Effect.succeed(target),
              readDirectory: (target) =>
                Effect.succeed(
                  target === volume
                    ? ["Repo"]
                    : target === repo
                      ? sensitive
                        ? [".Agents", ".agents"]
                        : [".Agents"]
                      : ["skills"],
                ),
              stat: (target) =>
                Effect.succeed(sensitive && target.startsWith(lowerAgents) ? lowerInfo : upperInfo),
            });
            const observed = yield* resolveNativeReferent(path.join(lowerAgents, "skills")).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provide(pathLayer),
            );
            expect(observed).toBe(path.join(sensitive ? lowerAgents : upperAgents, "skills"));
            // Path syntax alone must never merge distinct or not-yet-created spellings.
            expect(pathsOverlap(path, upperAgents, lowerAgents)).toBe(false);
            const boundary = yield* assertNativeMutationWithin(
              upperAgents,
              path.join(lowerAgents, "skills"),
            ).pipe(
              Effect.result,
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provide(pathLayer),
            );
            expect(boundary._tag).toBe(sensitive ? "Failure" : "Success");
            if (boundary._tag === "Failure") expect(boundary.failure.reason).toBe("escape");
          }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
      );
    }
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
  for (const syntax of ["posix", "win32"] as const) {
    const pathLayer = syntax === "win32" ? NodePath.layerWin32 : NodePath.layerPosix;
    it.effect(
      `normalizes a captured ${syntax} namespace without reading outside its filesystem capability`,
      () =>
        Effect.gen(function* () {
          const host = yield* FileSystem.FileSystem;
          const root = yield* host.makeTempDirectoryScoped();
          const info = yield* host.stat(root);
          const path = yield* Path.Path.pipe(Effect.provide(pathLayer));
          const volume = syntax === "win32" ? "C:\\" : "/";
          const captured = path.join(volume, "Captured");
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
                : target === path.join(captured, ".Agents")
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
              .realPath(path.join(volume, "captured", ".Agents", "skills"))
              .pipe(Effect.result);
            expect(sibling._tag).toBe("Failure");
            if (sibling._tag === "Failure")
              expect(sibling.failure.reason._tag).toBe("PermissionDenied");
            return yield* resolveNativeReferent(path.join(captured, ".agents", "skills"));
          }).pipe(
            Effect.provide(
              observationViewLayer({
                kind: "git-index",
                readRoot: captured,
                displayRoot: path.join(volume, "Live"),
                fingerprint: "captured-index",
              }),
            ),
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provide(pathLayer),
          );
          expect(observed).toBe(path.join(captured, ".Agents", "skills"));
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }
});
