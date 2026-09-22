import * as Cache from "effect/Cache";
import * as ServiceMap from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Request from "effect/Request";
import * as RequestResolver from "effect/RequestResolver";
import * as Schema from "effect/Schema";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as HttpClient from "effect/unstable/http/HttpClient";

import {
  createRegistryClient,
  RegistryRequestFailed,
  type GetExtensionIndexArgs,
  type RegistryClientFailure,
} from "@agentxm/registry-client";
import {
  ExtensionIndexSchema,
  type ExtensionIndex,
} from "@agentxm/registry-protocol/unstable/registry";
import type { ResolutionMetadataOutcome } from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import * as Option from "effect/Option";

/** Planning can inspect the same identity under several independent constraints. */
export const MAX_PACK_INDEX_MEMO_ENTRIES = 256;

class RegistryIndexKey extends Data.Class<
  GetExtensionIndexArgs & { readonly location: string; readonly sourceName: string }
> {}

interface RegistryIndexRequest extends Request.Request<
  Option.Option<ExtensionIndex>,
  RegistryClientFailure
> {
  readonly _tag: "RegistryIndexRequest";
  readonly key: RegistryIndexKey;
}

const RegistryIndexRequest = Request.tagged<RegistryIndexRequest>("RegistryIndexRequest");

const indexFromMetadata = (
  key: RegistryIndexKey,
  outcome: ResolutionMetadataOutcome,
): Option.Option<ExtensionIndex> => {
  if (outcome.outcome === "unavailable") return Option.none();
  if (outcome.outcome !== "metadata") {
    throw new Error(`Registry batch metadata returned unexpected ${outcome.outcome} outcome.`);
  }
  const page = outcome.page;
  return Option.some(
    Schema.decodeUnknownSync(Schema.toType(ExtensionIndexSchema))({
      owner: key.owner,
      type: key.type,
      name: key.name,
      publisherBindingId: page.publisherBindingId,
      visibility: page.visibility,
      archival: page.archival,
      deprecation: page.deprecation,
      ...(page.description == null ? {} : { description: page.description }),
      ...(page.repository == null ? {} : { repository: page.repository }),
      ...(page.bugs == null ? {} : { bugs: page.bugs }),
      ...(page.license == null ? {} : { license: page.license }),
      ...(page.authors == null ? {} : { authors: page.authors }),
      versions: page.versions,
    }),
  );
};

export interface RegistryIndexMemoService {
  readonly get: (
    location: string,
    sourceName: string,
    args: GetExtensionIndexArgs,
  ) => Effect.Effect<Option.Option<ExtensionIndex>, RegistryClientFailure>;
}

/** Provided for one pack-planning phase; no result survives that phase. */
export class RegistryIndexMemo extends ServiceMap.Service<
  RegistryIndexMemo,
  RegistryIndexMemoService
>()("@agentxm/workspace/resolution/registry-index-memo/RegistryIndexMemo") {}

export const makeRegistryIndexMemo = <R>(
  lookup: (
    key: RegistryIndexKey,
  ) => Effect.Effect<Option.Option<ExtensionIndex>, RegistryClientFailure, R>,
): Effect.Effect<RegistryIndexMemoService, never, R> =>
  Cache.makeWith(lookup, {
    capacity: MAX_PACK_INDEX_MEMO_ENTRIES,
    timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
  }).pipe(
    Effect.map(
      (cache) =>
        ({
          get: (location, sourceName, args) =>
            Cache.get(cache, new RegistryIndexKey({ location, sourceName, ...args })),
        }) satisfies RegistryIndexMemoService,
    ),
  );

export const makeLiveRegistryIndexMemo = (): Effect.Effect<
  RegistryIndexMemoService,
  never,
  FileSystem.FileSystem | HttpClient.HttpClient | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const http = yield* HttpClient.HttpClient;
    const path = yield* Path.Path;
    const resolver = RequestResolver.makeWith<RegistryIndexRequest>({
      batchKey: ({ request }) => `${request.key.location}\0${request.key.sourceName}`,
      delay: Effect.yieldNow,
      collectWhile: (entries) => entries.size < 100,
      runAll: (entries) =>
        Effect.gen(function* () {
          const first = entries[0].request.key;
          const run = Effect.gen(function* () {
            const client = yield* createRegistryClient(first.location).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(HttpClient.HttpClient, http),
              Effect.provideService(Path.Path, path),
            );
            if (client.getResolutionMetadata === undefined) {
              return yield* Effect.forEach(entries, ({ request }) =>
                client.getExtensionIndex(request.key),
              );
            }
            const results = yield* client.getResolutionMetadata({
              schemaVersion: 1,
              selectionPolicyVersion: "1",
              items: entries.map(({ request }, index) => ({
                key: String(index),
                purpose: "select" as const,
                identity: {
                  owner: request.key.owner,
                  type: request.key.type,
                  name: request.key.name,
                },
              })),
            });
            return yield* Effect.try({
              try: () =>
                entries.map(({ request }, index) => {
                  const outcome = results[index];
                  if (outcome === undefined) throw new Error("Registry batch result is missing.");
                  return indexFromMetadata(request.key, outcome);
                }),
              catch: (cause) =>
                new RegistryRequestFailed({
                  category: "internal",
                  detail: "Registry batch metadata could not be used for index selection.",
                  cause,
                }),
            });
          });
          const result = yield* Effect.exit(run);
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
                : Exit.succeed(value),
            );
          }
        }),
    });
    return yield* makeRegistryIndexMemo((key) =>
      Effect.request(RegistryIndexRequest({ key }), resolver),
    );
  });

export const withPackRegistryIndexMemo = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | FileSystem.FileSystem | HttpClient.HttpClient | Path.Path> =>
  Effect.flatMap(makeLiveRegistryIndexMemo(), (memo) =>
    Effect.provideService(effect, RegistryIndexMemo, memo),
  );
