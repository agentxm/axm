import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { captureNativeLocationSet } from "./native-location-set.js";
import { observationViewLayer } from "./observation-view.js";

describe("finite native location observations", () => {
  it.effect(
    "shares ancestor reads within a phase and keeps entry identity distinct from its referent",
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
        const reads = yield* Ref.make<ReadonlyMap<string, number>>(new Map());
        const observedFs = {
          ...fs,
          readDirectory: (target: string) =>
            Ref.update(reads, (previous) =>
              new Map(previous).set(target, (previous.get(target) ?? 0) + 1),
            ).pipe(Effect.andThen(fs.readDirectory(target))),
        } satisfies FileSystem.FileSystem;
        const observed = yield* captureNativeLocationSet({
          entries: [first, second, first],
          referents: [first, second, source],
        }).pipe(Effect.provideService(FileSystem.FileSystem, observedFs));
        expect((yield* observed.entry(first)).entryPath).toBe(first);
        expect((yield* observed.entry(second)).entryPath).toBe(second);
        expect(yield* observed.referent(first)).toBe(source);
        expect(yield* observed.referent(second)).toBe(source);
        const counts = yield* Ref.get(reads);
        expect(counts.size).toBeGreaterThan(0);
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
      yield* fs.makeDirectory(first);
      yield* fs.makeDirectory(second);
      yield* fs.symlink(first, alias);
      const before = yield* captureNativeLocationSet({ entries: [target], referents: [alias] });
      yield* fs.remove(alias);
      yield* fs.symlink(second, alias);
      yield* fs.writeFileString(path.join(second, "config.json"), "{}");
      const after = yield* captureNativeLocationSet({ entries: [target], referents: [alias] });
      expect((yield* before.entry(target)).kind).toBe("absent");
      expect((yield* before.entry(target)).entryPath).toBe(path.join(first, "config.json"));
      expect((yield* after.entry(target)).kind).toBe("file");
      expect((yield* after.entry(target)).entryPath).toBe(path.join(second, "config.json"));
      expect(yield* before.referent(alias)).toBe(first);
      expect(yield* after.referent(alias)).toBe(second);
      expect((yield* after.entry(path.join(root, "uncaptured")).pipe(Effect.result))._tag).toBe(
        "Failure",
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

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
