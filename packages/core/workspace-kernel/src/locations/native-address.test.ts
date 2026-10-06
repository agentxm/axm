import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";

import {
  assertNativeMutationWithin,
  CanonicalNativePath,
  NativeLocationError,
  pathsOverlap,
  resolveNativeEntry,
  resolveNativeReferent,
} from "./native-address.js";
import { observationViewLayer } from "./observation-view.js";

// Model realPath preserving caller spelling on both path syntaxes.
// Native process CI separately establishes behavior on the real volume.
describe("physical spelling", () => {
  it.effect("resolves ordinary entries once and reads a changed parent alias live", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const temporary = yield* fs.makeTempDirectoryScoped();
      const root = yield* resolveNativeReferent(temporary);
      const first = path.join(root, "first");
      const second = path.join(root, "second");
      yield* fs.makeDirectory(first);
      yield* fs.makeDirectory(second);
      for (const directory of [first, second])
        yield* fs.writeFileString(path.join(directory, "config.json"), "{}");
      const ancestor = path.parse(root).root;
      const ancestorReads = yield* Ref.make(0);
      const canonicalReads = yield* Ref.make(0);
      const observedFs = {
        ...fs,
        readDirectory: (target, options) =>
          target === ancestor
            ? Ref.update(ancestorReads, (count) => count + 1).pipe(
                Effect.andThen(fs.readDirectory(target, options)),
              )
            : fs.readDirectory(target, options),
      } satisfies FileSystem.FileSystem;
      const observe = resolveNativeEntry(path.join(first, "config.json")).pipe(
        Effect.provideService(FileSystem.FileSystem, observedFs),
        Effect.provideService(CanonicalNativePath, (target) =>
          Ref.update(canonicalReads, (count) => count + 1).pipe(
            Effect.andThen(Effect.succeed(target)),
          ),
        ),
      );
      const before = yield* observe;
      expect(before.kind).toBe("file");
      expect(before.entryPath).toBe(path.join(first, "config.json"));
      expect(before.referentPath).toBe(before.entryPath);
      expect(yield* Ref.get(ancestorReads)).toBe(0);
      expect(yield* Ref.get(canonicalReads)).toBe(1);
      yield* fs.rename(first, path.join(root, "original"));
      yield* fs.symlink(second, first);
      const after = yield* observe;
      expect(after.entryPath).toBe(path.join(second, "config.json"));
      expect(after.referentPath).toBe(after.entryPath);
      expect(yield* Ref.get(ancestorReads)).toBe(0);
      expect(yield* Ref.get(canonicalReads)).toBeGreaterThan(1);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "uses the selected filesystem when a canonical port is unavailable, but refuses a failed port",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs
          .makeTempDirectoryScoped()
          .pipe(Effect.flatMap(resolveNativeReferent));
        const path = yield* Path.Path;
        const target = path.join(root, "config.json");
        yield* fs.writeFileString(target, "{}");
        const fallback = yield* resolveNativeEntry(target).pipe(
          Effect.provideService(CanonicalNativePath, () => Effect.succeed(undefined)),
        );
        const listing = yield* resolveNativeEntry(target);
        expect(fallback).toEqual(listing);
        const failed = yield* resolveNativeEntry(target).pipe(
          Effect.provideService(CanonicalNativePath, (entry) =>
            Effect.fail(new NativeLocationError({ target: entry, reason: "unreadable" })),
          ),
          Effect.result,
        );
        expect(failed._tag).toBe("Failure");
        if (failed._tag === "Failure") expect(failed.failure.reason).toBe("unreadable");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

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
            const canonicalPort = (target: string) =>
              Effect.succeed(
                !sensitive && target.startsWith(lowerAgents)
                  ? upperAgents + target.slice(lowerAgents.length)
                  : target,
              );
            const fromPort = yield* resolveNativeReferent(path.join(lowerAgents, "skills")).pipe(
              Effect.provideService(CanonicalNativePath, canonicalPort),
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provide(pathLayer),
            );
            expect(fromPort).toBe(observed);
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

it.effect("resolves an identical root once per admission and observes its next alias target", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const temporary = yield* fs.makeTempDirectoryScoped();
    const sandbox = yield* resolveNativeReferent(temporary);
    const first = path.join(sandbox, "first");
    const second = path.join(sandbox, "second");
    const alias = path.join(sandbox, "root");
    const target = path.join(first, "native", "config.json");
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    yield* fs.makeDirectory(second);
    yield* fs.symlink(first, alias);
    const rootReads = yield* Ref.make(0);
    const observedFs = {
      ...fs,
      realPath: (entry: string) =>
        (path.resolve(entry) === alias
          ? Ref.update(rootReads, (count) => count + 1)
          : Effect.void
        ).pipe(Effect.andThen(fs.realPath(entry))),
    } satisfies FileSystem.FileSystem;
    const admission = assertNativeMutationWithin(
      alias,
      target,
      "entry",
      `${alias}${path.sep}.`,
    ).pipe(Effect.provideService(FileSystem.FileSystem, observedFs));
    expect((yield* admission).entryPath).toBe(target);
    expect(yield* Ref.get(rootReads)).toBe(1);

    yield* fs.remove(alias);
    yield* fs.symlink(second, alias);
    // Re-executing the same Effect must observe the new root and refuse the old target.
    const after = yield* admission.pipe(Effect.result);
    expect(after._tag).toBe("Failure");
    if (after._tag === "Failure") expect(after.failure.reason).toBe("escape");
    expect(yield* Ref.get(rootReads)).toBe(2);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
