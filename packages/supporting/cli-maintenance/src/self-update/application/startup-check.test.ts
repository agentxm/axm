import { describe, expect, it } from "@effect/vitest";
import { decodeStableChannelDocumentSync } from "@agentxm/extension-model/unstable/release-channel";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";
import type { CachedStableChannel } from "../domain/index.js";
import { stableChannelDocument } from "../testing.js";
import { checkStartupUpdate, refreshStartupUpdate } from "./startup-check.js";
import { StableChannelCheck, UpdateCheckCache, UpdateCheckUnavailable } from "./update-cache.js";

const document = decodeStableChannelDocumentSync(stableChannelDocument("2.0.0"));
const context = {
  isJsonOutput: false,
  noUpdateCheckEnv: false,
  isUpgradeCommand: false,
  isNonInteractive: false,
  isStderrTTY: true,
  isAgentSession: false,
};
const unexpected = () => Effect.die("suppressed or fresh checks must not perform this operation");

describe("startup application without a delivery or provider", () => {
  it.effect("unavailable cache reads and writes do not fail the invoking command", () =>
    Effect.gen(function* () {
      const attemptedWrite = yield* Deferred.make<CachedStableChannel>();
      const result = yield* Effect.scoped(
        Effect.gen(function* () {
          const checked = yield* checkStartupUpdate({ localVersion: "1.0.0", context });
          expect(checked).toEqual({
            _tag: "Checked",
            refreshing: true,
            notification: Option.none(),
          });
          const attempted = yield* Deferred.await(attemptedWrite);
          expect(attempted.document).toBe(document);
          expect(attempted.etag).toBe('"new-revision"');
          return "command completed";
        }),
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(UpdateCheckCache, {
              read: () => Effect.fail(new UpdateCheckUnavailable({ operation: "cache-read" })),
              write: (cache) =>
                Deferred.succeed(attemptedWrite, cache).pipe(
                  Effect.andThen(
                    Effect.fail(new UpdateCheckUnavailable({ operation: "cache-write" })),
                  ),
                ),
            }),
            Layer.succeed(StableChannelCheck, {
              check: () => Effect.succeed({ _tag: "Modified", document, etag: '"new-revision"' }),
            }),
          ),
        ),
      );
      expect(result).toBe("command completed");
    }),
  );

  it.effect("suppression precedes every cache and channel operation", () =>
    checkStartupUpdate({
      localVersion: "1.0.0",
      context: { ...context, noUpdateCheckEnv: true },
    }).pipe(
      Effect.tap((result) => Effect.sync(() => expect(result).toEqual({ _tag: "Skipped" }))),
      Effect.scoped,
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(UpdateCheckCache, { read: unexpected, write: unexpected }),
          Layer.succeed(StableChannelCheck, { check: unexpected }),
        ),
      ),
    ),
  );

  it.effect("reads one fresh snapshot and returns facts without CLI wording", () =>
    Effect.gen(function* () {
      const reads = yield* Ref.make(0);
      const snapshot = { document, etag: '"revision-3"', validatedAt: yield* DateTime.now };
      const result = yield* checkStartupUpdate({ localVersion: "1.0.0", context }).pipe(
        Effect.scoped,
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(UpdateCheckCache, {
              read: () =>
                Ref.update(reads, (count) => count + 1).pipe(Effect.as(Option.some(snapshot))),
              write: unexpected,
            }),
            Layer.succeed(StableChannelCheck, { check: unexpected }),
          ),
        ),
      );
      expect(result).toEqual({
        _tag: "Checked",
        refreshing: false,
        notification: Option.some({ current: "1.0.0", latest: "2.0.0" }),
      });
      expect(yield* Ref.get(reads)).toBe(1);
    }),
  );

  it.effect("revalidates the observed snapshot and stamps the confirmation time", () =>
    Effect.gen(function* () {
      const now = yield* DateTime.now;
      const snapshot = {
        document,
        etag: '"revision-3"',
        validatedAt: DateTime.subtractDuration(now, Duration.minutes(61)),
      };
      const written = yield* Deferred.make<CachedStableChannel>();
      const etag = yield* Ref.make<string | null>(null);
      yield* Effect.scoped(
        Effect.gen(function* () {
          const result = yield* checkStartupUpdate({ localVersion: "1.0.0", context });
          expect(result).toEqual({
            _tag: "Checked",
            refreshing: true,
            notification: Option.none(),
          });
          const cache = yield* Deferred.await(written);
          expect(cache.document).toBe(document);
          expect(cache.etag).toBe(snapshot.etag);
          expect(DateTime.toEpochMillis(cache.validatedAt)).toBe(DateTime.toEpochMillis(now));
          expect(yield* Ref.get(etag)).toBe(snapshot.etag);
        }),
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(UpdateCheckCache, {
              read: () => Effect.succeed(Option.some(snapshot)),
              write: (cache) => Deferred.succeed(written, cache).pipe(Effect.asVoid),
            }),
            Layer.succeed(StableChannelCheck, {
              check: (value) =>
                Ref.set(etag, value).pipe(Effect.as({ _tag: "NotModified" as const })),
            }),
          ),
        ),
      );
    }),
  );

  it.effect("a refused or malformed refresh preserves existing cache contents", () =>
    Effect.gen(function* () {
      const snapshot = { document, etag: '"revision-3"', validatedAt: yield* DateTime.now };
      for (const operation of ["channel-query", "channel-decode"] as const) {
        yield* refreshStartupUpdate(Option.some(snapshot)).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(UpdateCheckCache, { read: unexpected, write: unexpected }),
              Layer.succeed(StableChannelCheck, {
                check: () => Effect.fail(new UpdateCheckUnavailable({ operation })),
              }),
            ),
          ),
        );
      }
    }),
  );

  it.effect("bounds a hanging refresh and interrupts its provider", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const finished = yield* Deferred.make<void>();
      const fiber = yield* refreshStartupUpdate(Option.none()).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(UpdateCheckCache, { read: unexpected, write: unexpected }),
            Layer.succeed(StableChannelCheck, {
              check: () =>
                Deferred.succeed(started, undefined).pipe(
                  Effect.andThen(Effect.never),
                  Effect.ensuring(Deferred.succeed(finished, undefined)),
                ),
            }),
          ),
        ),
        Effect.forkChild,
      );
      yield* Deferred.await(started);
      yield* TestClock.adjust("3 seconds");
      yield* Fiber.join(fiber);
      expect(yield* Deferred.isDone(finished)).toBe(true);
    }),
  );

  it.effect("command-scope closure cancels a refresh before its timeout", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const finished = yield* Deferred.make<void>();
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* checkStartupUpdate({ localVersion: "1.0.0", context });
          yield* Deferred.await(started);
        }),
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(UpdateCheckCache, {
              read: () => Effect.succeed(Option.none()),
              write: unexpected,
            }),
            Layer.succeed(StableChannelCheck, {
              check: () =>
                Deferred.succeed(started, undefined).pipe(
                  Effect.andThen(Effect.never),
                  Effect.ensuring(Deferred.succeed(finished, undefined)),
                ),
            }),
          ),
        ),
      );
      expect(yield* Deferred.isDone(finished)).toBe(true);
    }),
  );
});
