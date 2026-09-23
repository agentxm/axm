import { describe, expect, it } from "@effect/vitest";
import { UpdateCheckCache } from "@agentxm/cli-maintenance/self-update/application";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { UpdateCheckCacheLive } from "./update-cache.js";

describe("Update-check cache composition", () => {
  it.effect("preserves a cache-location source failure before creating the adapter", () =>
    Effect.gen(function* () {
      const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
      const failure = yield* UpdateCheckCache.pipe(
        Effect.provide(
          Layer.provide(
            UpdateCheckCacheLive,
            Layer.mergeAll(
              Path.layer,
              FileSystem.layerNoop({}),
              ConfigProvider.layer(ConfigProvider.make(() => Effect.fail(sourceError))),
            ),
          ),
        ),
        Effect.flip,
      );
      expect(failure._tag).toBe("ConfigError");
      expect(failure.cause).toBe(sourceError);
    }),
  );
});
