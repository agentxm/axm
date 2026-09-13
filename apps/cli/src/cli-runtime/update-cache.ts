import { makeUpdateCheckCacheLayer } from "@agentxm/cli-maintenance/self-update/composition/native";
import { resolveAxmCacheRoot } from "@agentxm/registry-client";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

/** CLI composition selects the user's cache file for the native cache adapter. */
export const UpdateCheckCacheLive = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const cacheRoot = yield* resolveAxmCacheRoot();
    return makeUpdateCheckCacheLayer(path.join(cacheRoot, "update-check.json"));
  }),
);
