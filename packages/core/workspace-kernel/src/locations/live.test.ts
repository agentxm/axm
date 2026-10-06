import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import {
  assertNativeMutationWithin,
  assertNoPhysicalOverlap,
  CanonicalNativePath,
  NativeLocationError,
  NativeResolutionRoot,
  resolveNativeEntry,
  resolveNativeReferent,
} from "./native-address.js";
import { CanonicalNativePathLive } from "./live.js";

it.effect("agrees with the listing resolver for case, Unicode, links and missing suffixes", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const temporary = yield* fs.makeTempDirectoryScoped();
    const root = yield* resolveNativeReferent(temporary);
    const names = ["MixedCase", "caf\u00e9", "cafe\u0301", "\u212aelvin"];
    for (const name of names) {
      const stored = path.join(root, name);
      yield* fs.makeDirectory(stored, { recursive: true });
      yield* fs.writeFileString(path.join(stored, "config.json"), "{}");
    }
    const alias = path.join(root, "alias");
    yield* fs.symlink(path.join(root, "MixedCase"), alias);
    const calls = yield* Ref.make<ReadonlyArray<string>>([]);
    const observedFs = {
      ...fs,
      readDirectory: (target: string) =>
        Ref.update(calls, (seen) => [...seen, target]).pipe(
          Effect.andThen(fs.readDirectory(target)),
        ),
    } satisfies FileSystem.FileSystem;
    for (const name of [...names, "mixedcase", "\u006belvin", "alias"]) {
      for (const suffix of ["config.json", "missing/future.json"]) {
        const target = path.join(root, name, suffix);
        const old = yield* resolveNativeEntry(target).pipe(
          Effect.provideService(NativeResolutionRoot, path.parse(root).root),
          Effect.result,
        );
        const current = yield* resolveNativeEntry(target).pipe(
          Effect.provideService(FileSystem.FileSystem, observedFs),
          Effect.provide(CanonicalNativePathLive),
          Effect.result,
        );
        expect(current).toEqual(old);
      }
    }
    if (process.platform === "darwin" || process.platform === "linux")
      expect(yield* Ref.get(calls)).toEqual([]);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("never calls the live canonical port from a captured namespace", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped().pipe(Effect.flatMap(resolveNativeReferent));
    yield* fs.writeFileString(path.join(root, "config.json"), "{}");
    const address = yield* resolveNativeEntry(path.join(root, "config.json")).pipe(
      Effect.provideService(NativeResolutionRoot, root),
      Effect.provideService(CanonicalNativePath, () =>
        Effect.die("host port escaped the captured view"),
      ),
    );
    expect(address.kind).toBe("file");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("agrees with listing admission for physical boundaries and changed aliases", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped().pipe(Effect.flatMap(resolveNativeReferent));
    const workspace = path.join(root, "workspace");
    const contained = path.join(workspace, "contained");
    const foreign = path.join(root, "foreign");
    yield* fs.makeDirectory(contained, { recursive: true });
    yield* fs.makeDirectory(foreign);
    yield* fs.writeFileString(path.join(contained, "config.json"), "{}");
    yield* fs.writeFileString(path.join(foreign, "config.json"), "{}");
    const alias = path.join(workspace, "alias");
    yield* fs.symlink(contained, alias);
    yield* fs.symlink("missing", path.join(workspace, "dangling"));
    yield* fs.link(path.join(foreign, "config.json"), path.join(workspace, "hardlink.json"));
    const nested = path.join(workspace, "nested");
    yield* fs.makeDirectory(nested);
    yield* fs.writeFileString(path.join(nested, "axm.json"), "{}");
    const compare = (
      observation: Effect.Effect<unknown, NativeLocationError, FileSystem.FileSystem | Path.Path>,
    ) =>
      Effect.gen(function* () {
        const listing = yield* observation.pipe(
          Effect.provideService(NativeResolutionRoot, path.parse(root).root),
          Effect.result,
        );
        const native = yield* observation.pipe(
          Effect.provide(CanonicalNativePathLive),
          Effect.result,
        );
        const outcome = (result: typeof listing) =>
          result._tag === "Failure" ? result.failure.reason : result.success;
        expect(outcome(native)).toEqual(outcome(listing));
      });
    for (const target of [
      path.join(alias, "config.json"),
      path.join(alias, "missing.json"),
      path.join(workspace, "dangling", "config.json"),
      path.join(workspace, "hardlink.json"),
      path.join(nested, "future.json"),
    ])
      yield* compare(assertNativeMutationWithin(workspace, target, "content"));
    yield* compare(assertNoPhysicalOverlap(contained, path.join(alias, "copy")));
    yield* fs.remove(alias);
    yield* fs.symlink(foreign, alias);
    yield* compare(
      assertNativeMutationWithin(workspace, path.join(alias, "config.json"), "content"),
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
