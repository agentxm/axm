import { chunksOf } from "effect/Array";
import { MAX_RESOLUTION_ITEMS } from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
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
import * as Deferred from "effect/Deferred";
import type * as Scope from "effect/Scope";
import * as Fiber from "effect/Fiber";
import * as MutableHashMap from "effect/MutableHashMap";
import * as Exit from "effect/Exit";
import * as Result from "effect/Result";
import * as Request from "effect/Request";
import * as RequestResolver from "effect/RequestResolver";

import type { RegistryAuthorityContext } from "./registry-transport.js";
import { RegistryRequestFailed, type RegistryClientFailure } from "./errors.js";
import type { RegistryClient, GetExtensionIndexArgs } from "./client.js";
import type { ExtensionIndex } from "@agentxm/registry-protocol/unstable/registry";
import * as Option from "effect/Option";

/** Planning can inspect the same identity under several independent constraints. */
const MAX_METADATA_ENTRIES = 256;

/** Diagnostic state belongs to the requester that actually starts a cache lookup. */
const CurrentRegistryIndexRequest = ServiceMap.Reference<{ executed: boolean } | undefined>(
  "@agentxm/registry-client/read-phase/CurrentRegistryIndexRequest",
  { defaultValue: () => undefined },
);

class RegistryIndexKey extends Data.Class<
  GetExtensionIndexArgs & {
    readonly location: string;
    readonly authority: RegistryAuthorityContext;
    readonly policy: string;
  }
> {}

interface RegistryIndexRequest extends Request.Request<
  Option.Option<ExtensionIndex>,
  RegistryClientFailure | Config.ConfigError
> {
  readonly _tag: "RegistryIndexRequest";
  readonly key: RegistryIndexKey;
  readonly abandoned: Deferred.Deferred<void>;
}

const RegistryIndexRequest = Request.tagged<RegistryIndexRequest>("RegistryIndexRequest");

export interface RegistryReadPhaseService {
  readonly clear: Effect.Effect<void>;
  readonly getMany: (
    endpoint: RegistryEndpoint,
    args: ReadonlyArray<GetExtensionIndexArgs>,
    policy?: string,
  ) => Effect.Effect<
    ReadonlyArray<
      Result.Result<Option.Option<ExtensionIndex>, RegistryClientFailure | Config.ConfigError>
    >,
    RegistryClientFailure
  >;

  readonly get: (
    endpoint: RegistryEndpoint,
    args: GetExtensionIndexArgs,
    policy?: string,
  ) => Effect.Effect<Option.Option<ExtensionIndex>, RegistryClientFailure | Config.ConfigError>;
}

export const makeRegistryReadPhase = <R>(
  authorityContext: (
    endpoint: RegistryEndpoint,
  ) => Effect.Effect<RegistryAuthorityContext, RegistryClientFailure>,
  lookup: (
    key: RegistryIndexKey,
  ) => Effect.Effect<Option.Option<ExtensionIndex>, RegistryClientFailure | Config.ConfigError, R>,
): Effect.Effect<RegistryReadPhaseService, never, R> =>
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
      capacity: MAX_METADATA_ENTRIES,
      timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
    },
  ).pipe(
    Effect.map((cache) => {
      const get = (
        endpoint: RegistryEndpoint,
        args: GetExtensionIndexArgs,
        policy = "default",
        initialAuthority?: RegistryAuthorityContext,
      ) =>
        Effect.gen(function* () {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            const authority =
              attempt === 0 && initialAuthority !== undefined
                ? initialAuthority
                : yield* authorityContext(endpoint);
            const key = new RegistryIndexKey({
              location: endpoint.href,
              authority,
              policy,
              ...args,
            });
            const result = yield* Effect.result(
              Effect.gen(function* () {
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
              }).pipe((effect) =>
                withWork("axm.registry.metadata-reuse", effect, {
                  attributes: { "axm.work.requested": 1 },
                }),
              ),
            );
            const current = yield* authorityContext(endpoint);
            if (current.id === authority.id && current.generation === authority.generation)
              return yield* Result.isFailure(result)
                ? Effect.fail(result.failure)
                : Effect.succeed(result.success);
          }
          return yield* new RegistryRequestFailed({
            category: "conflict",
            detail: "Registry credentials changed repeatedly during metadata selection.",
          });
        });
      return {
        clear: Cache.invalidateAll(cache),
        get,
        getMany: (endpoint, args, policy) =>
          Effect.gen(function* () {
            if (args.length === 0) return [];
            const authority = yield* authorityContext(endpoint);
            return (yield* Effect.forEach(chunksOf(args, MAX_RESOLUTION_ITEMS), (batch) =>
              Effect.forEach(
                batch,
                (identity) => Effect.result(get(endpoint, identity, policy, authority)),
                { concurrency: batch.length },
              ),
            )).flat();
          }),
      } satisfies RegistryReadPhaseService;
    }),
  );

export const makeLiveRegistryReadPhase = (
  authorityContext: (
    endpoint: RegistryEndpoint,
  ) => Effect.Effect<RegistryAuthorityContext, RegistryClientFailure>,
  forEndpoint: (
    endpoint: RegistryEndpoint,
    policy: string,
  ) => Effect.Effect<RegistryClient, Config.ConfigError>,
  scope: Scope.Scope,
): Effect.Effect<RegistryReadPhaseService> =>
  Effect.gen(function* () {
    const resolver = RequestResolver.makeWith<RegistryIndexRequest>({
      batchKey: ({ request }) =>
        JSON.stringify([
          request.key.location,
          request.key.authority.id,
          request.key.authority.generation,
          request.key.policy,
        ]),
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
            const client = yield* forEndpoint(endpoint.success, first.policy);
            return yield* client.selectMany(
              entries.map(({ request }) => ({
                owner: request.key.owner,
                type: request.key.type,
                name: request.key.name,
              })),
            );
          });
          // RequestResolver releases its pending batch before transport starts.
          // Own running-batch cancellation explicitly: a shared exchange remains
          // useful until every cache lookup in this batch has been abandoned.
          const allAbandoned = Effect.all(
            entries.map(({ request }) => Deferred.await(request.abandoned)),
            // At most 100 in-memory signals, bounded by collectWhile above.
            { concurrency: entries.length },
          ).pipe(Effect.andThen(Effect.interrupt));
          const result = yield* Effect.exit(Effect.raceFirst(run, allAbandoned));
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
        }).pipe(
          Effect.withSpan("axm.registry.metadata-batch"),
          Effect.forkIn(scope),
          Effect.flatMap(Fiber.join),
        ),
    });
    return yield* makeRegistryReadPhase(authorityContext, (key) =>
      Effect.gen(function* () {
        const abandoned = yield* Deferred.make<void>();
        return yield* Effect.request(RegistryIndexRequest({ key, abandoned }), resolver).pipe(
          Effect.onInterrupt(() => Deferred.succeed(abandoned, undefined)),
        );
      }),
    );
  });
