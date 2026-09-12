import { UpdateCheckCache } from "@agentxm/cli-maintenance/self-update/application";
import { resolveAxmCacheRoot } from "@agentxm/registry-client";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { makeUpdateCheckCache } from "../adapters/update-cache/index.js";

export const makeUpdateCheckCacheLayer = (cachePath: string) =>
  Layer.effect(
    UpdateCheckCache,
    Effect.gen(function* () {
      return makeUpdateCheckCache(cachePath, yield* FileSystem.FileSystem, yield* Path.Path);
    }),
  );

export const UpdateCheckCacheLive = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const cacheRoot = yield* resolveAxmCacheRoot();
    return makeUpdateCheckCacheLayer(path.join(cacheRoot, "update-check.json"));
  }),
);
