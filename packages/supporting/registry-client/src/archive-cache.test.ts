import {
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import * as Tracer from "effect/Tracer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { computeIntegrity } from "@agentxm/host-primitives";
import {
  CurrentWorkObserver,
  withWork,
  type WorkFact,
} from "@agentxm/host-primitives/work-observation";
import { makeArchiveCache } from "./archive-cache.js";
import { MAX_BUFFERED_ARCHIVE_BYTES } from "./archive-limits.js";
import { RegistryOperationFailed } from "./errors.js";

const withCache = <A, E>(
  use: (cacheRoot: string) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
) => {
  const tempRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-archive-cache-"));
  const cacheRoot = nodePath.join(tempRoot, "archives");
  return use(cacheRoot).pipe(
    Effect.ensuring(Effect.sync(() => rmSync(tempRoot, { recursive: true, force: true }))),
    Effect.provide(NodeServices.layer),
  );
};

describe("ArchiveCache", () => {
  it.effect("rejects an oversized cached archive before allocating its body", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* makeArchiveCache(fs, path, cacheRoot);
        const archive = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
        const integrity = yield* computeIntegrity(archive);
        yield* cache.write(integrity, archive);
        const [entry] = yield* fs.readDirectory(cacheRoot);
        if (entry === undefined) throw new Error("Expected cached archive");
        truncateSync(path.join(cacheRoot, entry), MAX_BUFFERED_ARCHIVE_BYTES + 1);

        const failure = yield* cache.read(integrity).pipe(Effect.flip);
        expect(failure.category).toBe("quota");
      }),
    ),
  );

  it.effect("writes atomically and returns verified archive bytes", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* makeArchiveCache(fs, path, cacheRoot);
        const archive = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
        const integrity = yield* computeIntegrity(archive);

        yield* cache.write(integrity, archive);
        const result = yield* cache.read(integrity);

        expect(Array.from(Option.getOrThrow(result))).toEqual(Array.from(archive));
        const entries = yield* fs.readDirectory(cacheRoot);
        expect(entries).toHaveLength(1);
        expect(entries[0]?.endsWith(".zip")).toBe(true);
      }),
    ),
  );

  it.effect("coalesces one active selection and forgets a failed load for retry", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* makeArchiveCache(fs, path, cacheRoot);
        const archive = new Uint8Array([1, 2, 3]);
        const integrity = yield* computeIntegrity(archive);
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const fetches = yield* Ref.make(0);
        const fetch = Ref.update(fetches, (count) => count + 1).pipe(
          Effect.andThen(Deferred.succeed(started, undefined)),
          Effect.andThen(Deferred.await(release)),
          Effect.as(archive),
        );
        const first = yield* cache.load("same-selection", integrity, fetch).pipe(Effect.forkChild);
        yield* Deferred.await(started);
        const second = yield* cache.load("same-selection", integrity, fetch).pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        expect(yield* Ref.get(fetches)).toBe(1);
        yield* Deferred.succeed(release, undefined);
        expect(Array.from(yield* Fiber.join(first))).toEqual([1, 2, 3]);
        expect(Array.from(yield* Fiber.join(second))).toEqual([1, 2, 3]);

        const missing = yield* computeIntegrity(new Uint8Array([9]));
        yield* cache
          .load(
            "retry-selection",
            missing,
            Effect.fail(new RegistryOperationFailed({ category: "network", detail: "offline" })),
          )
          .pipe(Effect.exit);
        expect(
          Array.from(
            yield* cache.load("retry-selection", missing, Effect.succeed(new Uint8Array([9]))),
          ),
        ).toEqual([9]);
      }),
    ),
  );

  it.effect("keeps a shared acquisition running when its first caller is interrupted", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* makeArchiveCache(fs, path, cacheRoot);
        const archive = new Uint8Array([8, 7, 6]);
        const integrity = yield* computeIntegrity(archive);
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const fetches = yield* Ref.make(0);
        const interrupted = yield* Ref.make(false);
        const fetch = Ref.update(fetches, (count) => count + 1).pipe(
          Effect.andThen(Deferred.succeed(started, undefined)),
          Effect.andThen(Deferred.await(release)),
          Effect.as(archive),
          Effect.onInterrupt(() => Ref.set(interrupted, true)),
        );
        const first = yield* cache
          .load("selection", integrity, fetch)
          .pipe(Effect.forkChild({ startImmediately: true }));
        yield* Deferred.await(started);
        const second = yield* cache
          .load("selection", integrity, fetch)
          .pipe(Effect.forkChild({ startImmediately: true }));
        yield* Fiber.interrupt(first);
        expect(yield* Ref.get(interrupted)).toBe(false);
        expect(yield* Ref.get(fetches)).toBe(1);
        yield* Deferred.succeed(release, undefined);
        expect(Array.from(yield* Fiber.join(second))).toEqual([8, 7, 6]);
        expect(
          Array.from(yield* cache.load("selection", integrity, Effect.die("cache miss"))),
        ).toEqual([8, 7, 6]);
      }),
    ),
  );

  it.effect("abandons a lookup after its last caller leaves and admits work during cleanup", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* makeArchiveCache(fs, path, cacheRoot);
        const archive = new Uint8Array([8, 7, 6]);
        const integrity = yield* computeIntegrity(archive);
        const started = yield* Deferred.make<void>();
        const finalizing = yield* Deferred.make<void>();
        const finishFinalizer = yield* Deferred.make<void>();
        const fetch = Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() =>
            Deferred.succeed(finalizing, undefined).pipe(
              Effect.andThen(Deferred.await(finishFinalizer)),
            ),
          ),
        );
        const first = yield* cache.load("selection", integrity, fetch).pipe(Effect.forkChild);
        yield* Deferred.await(started);
        const interrupted = yield* Fiber.interrupt(first).pipe(
          Effect.forkChild({ startImmediately: true }),
        );
        yield* Deferred.await(finalizing);
        yield* Effect.gen(function* () {
          expect(
            Array.from(yield* cache.load("selection", integrity, Effect.succeed(archive))),
          ).toEqual([8, 7, 6]);
        }).pipe(Effect.ensuring(Deferred.succeed(finishFinalizer, undefined)));
        yield* Fiber.join(interrupted);
        expect(
          Array.from(yield* cache.load("selection", integrity, Effect.die("cache miss"))),
        ).toEqual([8, 7, 6]);
      }),
    ),
  );

  it.effect("amortizes pruning while protecting an active archive", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* makeArchiveCache(fs, path, cacheRoot, { maxBytes: 5 });
        const archives = [
          new Uint8Array([1, 1, 1]),
          new Uint8Array([2, 2, 2]),
          new Uint8Array([3, 3, 3]),
          new Uint8Array([4, 4, 4]),
        ];
        const integrities = yield* Effect.forEach(archives, computeIntegrity);
        const activeArchive = archives[0];
        const activeIntegrity = integrities[0];
        if (activeArchive === undefined || activeIntegrity === undefined) {
          return yield* Effect.die("Expected active archive");
        }
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const active = yield* cache
          .load(
            "active-selection",
            activeIntegrity,
            cache
              .write(activeIntegrity, activeArchive, { prune: false })
              .pipe(
                Effect.andThen(Deferred.succeed(started, undefined)),
                Effect.andThen(Deferred.await(release)),
                Effect.as(activeArchive),
              ),
          )
          .pipe(Effect.forkChild);
        yield* Deferred.await(started);
        for (let index = 1; index < archives.length; index++) {
          const archive = archives[index];
          const integrity = integrities[index];
          if (archive === undefined || integrity === undefined) continue;
          yield* cache.write(integrity, archive);
        }
        expect((yield* cache.status()).entries).toBe(4);
        yield* cache.write(activeIntegrity, activeArchive);
        expect(Option.isSome(yield* cache.read(activeIntegrity))).toBe(true);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(active);
      }),
    ),
  );

  it.effect("owns exactly the cache entries inspected across gated publication schedules", () =>
    Effect.forEach(
      [false, true],
      (writeBeforeEnumeration) =>
        withCache((cacheRoot) =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const reachedEnumeration = yield* Deferred.make<void>();
            const releaseEnumeration = yield* Deferred.make<void>();
            const spans: Tracer.NativeSpan[] = [];
            const inventories: Array<{
              owner: Tracer.AnySpan | undefined;
              names: ReadonlyArray<string>;
            }> = [];
            const stats: Array<{ owner: Tracer.AnySpan | undefined; name: string }> = [];
            const facts: Array<{ fact: WorkFact; parent: Tracer.AnySpan | undefined }> = [];
            let gatePending = true;
            const recordingFs = FileSystem.make({
              ...fs,
              readDirectory: (target) =>
                Effect.gen(function* () {
                  const gate = target === cacheRoot && gatePending;
                  if (gate) gatePending = false;
                  const pause = Deferred.succeed(reachedEnumeration, undefined).pipe(
                    Effect.andThen(Deferred.await(releaseEnumeration)),
                  );
                  if (gate && writeBeforeEnumeration) yield* pause;
                  const names = yield* fs.readDirectory(target);
                  if (target === cacheRoot)
                    inventories.push({
                      owner: Option.getOrUndefined(yield* Effect.serviceOption(Tracer.ParentSpan)),
                      names: names.filter((name) => name.endsWith(".zip")),
                    });
                  if (gate && !writeBeforeEnumeration) yield* pause;
                  return names;
                }),
              stat: (target) =>
                Effect.gen(function* () {
                  if (path.dirname(target) === cacheRoot && target.endsWith(".zip"))
                    stats.push({
                      owner: Option.getOrUndefined(yield* Effect.serviceOption(Tracer.ParentSpan)),
                      name: path.basename(target),
                    });
                  return yield* withWork("axm.io.stat", fs.stat(target), {
                    attributes: { "axm.work.executed": 1 },
                  });
                }),
            });
            const cache = yield* makeArchiveCache(recordingFs, path, cacheRoot);
            const archives = yield* Effect.forEach([1, 2, 3, 4, 5], (value) => {
              const bytes = new Uint8Array([value, value, value]);
              return Effect.map(computeIntegrity(bytes), (integrity) => ({ bytes, integrity }));
            });
            const fourth = archives[3];
            const fifth = archives[4];
            if (fourth === undefined || fifth === undefined)
              return yield* Effect.die("Expected five independently stored archives");
            const tracer = Tracer.make({
              span(options) {
                const span = new Tracer.NativeSpan(options);
                spans.push(span);
                return span;
              },
            });
            yield* Effect.gen(function* () {
              for (const archive of archives.slice(0, 3))
                yield* cache.write(archive.integrity, archive.bytes);
              expect(spans.filter((span) => span.name === "axm.archive.cache-prune")).toEqual([]);
              const fourthWrite = yield* cache
                .write(fourth.integrity, fourth.bytes)
                .pipe(Effect.forkChild);
              yield* Deferred.await(reachedEnumeration);
              yield* cache.write(fifth.integrity, fifth.bytes);
              yield* Deferred.succeed(releaseEnumeration, undefined);
              yield* Fiber.join(fourthWrite);
              expect(yield* cache.prune()).toEqual({
                removed: 0,
                bytesFreed: 0,
                remaining: 5,
                remainingBytes: 15,
              });
            }).pipe(
              Effect.withSpan("axm.operation.phase", {
                attributes: { "axm.operation.phase": "acquisition" },
              }),
              Effect.provideService(CurrentWorkObserver, {
                record: (fact, parent) => facts.push({ fact, parent }),
                detailSelected: () => false,
              }),
              Effect.withTracer(tracer),
              Effect.withTracerEnabled(true),
            );
            const prunes = spans.filter((span) => span.name === "axm.archive.cache-prune");
            const phase = spans.find((span) => span.name === "axm.operation.phase");
            expect(prunes).toHaveLength(2);
            expect(inventories.map((inventory) => inventory.names.length)).toEqual([
              writeBeforeEnumeration ? 5 : 4,
              5,
            ]);
            expect(prunes.map((span) => span.attributes.get("axm.cache.prune.trigger"))).toEqual([
              "automatic",
              "explicit",
            ]);
            for (const [index, span] of prunes.entries()) {
              const inventory = inventories[index];
              if (inventory === undefined) return yield* Effect.die("Missing native inventory");
              expect(inventory.owner).toBe(span);
              expect(span.parent).toEqual(Option.some(phase));
              expect(span.status._tag === "Ended" && span.status.exit._tag).toBe("Success");
              expect(span.attributes.get("axm.cache.entries-scanned")).toBe(inventory.names.length);
              expect(span.attributes.get("axm.cache.entries-removed")).toBe(0);
              expect(span.attributes.get("axm.cache.bytes-freed")).toBe(0);
              const ownedStats = stats.filter((stat) => stat.owner === span);
              expect(ownedStats.map((stat) => stat.name).sort()).toEqual(
                [...inventory.names].sort(),
              );
              const ownedFacts = facts.filter(
                ({ fact, parent }) => fact.kind === "axm.io.stat" && parent === span,
              );
              expect(ownedFacts).toHaveLength(inventory.names.length);
              expect(
                ownedFacts.every(
                  ({ fact }) =>
                    fact.outcome === "success" && fact.attributes["axm.work.executed"] === 1,
                ),
              ).toBe(true);
            }
            expect(stats).toHaveLength(writeBeforeEnumeration ? 10 : 9);
            expect(spans.some((span) => span.name === "axm.io.stat")).toBe(false);
            expect(
              (yield* fs.readDirectory(cacheRoot)).filter((name) => name.endsWith(".zip")),
            ).toHaveLength(5);
          }),
        ),
      { discard: true },
    ),
  );

  it.effect("deletes a corrupt archive instead of returning it", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* makeArchiveCache(fs, path, cacheRoot);
        const archive = new Uint8Array([1, 2, 3, 4]);
        const integrity = yield* computeIntegrity(archive);

        yield* cache.write(integrity, archive);
        const [entry] = (yield* fs.readDirectory(cacheRoot)).filter((name) =>
          name.endsWith(".zip"),
        );
        if (entry === undefined) return yield* Effect.die("Expected cache entry");
        writeFileSync(nodePath.join(cacheRoot, entry), new Uint8Array([9, 9, 9]));

        const result = yield* cache.read(integrity);

        expect(Option.isNone(result)).toBe(true);
        expect(yield* fs.exists(nodePath.join(cacheRoot, entry))).toBe(false);
      }),
    ),
  );

  it.effect("verify removes corrupt entries and reports exact totals", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* makeArchiveCache(fs, path, cacheRoot);
        const first = new Uint8Array([1, 2]);
        const second = new Uint8Array([3, 4, 5]);
        const firstIntegrity = yield* computeIntegrity(first);
        const secondIntegrity = yield* computeIntegrity(second);
        yield* cache.write(firstIntegrity, first);
        yield* cache.write(secondIntegrity, second);
        const entries = (yield* fs.readDirectory(cacheRoot))
          .filter((name) => name.endsWith(".zip"))
          .sort();
        const corruptEntry = entries[0];
        if (corruptEntry === undefined) return yield* Effect.die("Expected cache entry");
        writeFileSync(nodePath.join(cacheRoot, corruptEntry), new Uint8Array([0]));

        const result = yield* cache.verify();

        expect(result).toEqual({ checked: 2, valid: 1, corruptRemoved: 1 });
        expect(yield* fs.exists(nodePath.join(cacheRoot, corruptEntry))).toBe(false);
      }),
    ),
  );

  for (const failSecondRemoval of [false, true])
    it.effect(
      failSecondRemoval
        ? "retains exact completed eviction facts when the next removal fails"
        : "prunes expired entries and then enforces the size ceiling oldest-first",
      () =>
        withCache((cacheRoot) =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const removalFailure = PlatformError.systemError({
              _tag: "PermissionDenied",
              module: "FileSystem",
              method: "remove",
              description: "Injected second eviction failure",
            });
            const removalAttempts: string[] = [];
            let evicting = false;
            const removalFs = FileSystem.make({
              ...fs,
              remove: (target, options) =>
                Effect.suspend(() => {
                  if (evicting && path.dirname(target) === cacheRoot && target.endsWith(".zip")) {
                    removalAttempts.push(target);
                    if (failSecondRemoval && removalAttempts.length === 2)
                      return Effect.fail(removalFailure);
                  }
                  return fs.remove(target, options);
                }),
            });
            const cache = yield* makeArchiveCache(removalFs, path, cacheRoot, {
              maxBytes: 5,
              maxAge: Duration.seconds(1),
            });
            const archives = [
              new Uint8Array([1, 1, 1]),
              new Uint8Array([2, 2, 2]),
              new Uint8Array([3, 3, 3]),
            ];
            const integrities = yield* Effect.forEach(archives, computeIntegrity);
            yield* Effect.forEach(archives, (archive, index) =>
              cache.write(integrities[index] ?? "", archive, { prune: false }),
            );
            const entries = (yield* fs.readDirectory(cacheRoot))
              .filter((name) => name.endsWith(".zip"))
              .sort();
            // Age the entries against the effect clock, which `prune` now reads.
            const now = yield* Clock.currentTimeMillis;
            const expired = entries[0];
            const older = entries[1];
            const newest = entries[2];
            if (expired === undefined || older === undefined || newest === undefined) {
              return yield* Effect.die("Expected three cache entries");
            }
            const ageEntry = (name: string, elapsedMillis: number) => {
              const mtime = new Date(now - elapsedMillis);
              utimesSync(nodePath.join(cacheRoot, name), mtime, mtime);
            };
            ageEntry(expired, 2_000);
            ageEntry(older, 500);
            ageEntry(newest, 0);

            const spans: Tracer.NativeSpan[] = [];
            evicting = true;
            const result = yield* cache.prune().pipe(
              Effect.withTracer(
                Tracer.make({
                  span(options) {
                    const span = new Tracer.NativeSpan(options);
                    spans.push(span);
                    return span;
                  },
                }),
              ),
              Effect.withTracerEnabled(true),
              Effect.exit,
            );

            expect(removalAttempts).toEqual([
              path.join(cacheRoot, expired),
              path.join(cacheRoot, older),
            ]);
            if (failSecondRemoval) {
              if (!Exit.isFailure(result))
                return yield* Effect.die("Expected second removal failure");
              const failure = Cause.squash(result.cause);
              if (!(failure instanceof RegistryOperationFailed))
                return yield* Effect.die("Expected the unchanged Registry failure mapping");
              expect(failure.category).toBe("internal");
              expect(failure.detail).toBe(
                `Failed to remove cache entry: ${path.join(cacheRoot, older)}`,
              );
              expect(failure.cause).toBe(removalFailure);
              expect((yield* fs.readDirectory(cacheRoot)).sort()).toEqual([older, newest].sort());
              expect(readFileSync(path.join(cacheRoot, older))).toHaveLength(3);
            } else {
              expect(result).toEqual(
                Exit.succeed({
                  removed: 2,
                  bytesFreed: 6,
                  remaining: 1,
                  remainingBytes: 3,
                }),
              );
              expect(yield* fs.readDirectory(cacheRoot)).toEqual([newest]);
            }
            expect(readFileSync(nodePath.join(cacheRoot, newest))).toHaveLength(3);
            const prunes = spans.filter((span) => span.name === "axm.archive.cache-prune");
            expect(prunes).toHaveLength(1);
            expect(prunes[0]?.attributes.get("axm.cache.prune.trigger")).toBe("explicit");
            expect(prunes[0]?.attributes.get("axm.cache.entries-scanned")).toBe(3);
            expect(prunes[0]?.attributes.get("axm.cache.entries-removed")).toBe(
              failSecondRemoval ? 1 : 2,
            );
            expect(prunes[0]?.attributes.get("axm.cache.bytes-freed")).toBe(
              failSecondRemoval ? 3 : 6,
            );
            const prune = prunes[0];
            expect(prune?.status._tag === "Ended" && prune.status.exit._tag).toBe(
              failSecondRemoval ? "Failure" : "Success",
            );
          }),
        ),
    );
});

it.effect(
  "reports delivered reuse separately from cancelled followers against real cache work",
  () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* makeArchiveCache(fs, path, cacheRoot);
        const archive = new Uint8Array([1, 2, 3]);
        const integrity = yield* computeIntegrity(archive);
        const spans: Tracer.NativeSpan[] = [];
        const facts: WorkFact[] = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        let fetches = 0;
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const fetch = Effect.sync(() => {
          fetches += 1;
        }).pipe(
          Effect.andThen(Deferred.succeed(started, undefined)),
          Effect.andThen(Deferred.await(release)),
          Effect.as(archive),
        );
        yield* Effect.gen(function* () {
          const first = yield* cache
            .load("same", integrity, fetch)
            .pipe(Effect.forkChild({ startImmediately: true }));
          yield* Deferred.await(started);
          const cancelled = yield* cache
            .load("same", integrity, fetch)
            .pipe(Effect.forkChild({ startImmediately: true }));
          yield* Fiber.interrupt(cancelled);
          expect(Exit.hasInterrupts(yield* Fiber.await(cancelled))).toBe(true);
          const second = yield* cache
            .load("same", integrity, fetch)
            .pipe(Effect.forkChild({ startImmediately: true }));
          yield* Deferred.succeed(release, undefined);
          yield* Fiber.join(first);
          yield* Fiber.join(second);
          yield* cache.load("same", integrity, Effect.die("unexpected download"));
          const [entry] = yield* fs.readDirectory(cacheRoot);
          if (entry === undefined) throw new Error("Expected one actual cache entry");
          yield* fs.writeFile(path.join(cacheRoot, entry), new Uint8Array([9]));
          expect(yield* cache.read(integrity)).toEqual(Option.none());
          expect(yield* fs.readDirectory(cacheRoot)).toEqual([]);
        }).pipe(
          Effect.provideService(CurrentWorkObserver, {
            record: (fact) => {
              facts.push(fact);
            },
            detailSelected: () => false,
          }),
          Effect.withTracer(tracer),
          Effect.withTracerEnabled(true),
        );
        expect(fetches).toBe(1);
        const loads = facts.filter((fact) => fact.kind === "axm.archive.cache-load");
        expect(loads).toHaveLength(4);
        expect(loads.map((fact) => fact.attributes["axm.work.requested"])).toEqual([1, 1, 1, 1]);
        expect(
          loads.reduce((total, fact) => total + (fact.attributes["axm.work.executed"] ?? 0), 0),
        ).toBe(2);
        expect(
          loads.reduce((total, fact) => total + (fact.attributes["axm.work.reused-count"] ?? 0), 0),
        ).toBe(1);
        expect(loads.find((fact) => fact.outcome === "interrupted")?.attributes).toMatchObject({
          "axm.cache.outcome": "coalesced",
          "axm.work.executed": 0,
          "axm.work.reused-count": 0,
        });
        expect(
          facts
            .filter((fact) => fact.kind === "axm.archive.cache-read")
            .map((fact) => fact.attributes["axm.cache.outcome"]),
        ).toEqual(["miss", "hit", "corrupt"]);
        expect(
          facts
            .filter((fact) => fact.kind === "axm.archive.integrity")
            .map((fact) => fact.attributes["axm.archive.bytes"]),
        ).toEqual([3, 3, 1]);
        expect(spans.filter((span) => span.name.startsWith("axm.archive."))).toEqual([]);
      }),
    ),
);

it.effect("counts a delivered coalesced failure as reuse without storing failed bytes", () =>
  withCache((cacheRoot) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cache = yield* makeArchiveCache(fs, path, cacheRoot);
      const integrity = yield* computeIntegrity(new Uint8Array([1]));
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let fetches = 0;
      const failure = new RegistryOperationFailed({
        category: "network",
        detail: "Controlled unavailable archive",
      });
      const fetch = Effect.sync(() => {
        fetches += 1;
      }).pipe(
        Effect.andThen(Deferred.succeed(started, undefined)),
        Effect.andThen(Deferred.await(release)),
        Effect.andThen(Effect.fail(failure)),
      );
      const facts: WorkFact[] = [];
      yield* Effect.gen(function* () {
        const first = yield* cache.load("same", integrity, fetch).pipe(Effect.forkChild);
        yield* Deferred.await(started);
        const follower = yield* cache
          .load("same", integrity, fetch)
          .pipe(Effect.forkChild({ startImmediately: true }));
        yield* Deferred.succeed(release, undefined);
        expect(yield* Fiber.join(first).pipe(Effect.flip)).toBe(failure);
        expect(yield* Fiber.join(follower).pipe(Effect.flip)).toBe(failure);
      }).pipe(
        Effect.provideService(CurrentWorkObserver, {
          record: (fact) => {
            facts.push(fact);
          },
          detailSelected: () => false,
        }),
      );
      expect(fetches).toBe(1);
      expect(yield* fs.exists(cacheRoot)).toBe(false);
      const loads = facts.filter((fact) => fact.kind === "axm.archive.cache-load");
      expect(loads.map((fact) => fact.attributes["axm.work.executed"]).sort()).toEqual([0, 1]);
      expect(loads.map((fact) => fact.attributes["axm.work.reused-count"]).sort()).toEqual([0, 1]);
      expect(loads.map((fact) => fact.outcome)).toEqual(["failure", "failure"]);
    }),
  ),
);
