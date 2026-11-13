import { withDetailedWork, workObservations } from "../../locations/testing.js";
import { CurrentWorkObserver } from "@agentxm/host-primitives/work-observation";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Tracer from "effect/Tracer";
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

describe("observation sharing diagnostic evidence", () => {
  it.effect.each([
    { abandon: false, tracing: true, detail: true },
    { abandon: true, tracing: true, detail: true },
    { abandon: true, tracing: false, detail: true },
    { abandon: true, tracing: true, detail: false },
  ])(
    "counts delivered failures and retries abandoned work (abandon=$abandon, tracing=$tracing, detail=$detail)",
    ({ abandon, tracing, detail }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped();
        const missing = path.join(directory, "missing");
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        let actualReads = 0;
        const reader = Context.get(
          makeObservationReadView(
            {
              ...fs,
              readFile: (target) =>
                Effect.gen(function* () {
                  actualReads++;
                  const result = yield* fs.readFile(target).pipe(Effect.exit);
                  yield* Deferred.succeed(started, undefined);
                  yield* Deferred.await(release);
                  return yield* result;
                }),
            },
            undefined,
          ),
          FileSystem.FileSystem,
        );
        const observations = workObservations(detail);
        const spans: Tracer.NativeSpan[] = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        yield* Effect.gen(function* () {
          let first = yield* reader
            .readFile(missing)
            .pipe(Effect.result, Effect.forkChild({ startImmediately: true }));
          yield* Deferred.await(started);
          const cancelled = yield* reader
            .readFile(missing)
            .pipe(Effect.forkChild({ startImmediately: true }));
          yield* Fiber.interrupt(cancelled);
          expect(Exit.hasInterrupts(yield* Fiber.await(cancelled))).toBe(true);
          if (abandon) {
            yield* Fiber.interrupt(first);
            expect(Exit.hasInterrupts(yield* Fiber.await(first))).toBe(true);
            first = yield* reader
              .readFile(missing)
              .pipe(Effect.result, Effect.forkChild({ startImmediately: true }));
          }
          const follower = yield* reader
            .readFile(missing)
            .pipe(Effect.result, Effect.forkChild({ startImmediately: true }));
          yield* Deferred.succeed(release, undefined);
          for (const result of [
            yield* Fiber.join(first),
            yield* Fiber.join(follower),
            yield* reader.readFile(missing).pipe(Effect.result),
          ]) {
            expect(result._tag).toBe("Failure");
            if (result._tag === "Failure") expect(result.failure.reason._tag).toBe("NotFound");
          }
        }).pipe(
          Effect.withTracer(tracer),
          Effect.provideService(CurrentWorkObserver, tracing ? observations.observer : undefined),
          Effect.withTracerEnabled(tracing),
        );
        expect(actualReads).toBe(abandon ? 2 : 1);
        if (!tracing) {
          expect(spans).toHaveLength(0);
          return;
        }
        if (!detail) {
          const requests = observations.facts.filter(
            (fact) => fact.kind === "axm.observation.reuse",
          );
          expect(spans.filter((span) => span.name === "axm.observation.reuse")).toEqual([]);
          expect(requests).toHaveLength(5);
          expect(
            requests.reduce((sum, fact) => sum + (fact.attributes["axm.work.requested"] ?? 0), 0),
          ).toBe(5);
          expect(
            requests.reduce((sum, fact) => sum + (fact.attributes["axm.work.executed"] ?? 0), 0),
          ).toBe(actualReads);
          expect(
            requests.reduce(
              (sum, fact) => sum + (fact.attributes["axm.work.reused-count"] ?? 0),
              0,
            ),
          ).toBe(2);
          expect(requests.filter((fact) => fact.outcome === "interrupted")).toHaveLength(2);
          expect(requests.filter((fact) => fact.outcome === "failure")).toHaveLength(3);
          return;
        }
        const requests = spans.filter((span) => span.name === "axm.observation.reuse");
        expect(requests.map((span) => span.attributes.get("axm.cache.outcome"))).toEqual([
          "miss",
          "coalesced",
          ...(abandon ? ["miss"] : []),
          "coalesced",
          "hit",
        ]);
        expect(requests.map((span) => span.attributes.get("axm.work.executed"))).toEqual([
          1,
          0,
          ...(abandon ? [1] : []),
          0,
          0,
        ]);
        expect(requests.map((span) => span.attributes.get("axm.work.reused-count"))).toEqual([
          0,
          0,
          ...(abandon ? [0] : []),
          1,
          1,
        ]);
        const cancelled = requests[1];
        expect(
          cancelled?.status._tag === "Ended" && Exit.hasInterrupts(cancelled.status.exit),
        ).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("reconciles misses, coalescing, hits and invalidated live reads with actual I/O", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped();
      const file = path.join(directory, "private-input");
      yield* fs.writeFileString(file, "before");
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let actualReads = 0;
      const counted: FileSystem.FileSystem = {
        ...fs,
        readFile: (target) =>
          Effect.gen(function* () {
            actualReads += 1;
            if (actualReads === 1) {
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(release);
            }
            return yield* fs.readFile(target);
          }),
      };
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span: (options) => {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      yield* Effect.gen(function* () {
        const reader = Context.get(
          makeObservationReadView(counted, undefined),
          FileSystem.FileSystem,
        );
        const first = yield* reader.readFile(file).pipe(Effect.forkChild);
        yield* Deferred.await(started);
        const concurrent = yield* reader.readFile(file).pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        yield* Deferred.succeed(release, undefined);
        expect(new TextDecoder().decode(yield* Fiber.join(first))).toBe("before");
        expect(new TextDecoder().decode(yield* Fiber.join(concurrent))).toBe("before");
        expect(new TextDecoder().decode(yield* reader.readFile(file))).toBe("before");
        yield* reader.writeFile(file, new TextEncoder().encode("changed"));
        expect(new TextDecoder().decode(yield* reader.readFile(file))).toBe("changed");
        let active = true;
        const retained = Context.get(
          makeObservationReadView(counted, undefined, () => active),
          FileSystem.FileSystem,
        );
        yield* retained.readFile(file);
        active = false;
        yield* fs.writeFileString(file, "after phase");
        expect(new TextDecoder().decode(yield* retained.readFile(file))).toBe("after phase");
      }).pipe(withDetailedWork(tracer));
      const requests = spans.filter((span) => span.name === "axm.observation.reuse");
      expect(requests.map((span) => span.attributes.get("axm.cache.outcome"))).toEqual([
        "miss",
        "coalesced",
        "hit",
        "bypass",
        "miss",
        "bypass",
      ]);
      expect(requests.map((span) => span.attributes.get("axm.work.executed"))).toEqual([
        1, 0, 0, 1, 1, 1,
      ]);
      expect(actualReads).toBe(4);
      expect(requests.map((span) => span.attributes.get("axm.work.reused-count"))).toEqual([
        0, 1, 1, 0, 0, 0,
      ]);
      expect(requests[3]?.attributes.get("axm.invalidation.reason")).toBe("mutation");
      expect(requests[5]?.attributes.get("axm.invalidation.reason")).toBe("phase-exit");
      expect(spans.filter((span) => span.name === "axm.observation.invalidate")).toHaveLength(1);
      expect(spans.every((span) => !JSON.stringify([...span.attributes]).includes(file))).toBe(
        true,
      );
      // These are sharing decisions. The platform adapter owns physical I/O spans.
      expect(spans.some((span) => span.name === "axm.observation.read-file")).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
