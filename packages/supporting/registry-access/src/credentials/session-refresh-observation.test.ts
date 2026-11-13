import { expect, it } from "@effect/vitest";
import * as TestClock from "effect/testing/TestClock";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions/handle";
import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { TokenExchangeTest } from "../authentication/auth-client.js";
import { recordTrace } from "../test-support/test-helpers.js";
import { CredentialStoreTest } from "./credential-store.js";
import { SessionRefresher, SessionRefresherLive } from "./session-refresh.js";
import { CredentialStoreTokenSource } from "./schema.js";

it.effect.each(["queued", "admitted"] as const)(
  "separates %s cancellation from exchange and reused session",
  (boundary) =>
    Effect.gen(function* () {
      const endpoint = decodeHttpRegistryEndpointSync("https://registry.example.test");
      const expires = DateTime.makeUnsafe("1970-01-01T00:02:00.000Z");
      const held = new CredentialStoreTokenSource({
        token: "PRIVATE_ACCESS",
        refresh_token: "PRIVATE_REFRESH",
        expires_at: expires,
        endpoint,
      });
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const waiting = yield* Deferred.make<void>();
      let lockWaits = 0;
      let exchanges = 0;
      let cancelWaiter: (() => void) | undefined;
      const trace = recordTrace((span) => {
        if (span.name === "axm.wait.session-refresh" && ++lockWaits === 2) {
          if (boundary === "admitted") {
            const end = span.end.bind(span);
            span.end = (time, exit) => {
              end(time, exit);
              cancelWaiter?.();
            };
          }
          Deferred.doneUnsafe(waiting, Effect.void);
        }
      });
      const layer = SessionRefresherLive.pipe(
        Layer.provide(
          Layer.merge(
            CredentialStoreTest("restricted-file", {
              version: 1,
              registries: {
                [endpoint.href]: {
                  accounts: {
                    [normalizeHandle("@fixture")]: {
                      access_token: held.token,
                      refresh_token: held.refresh_token,
                      expires_at: expires,
                      active: true,
                    },
                  },
                },
              },
            }),
            TokenExchangeTest({
              refreshToken: () =>
                Effect.gen(function* () {
                  exchanges += 1;
                  yield* Deferred.succeed(started, undefined);
                  yield* Deferred.await(release);
                  return {
                    access_token: "PRIVATE_NEW",
                    refresh_token: "PRIVATE_NEW_REFRESH",
                    expires_at: DateTime.add(expires, { hours: 1 }),
                  };
                }),
            }),
          ),
        ),
      );
      yield* Effect.gen(function* () {
        const refresher = yield* SessionRefresher;
        const holder = yield* refresher.renew(held).pipe(Effect.forkChild);
        yield* Deferred.await(started);
        const waiter = yield* Effect.withFiber((fiber) => {
          cancelWaiter = () => fiber.interruptUnsafe();
          return refresher.renew(held);
        }).pipe(Effect.forkChild({ startImmediately: true }));
        yield* Deferred.await(waiting);
        if (boundary === "queued") yield* Fiber.interrupt(waiter);
        const probe =
          boundary === "admitted"
            ? yield* refresher
                .renew(held)
                .pipe(Effect.timeout("1 second"), Effect.forkChild({ startImmediately: true }))
            : undefined;
        expect(exchanges).toBe(1);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(holder);
        expect(Exit.hasInterrupts(yield* Fiber.await(waiter))).toBe(true);
        if (probe !== undefined) {
          yield* TestClock.adjust("1 second");
          expect(Exit.isSuccess(yield* Fiber.await(probe))).toBe(true);
        }
        yield* refresher.renew(held);
      }).pipe(
        Effect.provide(layer),
        Effect.withTracer(trace.tracer),
        Effect.withTracerEnabled(true),
      );
      const refreshes = trace.spans.filter((span) => span.name === "axm.auth.session-refresh");
      expect(refreshes).toHaveLength(boundary === "queued" ? 3 : 4);
      expect(
        refreshes.reduce(
          (count, span) => count + Number(span.attributes.get("axm.work.executed") ?? 0),
          0,
        ),
      ).toBe(exchanges);
      expect(
        refreshes.reduce(
          (count, span) => count + Number(span.attributes.get("axm.work.reused-count") ?? 0),
          0,
        ),
      ).toBe(boundary === "queued" ? 1 : 2);
      const waits = trace.spans.filter((span) => span.name === "axm.wait.session-refresh");
      expect(waits).toHaveLength(boundary === "queued" ? 2 : 3);
      expect(waits.map((span) => trace.endCounts.get(span.spanId))).toEqual(
        boundary === "queued" ? [1, 1] : [1, 1, 1],
      );
      expect(
        waits.filter(
          (span) => span.status._tag === "Ended" && Exit.hasInterrupts(span.status.exit),
        ),
      ).toHaveLength(boundary === "queued" ? 1 : 0);
      expect(
        JSON.stringify(trace.spans.map((span) => Object.fromEntries(span.attributes))),
      ).not.toContain("PRIVATE");
    }),
);
