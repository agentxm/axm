import * as Cache from "effect/Cache";
import * as ServiceMap from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import {
  createRegistryClient,
  type GetExtensionIndexArgs,
  type RegistryClientFailure,
} from "@agentxm/registry-client";
import type { ExtensionIndex } from "@agentxm/registry-protocol/unstable/registry";
import type * as Option from "effect/Option";

/** Planning can inspect the same identity under several independent constraints. */
export const MAX_PACK_INDEX_MEMO_ENTRIES = 256;

class RegistryIndexKey extends Data.Class<
  GetExtensionIndexArgs & { readonly location: string; readonly sourceName: string }
> {}

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
  makeRegistryIndexMemo(({ location, owner, type, name }) =>
    Effect.flatMap(createRegistryClient(location), (client) =>
      client.getExtensionIndex({ owner, type, name }),
    ),
  );

export const withPackRegistryIndexMemo = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | FileSystem.FileSystem | HttpClient.HttpClient | Path.Path> =>
  Effect.flatMap(makeLiveRegistryIndexMemo(), (memo) =>
    Effect.provideService(effect, RegistryIndexMemo, memo),
  );
