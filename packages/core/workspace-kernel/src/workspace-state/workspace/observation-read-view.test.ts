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
          readFile: (target) =>
            Effect.sync(() => {
              counts.set(target, (counts.get(target) ?? 0) + 1);
            }).pipe(Effect.andThen(fs.readFile(target))),
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
        const bytes = yield* reader.readFile(file);
        bytes.fill(0);
        expect(yield* reader.readFileString(file, "utf8")).toBe("before");
        expect(new TextDecoder().decode(yield* reader.readFile(file))).toBe("before");
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
              readFile: (target) => Effect.succeed(new TextEncoder().encode(target)),
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

  it.effect("shares physical bytes across encodings and retains directory option semantics", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "text");
      yield* fs.writeFile(file, new Uint8Array([65, 0, 66, 0]));
      yield* fs.makeDirectory(path.join(root, "nested"));
      yield* fs.writeFileString(path.join(root, "nested", "child"), "child");
      let reads = 0;
      let directories = 0;
      const capture = () =>
        Context.get(
          makeObservationReadView(
            {
              ...fs,
              readFile: (target) =>
                Effect.sync(() => {
                  reads++;
                }).pipe(Effect.andThen(fs.readFile(target))),
              readDirectory: (target, options) =>
                Effect.sync(() => {
                  directories++;
                }).pipe(Effect.andThen(fs.readDirectory(target, options))),
            },
            undefined,
          ),
          FileSystem.FileSystem,
        );
      const first = capture();
      expect(yield* first.readFileString(file, "utf-16le")).toBe("AB");
      expect(yield* first.readFileString(file, "utf8")).toBe("A\0B\0");
      expect((yield* first.readFileString(file, "invalid-encoding").pipe(Effect.result))._tag).toBe(
        "Failure",
      );
      expect(reads).toBe(1);
      const shallow = yield* first.readDirectory(root);
      shallow.push("caller mutation");
      expect(yield* first.readDirectory(root, { recursive: false })).not.toContain(
        "caller mutation",
      );
      expect(yield* first.readDirectory(root, { recursive: true })).toContain(
        path.join("nested", "child"),
      );
      expect(directories).toBe(2);
      yield* fs.writeFileString(path.join(root, "added"), "new");
      expect(yield* first.readDirectory(root)).not.toContain("added");
      expect(yield* capture().readDirectory(root)).toContain("added");
      const direct = capture();
      expect(yield* direct.readFileString(file, "utf-16le")).toBe("AB");
      yield* direct.writeFileString(file, "direct mutation");
      expect(yield* direct.readFileString(file)).toBe("direct mutation");
      yield* fs.writeFile(file, new Uint8Array([65, 0, 66, 0]));
      let mutationActive = true;
      const mutating = Context.get(
        makeObservationReadView(
          fs,
          undefined,
          () => mutationActive,
          () => {
            mutationActive = false;
          },
        ),
        FileSystem.FileSystem,
      );
      expect(yield* mutating.readFileString(file, "utf-16le")).toBe("AB");
      yield* mutating.writeFileString(file, "changed within phase");
      expect(mutationActive).toBe(false);
      expect(yield* mutating.readFileString(file, "utf-16le")).not.toBe("AB");
      expect(yield* mutating.readFileString(file)).toBe("changed within phase");
      yield* fs.writeFile(file, new Uint8Array([65, 0, 66, 0]));
      let active = true;
      const retained = Context.get(
        makeObservationReadView(fs, undefined, () => active),
        FileSystem.FileSystem,
      );
      expect(yield* retained.readFileString(file, "utf-16le")).toBe("AB");
      active = false;
      yield* fs.writeFileString(file, "fresh after phase");
      expect(yield* retained.readFileString(file)).toBe("fresh after phase");
      yield* fs.writeFileString(file, "fresh again");
      expect(yield* retained.readFileString(file)).toBe("fresh again");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
