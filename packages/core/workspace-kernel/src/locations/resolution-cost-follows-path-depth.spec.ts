import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  CanonicalNativePath,
  NativeLocationError,
  resolveNativeReferent,
  captureContainerIdentity,
} from "./index.js";

export const specification = defineSpecification({
  requirement: "workspace/locations/resolution-cost-follows-path-depth",
  title: "Native path inspection avoids unrelated ancestor entries",
  statement:
    "When the selected filesystem provides authoritative canonical spelling, AXM shall resolve native paths without enumerating unrelated ancestor entries, bound repeated root resolutions to one per container identity capture, and obtain fresh observations on the next capture or admission.",
  class: "quality",
  characteristic: "performance",
  role: "supporting",
  goals: ["platform-reach", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

for (const syntax of ["posix", "win32"] as const) {
  it.effect(`does not enumerate ancestors with ${syntax} canonical spelling`, () =>
    Effect.gen(function* () {
      const host = yield* FileSystem.FileSystem;
      const temporary = yield* host.makeTempDirectoryScoped();
      const info = yield* host.stat(temporary);
      const calls = yield* Ref.make<ReadonlyArray<string>>([]);
      const fs = FileSystem.makeNoop({
        realPath: (target) => Effect.succeed(target),
        stat: (target) =>
          target === target.toLowerCase()
            ? Effect.succeed(info)
            : Effect.fail(
                PlatformError.systemError({
                  _tag: "NotFound",
                  module: "FileSystem",
                  method: "stat",
                  pathOrDescriptor: target,
                }),
              ),
        readDirectory: (target) =>
          Ref.update(calls, (seen) => [...seen, target]).pipe(
            Effect.andThen(
              Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  module: "FileSystem",
                  method: "readDirectory",
                  pathOrDescriptor: target,
                }),
              ),
            ),
          ),
      });
      const result = yield* resolveNativeReferent(
        syntax === "posix"
          ? "/outside/dense/workspace/native/config.json"
          : "C:\\outside\\dense\\workspace\\native\\config.json",
      ).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provide(syntax === "posix" ? NodePath.layerPosix : NodePath.layerWin32),
        Effect.provideService(CanonicalNativePath, (target) => Effect.succeed(target)),
      );
      expect(result).toBe(
        syntax === "posix"
          ? "/outside/dense/workspace/native/config.json"
          : "C:\\outside\\dense\\workspace\\native\\config.json",
      );
      expect(yield* Ref.get(calls)).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
}

it.effect(
  "resolves an identical owner and native root once per capture and reads the next capture live",
  () =>
    Effect.gen(function* () {
      const host = yield* FileSystem.FileSystem;
      const temporary = yield* host.makeTempDirectoryScoped();
      const info = yield* host.stat(temporary);
      const calls = yield* Ref.make<ReadonlyArray<string>>([]);
      const fs = FileSystem.makeNoop({
        realPath: (target) =>
          Ref.update(calls, (seen) => [...seen, target]).pipe(Effect.as(target)),
        stat: () => Effect.succeed(info),
        exists: () => Effect.succeed(false),
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
      });
      const unavailable = yield* Ref.make(false);
      const capture = captureContainerIdentity({
        nativeRoot: "/owner",
        target: "/owner/native",
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(CanonicalNativePath, (target) =>
          Ref.get(unavailable).pipe(
            Effect.flatMap((failed) =>
              failed
                ? Effect.fail(new NativeLocationError({ target, reason: "unreadable" }))
                : Effect.succeed(target),
            ),
          ),
        ),
        Effect.provide(NodePath.layerPosix),
      );
      expect((yield* capture).physicalPath).toBe("/owner/native");
      expect(yield* Ref.get(calls)).toEqual(["/owner", "/owner/native"]);
      expect((yield* capture).physicalPath).toBe("/owner/native");
      expect(yield* Ref.get(calls)).toEqual(["/owner", "/owner/native", "/owner", "/owner/native"]);
      yield* Ref.set(unavailable, true);
      const refused = yield* capture.pipe(Effect.result);
      expect(refused._tag).toBe("Failure");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
