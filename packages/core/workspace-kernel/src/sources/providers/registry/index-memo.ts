import { annotateWork, withWork } from "@agentxm/host-primitives/work-observation";
import {
  parseRegistryEndpoint,
  type RegistryEndpoint,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import * as Cache from "effect/Cache";
import type * as Config from "effect/Config";
import * as ServiceMap from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as MutableHashMap from "effect/MutableHashMap";
import * as Exit from "effect/Exit";
import * as Result from "effect/Result";
import * as Request from "effect/Request";
import * as RequestResolver from "effect/RequestResolver";

import {
  RegistryClientFactory,
  RegistryRequestFailed,
  type GetExtensionIndexArgs,
  type RegistryClientFailure,
} from "@agentxm/registry-client";
import type { ExtensionIndex } from "@agentxm/registry-protocol/unstable/registry";
import * as Option from "effect/Option";

/** Planning can inspect the same identity under several independent constraints. */
const MAX_PACK_INDEX_MEMO_ENTRIES = 256;

/** Diagnostic state belongs to the requester that actually starts a cache lookup. */
const CurrentRegistryIndexRequest = ServiceMap.Reference<{ executed: boolean } | undefined>(
  "@agentxm/workspace-kernel/sources/registry-index-memo/CurrentRegistryIndexRequest",
  { defaultValue: () => undefined },
);

class RegistryIndexKey extends Data.Class<
  GetExtensionIndexArgs & { readonly location: string; readonly sourceName: string }
> {}

interface RegistryIndexRequest extends Request.Request<
  Option.Option<ExtensionIndex>,
  RegistryClientFailure | Config.ConfigError
> {
  readonly _tag: "RegistryIndexRequest";
  readonly key: RegistryIndexKey;
}

const RegistryIndexRequest = Request.tagged<RegistryIndexRequest>("RegistryIndexRequest");

export interface RegistryIndexMemoService {
  readonly get: (
    endpoint: RegistryEndpoint,
    sourceName: string,
    args: GetExtensionIndexArgs,
  ) => Effect.Effect<Option.Option<ExtensionIndex>, RegistryClientFailure | Config.ConfigError>;
}

/** Provided for one pack-planning phase; no result survives that phase. */
export class RegistryIndexMemo extends ServiceMap.Service<
  RegistryIndexMemo,
  RegistryIndexMemoService
>()("@agentxm/workspace-kernel/sources/registry-index-memo/RegistryIndexMemo") {}

export const makeRegistryIndexMemo = <R>(
  lookup: (
    key: RegistryIndexKey,
  ) => Effect.Effect<Option.Option<ExtensionIndex>, RegistryClientFailure | Config.ConfigError, R>,
): Effect.Effect<RegistryIndexMemoService, never, R> =>
  Cache.makeWith(
    (key: RegistryIndexKey) => {
      const work = lookup(key);
      return Effect.contextWith((context: ServiceMap.Context<never>) => {
        const request = ServiceMap.get(context, CurrentRegistryIndexRequest);
        if (request !== undefined) request.executed = true;
        return work;
      });
    },
    {
      capacity: MAX_PACK_INDEX_MEMO_ENTRIES,
      timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
    },
  ).pipe(
    Effect.map(
      (cache) =>
        ({
          get: (endpoint, sourceName, args) =>
            Effect.gen(function* () {
              const key = new RegistryIndexKey({ location: endpoint.href, sourceName, ...args });
              return yield* Effect.gen(function* () {
                // This cache retains only successful results indefinitely. Failed
                // lookups are removed immediately; observing its public entry map
                // neither performs another lookup nor changes the sharing policy.
                const entry = MutableHashMap.get(cache.map, key);
                const outcome = Option.isNone(entry)
                  ? "miss"
                  : entry.value.fiber.pollUnsafe() === undefined
                    ? "coalesced"
                    : "hit";
                const request = { executed: false };
                yield* annotateWork({
                  "axm.cache.outcome": outcome,
                  "axm.work.executed": 0,
                  "axm.work.reused-count": 0,
                });
                return yield* Cache.get(cache, key).pipe(
                  Effect.provideService(CurrentRegistryIndexRequest, request),
                  Effect.onExit((exit) =>
                    // The map snapshot can become stale before Cache.get runs.
                    // Only the source actually started by this requester is work;
                    // only a delivered result from another source is reuse.
                    annotateWork({
                      "axm.cache.outcome": request.executed
                        ? "miss"
                        : outcome === "miss"
                          ? "coalesced"
                          : outcome,
                      "axm.work.executed": request.executed ? 1 : 0,
                      "axm.work.reused-count":
                        !request.executed && !Exit.hasInterrupts(exit) ? 1 : 0,
                    }),
                  ),
                );
              });
            }).pipe((effect) =>
              withWork("axm.registry.metadata-reuse", effect, {
                attributes: { "axm.work.requested": 1 },
              }),
            ),
        }) satisfies RegistryIndexMemoService,
    ),
  );

export const makeLiveRegistryIndexMemo = (): Effect.Effect<
  RegistryIndexMemoService,
  never,
  RegistryClientFactory
> =>
  Effect.gen(function* () {
    const registryClients = yield* RegistryClientFactory;
    const resolver = RequestResolver.makeWith<RegistryIndexRequest>({
      batchKey: ({ request }) => `${request.key.location}\0${request.key.sourceName}`,
      delay: Effect.yieldNow,
      collectWhile: (entries) => entries.size < 100,
      runAll: (entries) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan("axm.batch.count", entries.length);
          const first = entries[0].request.key;
          const run = Effect.gen(function* () {
            // The key holds the canonical endpoint text, which decodes back to
            // exactly the endpoint it was made from.
            const endpoint = parseRegistryEndpoint(first.location);
            if (Result.isFailure(endpoint)) {
              return yield* new RegistryRequestFailed({
                category: "internal",
                detail: endpoint.failure.message,
              });
            }
            const client = yield* registryClients.forEndpoint(endpoint.success);
            return yield* client.selectMany(
              entries.map(({ request }) => ({
                owner: request.key.owner,
                type: request.key.type,
                name: request.key.name,
              })),
            );
          });
          const result = yield* Effect.exit(run);
          if (Exit.isFailure(result)) yield* Effect.annotateCurrentSpan("axm.outcome", "failure");
          for (const [index, entry] of entries.entries()) {
            if (Exit.isFailure(result)) {
              entry.completeUnsafe(Exit.failCause(result.cause));
              continue;
            }
            const value = result.value[index];
            entry.completeUnsafe(
              value === undefined
                ? Exit.fail(
                    new RegistryRequestFailed({
                      category: "internal",
                      detail: "Registry batch result is missing.",
                    }),
                  )
                : Result.isFailure(value)
                  ? Exit.fail(value.failure)
                  : Exit.succeed(value.success),
            );
          }
        }).pipe(Effect.withSpan("axm.registry.metadata-batch")),
    });
    return yield* makeRegistryIndexMemo((key) =>
      Effect.request(RegistryIndexRequest({ key }), resolver),
    );
  });

export const withPackRegistryIndexMemo = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | RegistryClientFactory> =>
  Effect.flatMap(makeLiveRegistryIndexMemo(), (memo) =>
    Effect.provideService(effect, RegistryIndexMemo, memo),
  );
