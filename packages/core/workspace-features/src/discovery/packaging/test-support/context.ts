import { makeMemoryFileSystem, withoutNativeIo } from "@agentxm/test-support";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { expect } from "vitest";

/**
 * Run the real parsers and readers over a fresh, byte-backed filesystem port.
 * This does not establish OS permissions, physical path identity or process
 * behavior. The shared native/memory adapter contract lives in
 * tools/test-support/src/memory-file-system.test.ts; native discovery stays in
 * discovery/discover/reports-companions-for-detected-dependencies.spec.ts and
 * discovery/discover/identifies-local-only-recommendations.spec.ts. Their
 * owning test targets provide separately attributable execution evidence.
 */
export const withPackagingContext = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.suspend(() => {
    const memory = makeMemoryFileSystem();
    const platform = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, memory.fileSystem),
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} })),
    );
    return withoutNativeIo(
      effect.pipe(
        Effect.provide(platform),
        Effect.ensuring(Effect.sync(() => expect(memory.failures).toEqual([]))),
      ),
    );
  });
