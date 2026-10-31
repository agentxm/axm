import { describe, expect, expectTypeOf, it, vi } from "@effect/vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FileSystem from "effect/FileSystem";
import * as Clock from "effect/Clock";
import * as Exit from "effect/Exit";
import * as Random from "effect/Random";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClient from "effect/http/HttpClient";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Deferred from "effect/Deferred";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import {
  contentIntegrity,
  observePublication,
  PublicationHttpError,
  PublicationIntegrityConflict,
  isTransientPublicationError,
  PublicationReadbackTimeout,
  readNpmDistTag,
  readNpmPublication,
  verifyNpmDownload,
  releaseCohortTarballPath,
  releaseBoundaryError,
  ReleaseBoundaryFailed,
  requireInitializedNpmPackages,
  reconcileNpmStableTag,
  distributeRelease,
  guardPublicationVersion,
  publishImmutable,
  publishImmutableCohort,
  publishImmutableInDependencyOrder,
  SupersededRelease,
  type PublicationStates,
} from "./release-publication.js";
import { prepareFormula } from "./release-formula.js";

const bytes = new TextEncoder().encode("candidate");
const integrity = contentIntegrity(bytes);

describe("release tarball paths", () => {
  it.each(["../outside", "1.2.3/../../outside", "1.2.3-rc.1", "1.2.3+build", "01.2.3"])(
    "rejects an invalid release version before reading release inputs: %s",
    (version) => {
      const result = spawnSync(
        "bun",
        [join("scripts", "distribute-release.ts"), version, `cli-v${version}`, "a".repeat(40)],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "Expected a stable release version in major.minor.patch form.",
      );
    },
  );

  it.effect("selects only the exact regular tarball from the cohort directory", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-release-cohort-" });
      const expected = join(directory, "axm.sh-1.2.3.tgz");
      const other = join(directory, "axm.sh-1.2.30.tgz");
      yield* fs.writeFileString(other, "other release");
      expect(
        (yield* Effect.flip(releaseCohortTarballPath(directory, "axm.sh-", "1.2.3"))).message,
      ).toContain("Release tarball is missing or not a regular file");
      yield* fs.symlink(other, expected);
      expect(
        (yield* Effect.flip(releaseCohortTarballPath(directory, "axm.sh-", "1.2.3"))).message,
      ).toContain("Release tarball is missing or not a regular file");
      yield* fs.remove(expected);
      yield* fs.writeFileString(expected, "exact release");
      expect(yield* releaseCohortTarballPath(directory, "axm.sh-", "1.2.3")).toBe(expected);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect.each(["../outside", "../../outside", "/../../outside"])(
    "rejects a version that is not a stable numeric release: %s",
    (version) =>
      Effect.gen(function* () {
        expect(
          (yield* Effect.flip(releaseCohortTarballPath("release-npm", "axm.sh-", version))).message,
        ).toContain("Expected a stable release version in major.minor.patch form.");
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects an invalid tarball prefix even when the version is valid", () =>
    Effect.gen(function* () {
      expect(
        (yield* Effect.flip(releaseCohortTarballPath("release-npm", "../outside/", "1.2.3")))
          .message,
      ).toContain("Release tarball name must be a basename.");
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

const boundedObservation = (timeoutMs = 10) => ({
  timeoutMs,
  initialDelayMs: 1,
  maxDelayMs: 1,
});

/** Exercise real Effect schedules and deadlines with the test clock. */
const advance = <A, E, R>(program: Effect.Effect<A, E, R>, milliseconds = 100) =>
  Effect.gen(function* () {
    const fiber = yield* program.pipe(
      Effect.provideService(Random.Random, { nextIntUnsafe: () => 0, nextDoubleUnsafe: () => 0.5 }),
      Effect.forkChild,
    );
    yield* TestClock.adjust(milliseconds);
    return yield* Fiber.join(fiber);
  });

type Fetcher = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;

const withFetch = <A, E, R>(
  program: Effect.Effect<A, E, R | HttpClient.HttpClient>,
  fetcher: Fetcher,
) =>
  program.pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(
      FetchHttpClient.Fetch,
      Object.assign(fetcher, { preconnect: () => undefined }),
    ),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error", cache: "no-store" }),
  );

describe("immutable release publication", () => {
  it.effect("publishes an absent output once and reuses verified bytes on a rerun", () =>
    Effect.gen(function* () {
      let stored: string | null = null;
      const write = vi.fn(() => {
        stored = integrity;
      });
      const publication = {
        name: "candidate",
        integrity,
        read: Effect.sync(() => stored),
        publish: Effect.sync(write),
      };
      expect(yield* publishImmutable(publication)).toBe("published");
      expect(yield* publishImmutable(publication)).toBe("reused");
      expect(write).toHaveBeenCalledOnce();
    }),
  );

  it.effect("rejects different content without overwriting it", () =>
    Effect.gen(function* () {
      const write = vi.fn();
      const failure = yield* Effect.flip(
        publishImmutable({
          name: "candidate",
          integrity,
          read: Effect.succeed("different"),
          publish: Effect.sync(write),
        }),
      );
      expect(failure).toBeInstanceOf(PublicationIntegrityConflict);
      expect(write).not.toHaveBeenCalled();
    }),
  );

  it.effect.each(["network", "authorization"])(
    "preserves %s existence failures without mutation",
    (message) =>
      Effect.gen(function* () {
        const write = vi.fn();
        const failure = new Error(message);
        expect(
          yield* Effect.flip(
            publishImmutable({
              name: "candidate",
              integrity,
              read: Effect.fail(failure),
              publish: Effect.sync(write),
            }),
          ),
        ).toBe(failure);
        expect(write).not.toHaveBeenCalled();
      }),
  );

  it.effect("does not treat an unverified write as complete", () =>
    Effect.gen(function* () {
      const failure = yield* advance(
        Effect.flip(
          publishImmutable({
            name: "candidate",
            integrity,
            read: Effect.succeed(null),
            publish: Effect.void,
            observation: boundedObservation(1),
          }),
        ),
      );
      expect(failure).toBeInstanceOf(PublicationReadbackTimeout);
    }),
  );

  it.effect.each([false, true])(
    "confirms delayed visibility without replaying a submission, ambiguous=%s",
    (ambiguous) =>
      Effect.gen(function* () {
        let reads = 0;
        const write = vi.fn();
        const result = yield* advance(
          publishImmutable({
            name: "candidate",
            integrity,
            read: Effect.sync(() => (++reads < 4 ? null : integrity)),
            publish: Effect.sync(write).pipe(
              Effect.andThen(
                ambiguous
                  ? Effect.fail(new ReleaseBoundaryFailed({ cause: new Error("connection lost") }))
                  : Effect.void,
              ),
            ),
            observation: boundedObservation(),
          }),
        );
        expect(result).toBe("published");
        expect(write).toHaveBeenCalledOnce();
      }),
  );

  it.effect("preserves both an ambiguous submission and failed readback", () =>
    Effect.gen(function* () {
      const submissionFailure = new ReleaseBoundaryFailed({ cause: new Error("connection lost") });
      const failure = yield* advance(
        Effect.flip(
          publishImmutable({
            name: "candidate",
            integrity,
            read: Effect.succeed(null),
            publish: Effect.fail(submissionFailure),
            observation: boundedObservation(2),
          }),
        ),
      );
      expect(failure).toMatchObject({
        _tag: "PublicationUnconfirmed",
        publication: "candidate",
        submissionFailure,
        cause: { _tag: "PublicationReadbackTimeout" },
      });
    }),
  );

  it.effect("preflights every coordinate before writing any missing coordinate", () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const stored = new Set<string>();
      const outcomes = yield* publishImmutableCohort(
        ["one", "two", "three"].map((name) => ({
          name,
          integrity,
          read: Effect.sync(() => {
            events.push(`read:${name}`);
            return stored.has(name) ? integrity : null;
          }),
          publish: Effect.sync(() => {
            events.push(`write:${name}`);
            stored.add(name);
          }),
        })),
        { concurrency: 2 },
      );
      expect(events.slice(0, 3)).toEqual(["read:one", "read:two", "read:three"]);
      expect(outcomes).toEqual(
        ["one", "two", "three"].map((name) => ({ name, outcome: "published" })),
      );
    }),
  );

  it.effect("rejects a cohort conflict before any write", () =>
    Effect.gen(function* () {
      const write = vi.fn();
      const publish = Effect.sync(write);
      expect(
        yield* Effect.flip(
          publishImmutableCohort([
            { name: "missing", integrity, read: Effect.succeed(null), publish },
            { name: "conflict", integrity, read: Effect.succeed("different"), publish },
          ]),
        ),
      ).toMatchObject({ _tag: "PublicationIntegrityConflict", publication: "conflict" });
      expect(write).not.toHaveBeenCalled();
    }),
  );
});

describe("phased cohort publication budgets", () => {
  const cohort = (
    names: ReadonlyArray<string>,
    options: {
      readonly publishCostMs?: number;
      readonly readCostMs?: number;
      readonly afterPublish?: (name: string, reads: number) => string | null;
    } = {},
  ) => {
    const published = new Map<string, number>();
    const write = vi.fn((name: string) => {
      published.set(name, 0);
    });
    return {
      write,
      publications: names.map((name) => ({
        name,
        integrity,
        read: Effect.sleep(options.readCostMs ?? 0).pipe(
          Effect.andThen(
            Effect.sync(() => {
              const reads = published.get(name);
              if (reads === undefined) return null;
              published.set(name, reads + 1);
              return (
                options.afterPublish?.(name, reads + 1) ??
                (options.afterPublish === undefined ? integrity : null)
              );
            }),
          ),
        ),
        publish: Effect.sleep(options.publishCostMs ?? 0).pipe(
          Effect.andThen(Effect.sync(() => write(name))),
        ),
      })),
    };
  };

  it.effect("starts the readback budget after the last submission, not at cohort entry", () =>
    Effect.gen(function* () {
      const { publications } = cohort(["one", "two", "three"], { publishCostMs: 40 });
      const outcomes = yield* advance(
        publishImmutableCohort(publications, {
          concurrency: 3,
          timeoutMs: 50,
          preflightTimeoutMs: 50,
        }),
        150,
      );
      expect(outcomes).toEqual(
        ["one", "two", "three"].map((name) => ({ name, outcome: "published" })),
      );
    }),
  );

  it.effect("confirms delayed visibility inside the independent post-upload budget", () =>
    Effect.gen(function* () {
      const { publications, write } = cohort(["one", "two"], {
        publishCostMs: 100,
        afterPublish: (_name, reads) => (reads <= 4 ? null : integrity),
      });
      const outcomes = yield* advance(
        publishImmutableCohort(publications, boundedObservation(10)),
        250,
      );
      expect(outcomes.every(({ outcome }) => outcome === "published")).toBe(true);
      expect(write).toHaveBeenCalledTimes(2);
    }),
  );

  it.effect("rejects a permanent readback mismatch as an integrity conflict", () =>
    Effect.gen(function* () {
      const { publications } = cohort(["one"], { afterPublish: () => "different" });
      expect(
        yield* advance(Effect.flip(publishImmutableCohort(publications, boundedObservation()))),
      ).toMatchObject({ _tag: "PublicationIntegrityConflict", publication: "one" });
    }),
  );

  it.effect("interrupts a preflight read at its own deadline before any write", () =>
    Effect.gen(function* () {
      const { publications, write } = cohort(["one", "two", "three"], { readCostMs: 30 });
      const failure = yield* advance(
        Effect.flip(
          publishImmutableCohort(publications, {
            concurrency: 1,
            timeoutMs: 1_000,
            preflightTimeoutMs: 50,
          }),
        ),
      );
      expect(failure).toMatchObject({
        publication: "two",
        phase: "preflight",
        attempts: 1,
        elapsedMs: 50,
        deadlineMs: 50,
        lastObservation: { kind: "unobserved" },
      });
      expect(write).not.toHaveBeenCalled();
    }),
  );

  it.effect("reports readback diagnostics against the post-submission budget", () =>
    Effect.gen(function* () {
      const { publications } = cohort(["one"], { publishCostMs: 500, afterPublish: () => null });
      const failure = yield* advance(
        Effect.flip(publishImmutableCohort(publications, boundedObservation(5))),
        600,
      );
      expect(failure).toMatchObject({
        publication: "one",
        phase: "readback",
        attempts: 5,
        elapsedMs: 5,
        deadlineMs: 5,
        lastObservation: { kind: "absent" },
      });
    }),
  );

  it.effect("reuses every present asset on a same-tag rerun without writing", () =>
    Effect.gen(function* () {
      const write = vi.fn();
      const outcomes = yield* publishImmutableCohort(
        ["one", "two"].map((name) => ({
          name,
          integrity,
          read: Effect.succeed(integrity),
          publish: Effect.sync(write),
        })),
      );
      expect(outcomes).toEqual(["one", "two"].map((name) => ({ name, outcome: "reused" })));
      expect(write).not.toHaveBeenCalled();
    }),
  );
});

describe("dependency-ordered immutable publication", () => {
  it.effect("waits for dependency visibility before publishing its consumer", () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const stored = new Set<string>();
      let dependencyReads = 0;
      const publications = ["dependency", "consumer"].map((name) => ({
        name,
        integrity,
        read: Effect.sync(() => {
          if (!stored.has(name)) return null;
          if (name === "dependency" && ++dependencyReads < 3) return null;
          events.push(`confirmed:${name}`);
          return integrity;
        }),
        publish: Effect.sync(() => {
          events.push(`published:${name}`);
          stored.add(name);
        }),
      }));
      const results = yield* advance(
        publishImmutableInDependencyOrder(publications, boundedObservation(20)),
      );
      expect(results.every(({ outcome }) => outcome === "published")).toBe(true);
      expect(events).toEqual([
        "published:dependency",
        "confirmed:dependency",
        "published:consumer",
        "confirmed:consumer",
      ]);
    }),
  );

  it.effect("stops before the consumer when its dependency cannot be published", () =>
    Effect.gen(function* () {
      const writes: string[] = [];
      const failure = yield* advance(
        Effect.flip(
          publishImmutableInDependencyOrder(
            ["dependency", "consumer"].map((name) => ({
              name,
              integrity,
              read: Effect.succeed(null),
              publish: Effect.sync(() => {
                writes.push(name);
              }).pipe(
                Effect.andThen(
                  Effect.fail(new ReleaseBoundaryFailed({ cause: new Error("ENEEDAUTH") })),
                ),
              ),
            })),
            boundedObservation(3),
          ),
        ),
      );
      expect(writes).toEqual(["dependency"]);
      expect(failure).toMatchObject({ _tag: "PublicationUnconfirmed", publication: "dependency" });
    }),
  );

  it.effect("detects conflicting consumer bytes before publishing a missing dependency", () =>
    Effect.gen(function* () {
      const write = vi.fn();
      const publish = Effect.sync(write);
      const failure = yield* Effect.flip(
        publishImmutableInDependencyOrder([
          { name: "dependency", integrity, read: Effect.succeed(null), publish },
          { name: "consumer", integrity, read: Effect.succeed("different"), publish },
        ]),
      );
      expect(write).not.toHaveBeenCalled();
      expect(failure).toMatchObject({
        _tag: "PublicationIntegrityConflict",
        publication: "consumer",
      });
    }),
  );

  it.effect("confirms a lost dependency response without submitting twice", () =>
    Effect.gen(function* () {
      const stored = new Set<string>();
      const writes: string[] = [];
      yield* publishImmutableInDependencyOrder(
        ["dependency", "consumer"].map((name) => ({
          name,
          integrity,
          read: Effect.sync(() => (stored.has(name) ? integrity : null)),
          publish: Effect.sync(() => {
            writes.push(name);
            stored.add(name);
          }).pipe(
            Effect.andThen(
              name === "dependency"
                ? Effect.fail(new ReleaseBoundaryFailed({ cause: new Error("lost response") }))
                : Effect.void,
            ),
          ),
        })),
        boundedObservation(),
      );
      expect(writes).toEqual(["dependency", "consumer"]);
    }),
  );

  it.effect("gives each dependent publication its own observation window", () =>
    Effect.gen(function* () {
      const stored = new Set<string>();
      const results = yield* advance(
        publishImmutableInDependencyOrder(
          ["dependency", "consumer"].map((name) => ({
            name,
            integrity,
            read: Effect.sync(() => (stored.has(name) ? integrity : null)),
            publish: Effect.sleep(2).pipe(
              Effect.andThen(
                Effect.sync(() => {
                  stored.add(name);
                }),
              ),
            ),
          })),
          boundedObservation(3),
        ),
      );
      expect(results.every(({ outcome }) => outcome === "published")).toBe(true);
    }),
  );

  it.effect("preserves supersession for the release orchestrator", () =>
    Effect.gen(function* () {
      const superseded = new SupersededRelease("1.0.0", "1.1.0", "npm latest");
      const write = vi.fn();
      expect(
        yield* Effect.flip(
          publishImmutableInDependencyOrder([
            {
              name: "dependency",
              integrity,
              read: Effect.fail(superseded),
              publish: Effect.sync(write),
            },
          ]),
        ),
      ).toBe(superseded);
      expect(write).not.toHaveBeenCalled();
    }),
  );
});

describe("bounded publication observation", () => {
  const busy = new PublicationHttpError("busy", 503);
  it.effect.each(["absent", "transient"])(
    "reports the deadline while waiting after %s",
    (outcome) =>
      Effect.gen(function* () {
        const read = vi.fn(() =>
          outcome === "transient" ? Effect.fail(busy) : Effect.succeed(null),
        );
        const failure = yield* advance(
          Effect.flip(
            observePublication({
              name: "candidate@1.2.3",
              read: Effect.suspend(read),
              matches: () => false,
              retryError: isTransientPublicationError,
              timeoutMs: 10,
              initialDelayMs: 10,
              maxDelayMs: 10,
            }),
          ),
        );
        expect(failure).toMatchObject({ _tag: "PublicationReadbackTimeout", attempts: 1 });
        expect(read).toHaveBeenCalledOnce();
      }),
  );

  it.effect.each([
    { last: "absent", after: null, expected: { kind: "absent" }, summary: "last: absent" },
    { last: "mismatch", after: "older", expected: { kind: "mismatch" }, summary: "last: mismatch" },
    {
      last: "transient",
      after: busy,
      expected: { kind: "transient", status: 503 },
      summary: "last: transient HTTP 503",
    },
  ])("reports attempts, elapsed budget, and the last $last observation", (scenario) =>
    Effect.gen(function* () {
      let attempts = 0;
      const failure = yield* advance(
        Effect.flip(
          observePublication({
            name: "candidate@1.2.3",
            read: Effect.suspend(() =>
              ++attempts === 1 || scenario.after instanceof PublicationHttpError
                ? Effect.fail(busy)
                : Effect.succeed(scenario.after),
            ),
            matches: () => false,
            retryError: isTransientPublicationError,
            timeoutMs: 10,
            initialDelayMs: 2,
            maxDelayMs: 2,
          }),
        ),
      );
      expect(failure).toMatchObject({
        publication: "candidate@1.2.3",
        phase: "readback",
        attempts: 5,
        elapsedMs: 10,
        deadlineMs: 10,
        lastObservation: scenario.expected,
        cause: busy,
      });
      expect(failure.message).toBe(
        `Published content readback timed out: candidate@1.2.3 (readback, 5 attempts, 10ms of 10ms, ${scenario.summary}).`,
      );
    }),
  );

  it.effect("interrupts the observation without turning cancellation into a timeout", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const fiber = yield* observePublication({
        name: "candidate",
        read: Deferred.succeed(started, undefined).pipe(Effect.as(null)),
        matches: () => false,
      }).pipe(Effect.forkChild);
      yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true);
    }),
  );

  it.effect("honors retry-after before attempting another read", () =>
    Effect.gen(function* () {
      const observedAt: number[] = [];
      const read = Effect.gen(function* () {
        observedAt.push(yield* Clock.currentTimeMillis);
        if (observedAt.length === 1)
          return yield* Effect.fail(new PublicationHttpError("busy", 429, 7));
        return integrity;
      });
      expect(
        yield* advance(
          observePublication({
            name: "candidate",
            read,
            matches: (value) => value === integrity,
            retryError: isTransientPublicationError,
            timeoutMs: 20,
            initialDelayMs: 1,
            maxDelayMs: 2,
          }),
        ),
      ).toBe(integrity);
      expect(observedAt).toEqual([0, 7]);
    }),
  );

  it.effect("fails terminal read errors immediately", () =>
    Effect.gen(function* () {
      const unauthorized = new PublicationHttpError("unauthorized", 401);
      const read = vi.fn(() => Effect.fail(unauthorized));
      expect(
        yield* Effect.flip(
          observePublication({
            name: "candidate",
            read: Effect.suspend(read),
            matches: () => false,
            retryError: isTransientPublicationError,
          }),
        ),
      ).toBe(unauthorized);
      expect(read).toHaveBeenCalledOnce();
    }),
  );
});

class PublicationPermission extends Context.Service<
  PublicationPermission,
  { readonly allowed: boolean }
>()("axm/scripts/release-publication.test/PublicationPermission") {}

describe("distribution ordering and recovery", () => {
  it.effect("keeps recording failures typed without replaying a successful publication", () =>
    Effect.gen(function* () {
      const write = vi.fn(() => Effect.void);
      const record = vi.fn(() => Effect.fail(new PublicationHttpError("record unavailable", 503)));
      const failure = yield* Effect.flip(
        distributeRelease(Effect.void, [{ name: "artifacts", publish: write }], record),
      );
      expect(failure).toMatchObject({ _tag: "PublicationHttpError", status: 503 });
      expect(record).toHaveBeenCalledOnce();
      expect(record).toHaveBeenCalledWith({
        artifacts: "succeeded",
        distribution: "pending",
        npm: "pending",
        tap: "pending",
      });
      expect(write).toHaveBeenCalledOnce();
    }),
  );
  it.effect("retains a publisher's typed failure and service requirement", () =>
    Effect.gen(function* () {
      const failure = new PublicationHttpError("publisher refused", 403);
      const records: PublicationStates[] = [];
      const program = distributeRelease(
        Effect.void,
        [
          {
            name: "npm",
            publish: () =>
              Effect.flatMap(PublicationPermission, ({ allowed }) =>
                allowed ? Effect.void : Effect.fail(failure),
              ),
          },
        ],
        (state) =>
          Effect.sync(() => {
            records.push(state);
          }),
      );
      expectTypeOf(program).toEqualTypeOf<
        Effect.Effect<"distributed" | "superseded", PublicationHttpError, PublicationPermission>
      >();
      const result = yield* program.pipe(
        Effect.provideService(PublicationPermission, { allowed: false }),
        Effect.flip,
      );
      expect(result).toBe(failure);
      expect(result._tag).toBe("PublicationHttpError");
      expect(records.at(-1)?.npm).toBe("failed");
    }),
  );
  it.effect.each(["artifacts", "distribution", "npm", "tap"] as const)(
    "records %s failure and permits a rerun to reuse prior outputs",
    (failed) =>
      Effect.gen(function* () {
        const completed = new Set<string>();
        const writes: string[] = [];
        const records: PublicationStates[] = [];
        let failure = true;
        const boundaries = (["artifacts", "distribution", "npm", "tap"] as const).map((name) => ({
          name,
          publish: () =>
            Effect.tryPromise({
              try: async () => {
                if (name === failed && failure) throw new Error("publisher failed");
                if (!completed.has(name)) {
                  writes.push(name);
                  completed.add(name);
                }
              },
              catch: releaseBoundaryError,
            }),
        }));
        const firstFailure = yield* Effect.flip(
          distributeRelease(Effect.void, boundaries, (state) =>
            Effect.sync(() => {
              records.push(state);
            }),
          ),
        );
        expect(firstFailure).toBeInstanceOf(ReleaseBoundaryFailed);
        expect(firstFailure).toHaveProperty("message", "publisher failed");
        expect(records.at(-1)?.[failed]).toBe("failed");
        failure = false;
        const outcome = yield* distributeRelease(Effect.void, boundaries, (state) =>
          Effect.sync(() => {
            records.push(state);
          }),
        );
        expect(outcome).toBe("distributed");
        expect(writes).toEqual(["artifacts", "distribution", "npm", "tap"]);
        expect(records.at(-1)).toEqual({
          artifacts: "succeeded",
          distribution: "succeeded",
          npm: "succeeded",
          tap: "succeeded",
        });
      }),
  );
  it.effect("stops a superseded candidate before any historical publication repair", () =>
    Effect.gen(function* () {
      const publish = vi.fn(() => Effect.void);
      const outcome = yield* distributeRelease(
        Effect.fail(new SupersededRelease("1.2.3", "1.2.4", "npm")),
        [{ name: "artifacts", publish }],
        () => Effect.void,
      );
      expect(outcome).toBe("superseded");
      expect(publish).not.toHaveBeenCalled();
    }),
  );
  it.each(["npm", "Homebrew", "stable"])(
    "guards an older candidate at the %s write boundary",
    (owner) => {
      expect(() => guardPublicationVersion("1.2.3", "1.3.0", owner)).toThrow(SupersededRelease);
      expect(() => guardPublicationVersion("1.3.0", "1.2.3", owner)).not.toThrow();
      expect(() => guardPublicationVersion("1.3.0", "1.3.0", owner)).not.toThrow();
    },
  );
});

const assets = ["axm-darwin-arm64", "axm-darwin-x64", "axm-linux-arm64", "axm-linux-x64"];
const hashes = new Map(assets.map((name) => [name, "a".repeat(64)]));
const formula = (version: string) =>
  `class Axm < Formula\n  version "${version}"\n${assets.map((name) => `  url "https://releases.axm.sh/cli-v${version}/${name}"\n  sha256 "${"a".repeat(64)}"`).join("\n")}\nend\n`;

describe("Homebrew formula identity", () => {
  it("reuses an identical coordinate and all four descriptors", () => {
    expect(prepareFormula(formula("1.2.3"), "1.2.3", hashes).changed).toBe(false);
  });
  it("updates all four immutable URLs with their checksums", () => {
    expect(prepareFormula(formula("1.2.2"), "1.2.3", hashes).content).toBe(formula("1.2.3"));
  });
  it.each(assets)("rejects equal-version wrong bytes for %s", (name) => {
    const changed = new Map(hashes).set(name, "b".repeat(64));
    expect(() => prepareFormula(formula("1.2.3"), "1.2.3", changed)).toThrow("integrity conflict");
  });
  it("rejects equal-version wrong artifact coordinates", () => {
    expect(() =>
      prepareFormula(formula("1.2.3").replace("releases.axm.sh", "other.example"), "1.2.3", hashes),
    ).toThrow("integrity conflict");
  });
  it("retains a newer formula", () => {
    expect(() => prepareFormula(formula("1.3.0"), "1.2.3", hashes)).toThrow(SupersededRelease);
  });
});

describe("bootstrap prerelease propagation window", () => {
  // The bootstrap publisher runs on import, so its readback bounds are pinned
  // at the source: a preview must not fail a lag the stable publisher accepts.
  it("observes every post-write readback within the stable npm propagation window", () => {
    const publisher = readFileSync("scripts/publish-bootstrap-prerelease.ts", "utf8");
    const readbackBounds = [...publisher.matchAll(/\btimeoutMs: ([^,\s}]+)/g)].map(
      ([, bound]) => bound,
    );
    expect(readbackBounds).toEqual(["npmPropagationTimeoutMs", "npmPropagationTimeoutMs"]);
  });
});

describe("npm download readiness", () => {
  const input = { name: "axm.sh", version: "1.2.3", integrity };
  const tarball = "https://registry.npmjs.org/axm.sh/-/axm.sh-1.2.3.tgz";
  const metadata = (digest = integrity, url = tarball) =>
    Response.json({
      "dist-tags": { latest: "1.2.3" },
      versions: { "1.2.3": { dist: { integrity: digest, tarball: url } } },
    });

  it.effect("waits beyond visible metadata until the exact tarball can be downloaded", () =>
    Effect.gen(function* () {
      let downloads = 0;
      const fetcher: Fetcher = async (url, options) => {
        expect(options?.signal).toBeDefined();
        if (String(url) !== tarball) return metadata();
        expect(options?.redirect).toBe("error");
        expect(new Headers(options?.headers).get("cache-control")).toBe("no-cache");
        downloads += 1;
        return downloads < 3 ? new Response(null, { status: 404 }) : new Response(bytes);
      };
      yield* advance(withFetch(verifyNpmDownload(input, boundedObservation()), fetcher));
      expect(downloads).toBe(3);
    }),
  );

  it.effect(
    "fails at its deadline when metadata exists but tarball bytes never become visible",
    () =>
      Effect.gen(function* () {
        const failure = yield* advance(
          Effect.flip(
            withFetch(verifyNpmDownload(input, boundedObservation()), async (url) =>
              String(url) === tarball ? new Response(null, { status: 404 }) : metadata(),
            ),
          ),
        );
        expect(failure).toBeInstanceOf(PublicationReadbackTimeout);
      }),
  );

  it.effect.each(["metadata", "bytes"])("rejects conflicting %s without retrying", (conflict) =>
    Effect.gen(function* () {
      const fetcher = vi.fn<Fetcher>(async (url) =>
        String(url) === tarball
          ? new Response("different bytes")
          : metadata(conflict === "metadata" ? "different" : integrity),
      );
      const failure = yield* Effect.flip(
        withFetch(verifyNpmDownload(input, boundedObservation()), fetcher),
      );
      expect(failure.message).toContain("integrity conflict");
      expect(fetcher).toHaveBeenCalledTimes(conflict === "metadata" ? 1 : 2);
    }),
  );

  it.effect.each([401, 403])("does not retry a tarball authorization failure: %i", (status) =>
    Effect.gen(function* () {
      const fetcher = vi.fn<Fetcher>(async (url) =>
        String(url) === tarball ? new Response(null, { status }) : metadata(),
      );
      const failure = yield* Effect.flip(
        withFetch(verifyNpmDownload(input, boundedObservation()), fetcher),
      );
      expect(failure.message).toContain(`HTTP ${status}`);
      expect(fetcher).toHaveBeenCalledTimes(2);
    }),
  );

  it.effect.each([429, 503])("retries a transient tarball failure: %i", (status) =>
    Effect.gen(function* () {
      let downloads = 0;
      yield* advance(
        withFetch(verifyNpmDownload(input, boundedObservation()), async (url) => {
          if (String(url) !== tarball) return metadata();
          return ++downloads === 1
            ? new Response(null, { status, headers: { "retry-after": "0" } })
            : new Response(bytes);
        }),
      );
      expect(downloads).toBe(2);
    }),
  );

  it.effect("rejects an unexpected tarball origin before making that request", () =>
    Effect.gen(function* () {
      const fetcher = vi.fn<Fetcher>(async () =>
        metadata(integrity, "https://example.com/archive.tgz"),
      );
      const failure = yield* Effect.flip(
        withFetch(verifyNpmDownload(input, boundedObservation()), fetcher),
      );
      expect(failure.message).toContain("Unexpected npm tarball host");
      expect(fetcher).toHaveBeenCalledOnce();
    }),
  );

  it.effect("cancels an in-flight tarball download when verification is interrupted", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const aborted = yield* Deferred.make<void>();
      const verification = yield* withFetch(verifyNpmDownload(input), (url, options) => {
        if (String(url) !== tarball) return Promise.resolve(metadata());
        return new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => {
              Deferred.doneUnsafe(aborted, Effect.void);
              reject(new DOMException("Download aborted", "AbortError"));
            },
            { once: true },
          );
          Deferred.doneUnsafe(started, Effect.void);
        });
      }).pipe(Effect.forkChild);
      yield* Deferred.await(started);
      yield* Fiber.interrupt(verification);
      yield* Deferred.await(aborted);
    }),
  );

  it.effect("bounds tarball response-body consumption by the observation deadline", () =>
    Effect.gen(function* () {
      const fetcher: Fetcher = async (url) =>
        String(url) === tarball ? new Response(new ReadableStream()) : metadata();
      const failure = yield* advance(
        Effect.flip(withFetch(verifyNpmDownload(input, { timeoutMs: 10 }), fetcher)),
        20,
      );
      expect(failure).toBeInstanceOf(PublicationReadbackTimeout);
    }),
  );
});

describe("npm publication observations", () => {
  it.effect("requests revalidation of cached metadata before accepting publication facts", () =>
    Effect.gen(function* () {
      const result = yield* withFetch(
        readNpmPublication("@agentxm/new-capability", "1.2.3"),
        async (url, init) => {
          expect(new URL(String(url)).searchParams.get("write")).toBe("true");
          expect(new Headers(init?.headers).get("cache-control")).toBe("no-cache");
          return Response.json({
            "dist-tags": { latest: "1.2.3" },
            versions: { "1.2.3": { dist: { integrity } } },
          });
        },
      );
      expect(result).toEqual({ packageExists: true, latest: "1.2.3", integrity });
    }),
  );

  it.effect("distinguishes a new package from a new version of an initialized package", () =>
    Effect.gen(function* () {
      expect(
        yield* withFetch(
          readNpmPublication("@agentxm/new-capability", "1.2.3"),
          async () => new Response(null, { status: 404 }),
        ),
      ).toEqual({ packageExists: false, latest: null, integrity: null });
      expect(
        yield* withFetch(readNpmPublication("axm.sh", "1.2.3"), async () =>
          Response.json({ "dist-tags": { latest: "1.2.4" }, versions: {} }),
        ),
      ).toEqual({ packageExists: true, latest: "1.2.4", integrity: null });
    }),
  );

  it.effect.each([401, 403, 429, 503])("does not interpret HTTP %i as absence", (status) =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        withFetch(
          readNpmPublication("axm.sh", "1.2.3"),
          async () => new Response(null, { status }),
        ),
      );
      expect(failure).toMatchObject({ _tag: "PublicationHttpError", status });
    }),
  );

  it.effect("decodes the selected version and rejects an invalid published descriptor", () =>
    Effect.gen(function* () {
      const failed = yield* Effect.flip(
        withFetch(readNpmPublication("axm.sh", "1.2.3"), async () =>
          Response.json({ "dist-tags": { latest: "1.2.4" }, versions: { "1.2.3": {} } }),
        ),
      );
      expect(failed._tag).toBe("SchemaError");
      expect(
        yield* withFetch(readNpmPublication("axm.sh", "1.2.3"), async () =>
          Response.json({
            "dist-tags": { latest: "1.2.4" },
            versions: { "0.1.0": {}, "1.2.3": { dist: { integrity } } },
          }),
        ),
      ).toEqual({ packageExists: true, latest: "1.2.4", integrity });
    }),
  );

  it.effect("reads the exact dist tag and preserves package absence", () =>
    Effect.gen(function* () {
      expect(
        yield* withFetch(readNpmDistTag("axm.sh", "preview"), async () =>
          Response.json({
            "dist-tags": { latest: "1.2.4", preview: "1.3.0-preview.4" },
            versions: {},
          }),
        ),
      ).toBe("1.3.0-preview.4");
      expect(
        yield* withFetch(
          readNpmDistTag("axm.sh", "preview"),
          async () => new Response(null, { status: 404 }),
        ),
      ).toBeNull();
    }),
  );
});

describe("npm cohort initialization", () => {
  it.effect(
    "reports every missing package while accepting an initialized package without latest",
    () =>
      Effect.gen(function* () {
        const requests: string[] = [];
        const failure = yield* Effect.flip(
          withFetch(
            requireInitializedNpmPackages(["@agentxm/first", "@agentxm/ready", "@agentxm/second"]),
            async (url) => {
              requests.push(String(url));
              return new URL(String(url)).pathname.endsWith("%2Fready")
                ? Response.json({ "dist-tags": {}, versions: { "0.1.0": {} } })
                : new Response(null, { status: 404 });
            },
          ),
        );
        expect(failure).toMatchObject({
          _tag: "NpmPackagesUninitialized",
          packages: ["@agentxm/first", "@agentxm/second"],
        });
        expect(requests).toEqual(
          ["first", "ready", "second"].map(
            (name) => `https://registry.npmjs.org/%40agentxm%2F${name}?write=true`,
          ),
        );
      }),
  );

  it.effect("accepts existing packages before their next version is published", () =>
    withFetch(requireInitializedNpmPackages(["@agentxm/ready"]), async () =>
      Response.json({ "dist-tags": { latest: "0.1.0" }, versions: { "0.1.0": {} } }),
    ),
  );

  it.effect.each([401, 403, 429, 503])(
    "preserves HTTP %i as a failed query instead of claiming absence",
    (status) =>
      Effect.gen(function* () {
        const failure = yield* Effect.flip(
          withFetch(
            requireInitializedNpmPackages(["@agentxm/ready"]),
            async () => new Response(null, { status }),
          ),
        );
        expect(failure).toMatchObject({
          _tag: "NpmPackageQueryFailed",
          packageName: "@agentxm/ready",
          cause: { status },
        });
      }),
  );

  it.effect("rejects an invalid registry response", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        withFetch(
          requireInitializedNpmPackages(["@agentxm/ready"]),
          async () => new Response("{}"),
        ),
      );
      expect(failure._tag).toBe("NpmPackageQueryFailed");
    }),
  );

  it.effect("cancels the pending registry read when preparation is interrupted", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const aborted = yield* Deferred.make<void>();
      const read = yield* withFetch(
        requireInitializedNpmPackages(["@agentxm/ready"]),
        (_url, options) =>
          new Promise<Response>((_resolve, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => {
                Deferred.doneUnsafe(aborted, Effect.void);
                reject(new DOMException("Registry read aborted", "AbortError"));
              },
              { once: true },
            );
            Deferred.doneUnsafe(started, Effect.void);
          }),
      ).pipe(Effect.forkChild);
      yield* Deferred.await(started);
      yield* Fiber.interrupt(read);
      yield* Deferred.await(aborted);
    }),
  );
});

describe("npm stable tag reconciliation", () => {
  it.effect("does not write when latest already names the exact version", () =>
    Effect.gen(function* () {
      const promote = vi.fn();
      expect(
        yield* reconcileNpmStableTag({
          name: "axm.sh",
          version: "1.2.3",
          read: Effect.succeed("1.2.3"),
          promote: Effect.sync(promote),
        }),
      ).toBe("already-current");
      expect(promote).not.toHaveBeenCalled();
    }),
  );

  it.effect("repairs an older latest tag and confirms exact bounded readback", () =>
    Effect.gen(function* () {
      const observations = ["1.2.2", "1.2.2", "1.2.3"];
      const promote = vi.fn();
      expect(
        yield* advance(
          reconcileNpmStableTag({
            name: "axm.sh",
            version: "1.2.3",
            read: Effect.sync(() => observations.shift() ?? "1.2.3"),
            promote: Effect.sync(promote),
            observation: boundedObservation(),
          }),
        ),
      ).toBe("promoted");
      expect(promote).toHaveBeenCalledOnce();
    }),
  );

  it.effect("refuses to move latest backward when a newer release is visible", () =>
    Effect.gen(function* () {
      const promote = vi.fn();
      expect(
        yield* Effect.flip(
          reconcileNpmStableTag({
            name: "axm.sh",
            version: "1.2.3",
            read: Effect.succeed("1.2.4"),
            promote: Effect.sync(promote),
          }),
        ),
      ).toBeInstanceOf(SupersededRelease);
      expect(promote).not.toHaveBeenCalled();
    }),
  );

  it.effect("accepts a failed submission when readback proves the tag moved", () =>
    Effect.gen(function* () {
      const observations = ["1.2.2", "1.2.3"];
      expect(
        yield* reconcileNpmStableTag({
          name: "axm.sh",
          version: "1.2.3",
          read: Effect.sync(() => observations.shift() ?? "1.2.3"),
          promote: Effect.fail(new ReleaseBoundaryFailed({ cause: new Error("connection reset") })),
        }),
      ).toBe("promoted");
    }),
  );
});
