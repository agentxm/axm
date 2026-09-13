import { UpdateCheckCache } from "../../application/index.js";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { makeUpdateCheckCache } from "../../adapters/native/update-cache/index.js";

export const makeUpdateCheckCacheLayer = (cachePath: string) =>
  Layer.effect(
    UpdateCheckCache,
    Effect.gen(function* () {
      return makeUpdateCheckCache(cachePath, yield* FileSystem.FileSystem, yield* Path.Path);
    }),
  );
