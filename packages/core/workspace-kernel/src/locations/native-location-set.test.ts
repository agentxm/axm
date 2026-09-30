import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import { captureNativeLocationSet } from "./native-location-set.js";
import { observationViewLayer } from "./observation-view.js";

describe("finite native location observations", () => {
  it.effect(
    "shares filesystem reads within a phase and keeps entry identity distinct from its referent",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, "source");
        const first = path.join(root, "first");
        const second = path.join(root, "second");
        yield* fs.makeDirectory(source);
        yield* fs.symlink(source, first);
        yield* fs.symlink(source, second);
        const sourceFile = path.join(source, "config.json");
        const firstFile = path.join(first, "config.json");
        const secondFile = path.join(second, "config.json");
        const missing = path.join(root, "absent.json");
        yield* fs.writeFileString(sourceFile, "{}");
        const reads = yield* Ref.make<ReadonlyMap<string, number>>(new Map());
        const counted = <A>(
          method: string,
          target: string,
          read: Effect.Effect<A, PlatformError.PlatformError>,
        ) =>
          Ref.update(reads, (previous) => {
            const key = `${method}:${target}`;
            return new Map(previous).set(key, (previous.get(key) ?? 0) + 1);
          }).pipe(Effect.andThen(read));
        const observedFs = {
          ...fs,
          readDirectory: (target, options) =>
            counted("readDirectory", target, fs.readDirectory(target, options)),
          readLink: (target) => counted("readLink", target, fs.readLink(target)),
          stat: (target) => counted("stat", target, fs.stat(target)),
          realPath: (target) => counted("realPath", target, fs.realPath(target)),
        } satisfies FileSystem.FileSystem;
        const observed = yield* captureNativeLocationSet({
          entries: [first, second, first, firstFile, secondFile, missing],
          referents: [first, second, source, missing],
        }).pipe(Effect.provideService(FileSystem.FileSystem, observedFs));
        expect((yield* observed.entry(first)).entryPath).toBe(first);
        expect((yield* observed.entry(second)).entryPath).toBe(second);
        expect((yield* observed.entry(firstFile)).entryPath).toBe(sourceFile);
        expect((yield* observed.entry(secondFile)).entryPath).toBe(sourceFile);
        expect((yield* observed.entry(missing)).kind).toBe("absent");
        expect(yield* observed.referent(missing)).toBe(missing);
        expect(yield* observed.referent(first)).toBe(source);
        expect(yield* observed.referent(second)).toBe(source);
        const counts = yield* Ref.get(reads);
        for (const method of ["readDirectory", "readLink", "stat", "realPath"])
          expect([...counts.keys()].some((key) => key.startsWith(`${method}:`))).toBe(true);
        expect([...counts.values()].every((count) => count === 1)).toBe(true);
        yield* observed.entry(first);
        expect(yield* Ref.get(reads)).toEqual(counts);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("a new phase detects retargeted aliases and absent entries becoming present", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const first = path.join(root, "first");
      const second = path.join(root, "second");
      const alias = path.join(root, "alias");
      const target = path.join(alias, "config.json");
      const previouslyAbsent = path.join(first, "later.json");
      yield* fs.makeDirectory(first);
      yield* fs.makeDirectory(second);
      yield* fs.symlink(first, alias);
      const capture = captureNativeLocationSet({
        entries: [target, alias, previouslyAbsent],
        referents: [alias],
      });
      const before = yield* capture;
      yield* fs.remove(alias);
      yield* fs.symlink(second, alias);
      yield* fs.writeFileString(path.join(second, "config.json"), "{}");
      yield* fs.writeFileString(previouslyAbsent, "{}");
      const after = yield* capture;
      expect((yield* before.entry(target)).kind).toBe("absent");
      expect((yield* before.entry(target)).entryPath).toBe(path.join(first, "config.json"));
      expect((yield* after.entry(target)).kind).toBe("file");
      expect((yield* after.entry(target)).entryPath).toBe(path.join(second, "config.json"));
      expect((yield* before.entry(alias)).linkTarget).toBe(first);
      expect((yield* after.entry(alias)).linkTarget).toBe(second);
      expect((yield* before.entry(previouslyAbsent)).kind).toBe("absent");
      expect((yield* after.entry(previouslyAbsent)).kind).toBe("file");
      expect(yield* before.referent(alias)).toBe(first);
      expect(yield* after.referent(alias)).toBe(second);
      expect((yield* after.entry(path.join(root, "uncaptured")).pipe(Effect.result))._tag).toBe(
        "Failure",
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  for (const method of ["realPath", "stat"] as const) {
    it.effect(`shares a typed ${method} refusal only until the next capture`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const temporary = yield* fs.makeTempDirectoryScoped();
        const root = yield* fs.realPath(temporary);
        const source = path.join(root, "source");
        const sourceFile = path.join(source, "config.json");
        const first = path.join(root, "first");
        const second = path.join(root, "second");
        yield* fs.makeDirectory(source);
        yield* fs.writeFileString(sourceFile, "{}");
        yield* fs.symlink(source, first);
        yield* fs.symlink(source, second);
        const targets = [path.join(first, "config.json"), path.join(second, "config.json")];
        const attempts = yield* Ref.make(0);
        const allowed = yield* Ref.make(false);
        const denial = PlatformError.systemError({
          _tag: "PermissionDenied",
          module: "FileSystem",
          method,
          pathOrDescriptor: sourceFile,
        });
        const check = (operation: string, target: string) =>
          operation === method && target === sourceFile
            ? Ref.update(attempts, (count) => count + 1).pipe(
                Effect.andThen(Ref.get(allowed)),
                Effect.flatMap((available) => (available ? Effect.void : Effect.fail(denial))),
              )
            : Effect.void;
        const observedFs = {
          ...fs,
          realPath: (target) => check("realPath", target).pipe(Effect.andThen(fs.realPath(target))),
          stat: (target) => check("stat", target).pipe(Effect.andThen(fs.stat(target))),
        } satisfies FileSystem.FileSystem;
        const capture = captureNativeLocationSet({ entries: targets }).pipe(
          Effect.provideService(FileSystem.FileSystem, observedFs),
        );
        const before = yield* capture;
        for (const target of targets) {
          const result = yield* before.entry(target).pipe(Effect.result);
          expect(result._tag).toBe("Failure");
          if (result._tag === "Failure") {
            expect(result.failure._tag).toBe("NativeLocationError");
            expect(result.failure.reason).toBe("unreadable");
            expect(result.failure.cause).toBe(denial);
          }
        }
        expect(yield* Ref.get(attempts)).toBe(1);
        yield* Ref.set(allowed, true);
        const after = yield* capture;
        for (const target of targets) {
          expect((yield* after.entry(target)).entryPath).toBe(sourceFile);
          expect((yield* before.entry(target).pipe(Effect.result))._tag).toBe("Failure");
        }
        expect(yield* Ref.get(attempts)).toBe(2);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  it.effect("captures remain bound to their selected filesystem view", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const live = path.join(root, "live");
      const staged = path.join(root, "staged");
      yield* fs.makeDirectory(live);
      yield* fs.makeDirectory(staged);
      yield* fs.writeFileString(path.join(live, "config.json"), "{}");
      const liveTarget = path.join(live, "config.json");
      const stagedTarget = path.join(staged, "config.json");
      const working = yield* captureNativeLocationSet({ entries: [liveTarget] });
      const index = yield* captureNativeLocationSet({ entries: [stagedTarget, liveTarget] }).pipe(
        Effect.provide(
          observationViewLayer({
            kind: "git-index",
            readRoot: staged,
            displayRoot: live,
            fingerprint: "captured-index",
          }),
        ),
      );
      expect((yield* working.entry(liveTarget)).kind).toBe("file");
      expect((yield* index.entry(stagedTarget)).kind).toBe("absent");
      expect((yield* index.entry(liveTarget).pipe(Effect.result))._tag).toBe("Failure");
      expect((yield* working.entry(liveTarget)).kind).toBe("file");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
