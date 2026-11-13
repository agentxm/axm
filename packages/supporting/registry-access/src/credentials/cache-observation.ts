import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Cache from "effect/Cache";
import * as Exit from "effect/Exit";
import * as MutableHashMap from "effect/MutableHashMap";
import * as Option from "effect/Option";
import { annotateWork, withWork } from "@agentxm/host-primitives/work-observation";

// Cache merges the requesting fiber's context into its lookup. This observes the
// existing lookup without performing another storage read.
const LookupStarted = Context.Reference<() => void>(
  "@agentxm/registry-access/CredentialCacheLookupStarted",
  { defaultValue: () => () => undefined },
);

export const credentialCacheLookupStarted = Effect.flatMap(LookupStarted, (started) =>
  Effect.sync(started),
);

export const observeCredentialCache = <Key, A, E, R>(
  kind: "stored-session" | "workload",
  cache: Cache.Cache<Key, A, E, R>,
  key: Key,
) =>
  Effect.suspend(() => {
    // Cache.Entry is public Effect API. Inspect only its lookup fiber's state;
    // Cache.get still owns expiry, lookup, sharing, and invalidation. "Coalesced"
    // means a lookup was pending at admission. An actual new lookup wins as miss.
    const entry = MutableHashMap.get(cache.map, key);
    const pending = Option.isSome(entry) && entry.value.fiber.pollUnsafe() === undefined;
    let executed = false;
    return Cache.get(cache, key).pipe(
      Effect.provideService(LookupStarted, () => {
        executed = true;
      }),
      // Reuse counts a delivered cached Exit, including a cached failure. A
      // cancelled follower received neither outcome, so it is not counted reused.
      Effect.onExit((exit) =>
        annotateWork({
          "axm.cache.outcome": executed ? "miss" : pending ? "coalesced" : "hit",
          "axm.work.executed": executed ? 1 : 0,
          "axm.work.reused-count": !executed && !Exit.hasInterrupts(exit) ? 1 : 0,
          "axm.work.reused": !executed && !Exit.hasInterrupts(exit),
        }),
      ),
      (effect) =>
        withWork("axm.auth.cache", effect, {
          // A cancellation can arrive as observation starts, before get registers its
          // exit observer. Admission remains visible, with no delivered work yet.
          attributes: {
            "axm.auth.cache-kind": kind,
            "axm.cache.outcome": Option.isNone(entry) ? "miss" : pending ? "coalesced" : "hit",
            "axm.work.requested": 1,
            "axm.work.executed": 0,
            "axm.work.reused-count": 0,
            "axm.work.reused": false,
          },
        }),
    );
  });
