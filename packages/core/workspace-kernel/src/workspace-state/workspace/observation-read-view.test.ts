import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { CanonicalNativePath } from "../../locations/index.js";
import { makeObservationReadView } from "./observation-read-view.js";

describe("query observation sharing", () => {
  it.effect(
    "coalesces concurrent reads and failures, then observes changes in the next query",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, "content");
        const missing = path.join(root, "missing");
        yield* fs.writeFileString(file, "before");
        const counts = new Map<string, number>();
        const counted: FileSystem.FileSystem = {
          ...fs,
          readFileString: (target, encoding) =>
            Effect.sync(() => {
              counts.set(target, (counts.get(target) ?? 0) + 1);
            }).pipe(Effect.andThen(fs.readFileString(target, encoding))),
        };
        let canonicalReads = 0;
        const capture = () =>
          makeObservationReadView(counted, (target) =>
            Effect.sync(() => {
              canonicalReads++;
              return target;
            }),
          );
        const first = capture();
        const reader = Context.get(first, FileSystem.FileSystem);
        const content = yield* Effect.all(
          Array.from({ length: 20 }, () => reader.readFileString(file)),
          { concurrency: "unbounded" },
        );
        expect(content).toEqual(Array.from({ length: 20 }, () => "before"));
        const failures = yield* Effect.all(
          Array.from({ length: 20 }, () => reader.readFileString(missing).pipe(Effect.result)),
          { concurrency: "unbounded" },
        );
        expect(failures.every((result) => result._tag === "Failure")).toBe(true);
        expect(counts.get(file)).toBe(1);
        expect(counts.get(missing)).toBe(1);
        const canonical = Context.get(first, CanonicalNativePath);
        expect(canonical).toBeDefined();
        if (canonical !== undefined) {
          yield* Effect.all([canonical(file), canonical(file)], { concurrency: "unbounded" });
          expect(canonicalReads).toBe(1);
        }
        yield* fs.writeFileString(file, "after");
        yield* fs.writeFileString(missing, "created");
        const next = Context.get(capture(), FileSystem.FileSystem);
        expect(yield* next.readFileString(file)).toBe("after");
        expect(yield* next.readFileString(missing)).toBe("created");
        expect(counts.get(file)).toBe(2);
        expect(counts.get(missing)).toBe(2);
        // A symlink followed by .. need not mean the lexically normalized path.
        const spelling = Context.get(
          makeObservationReadView(
            {
              ...fs,
              readFileString: (target) => Effect.succeed(target),
            },
            undefined,
          ),
          FileSystem.FileSystem,
        );
        const traversed = `${root}/alias/../content`;
        expect(yield* spelling.readFileString(traversed)).toBe(traversed);
        expect(yield* spelling.readFileString(file)).toBe(file);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
