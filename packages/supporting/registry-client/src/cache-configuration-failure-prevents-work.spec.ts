import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { defineSpecification } from "@agentxm/specification-metadata";

import { makeUserArchiveCache } from "./archive-cache.js";
import { resolveAxmCacheRoot } from "./cache-root.js";
import { makeRegistryClientFactory } from "./registry-client-factory.js";

export const specification = defineSpecification({
  requirement: "cli/cache/configuration-failure-prevents-work",
  title: "Unreadable cache configuration prevents cache and registry work",
  statement:
    "When a source for AXM's user cache placement cannot be read, cache operations and remote Registry client creation shall return the configuration failure without substituting a default cache path, modifying cached files, or sending Registry requests.",
  class: "functional",
  role: "interface",
  goals: ["safe-repetition", "actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Cache placement configuration", () => {
  for (const key of ["AXM_USER_HOME", "LOCALAPPDATA", "XDG_CACHE_HOME"]) {
    it.effect(`preserves an unavailable ${key} source before any cache or network work`, () =>
      Effect.gen(function* () {
        const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
        const provider = ConfigProvider.make((path) =>
          path[0] === key ? Effect.fail(sourceError) : Effect.succeed(undefined),
        );
        const writes: string[] = [];
        let requests = 0;
        const fs = FileSystem.makeNoop({
          makeDirectory: (path) =>
            Effect.sync(() => {
              writes.push(path);
            }),
          writeFile: (path) =>
            Effect.sync(() => {
              writes.push(path);
            }),
          rename: (path) =>
            Effect.sync(() => {
              writes.push(path);
            }),
          remove: (path) =>
            Effect.sync(() => {
              writes.push(path);
            }),
        });
        const http = HttpClient.make(() =>
          Effect.sync(() => {
            requests += 1;
          }).pipe(Effect.andThen(Effect.die("Unexpected request"))),
        );
        const path = yield* Path.Path;
        const factory = makeRegistryClientFactory({
          httpClient: http,
          fileSystem: fs,
          path,
          defaultRegistryLocation: "https://registry.example.test",
        });
        const effects = [
          resolveAxmCacheRoot().pipe(Effect.asVoid),
          makeUserArchiveCache().pipe(
            Effect.flatMap((cache) => cache.prune()),
            Effect.asVoid,
          ),
          factory.forLocation("https://registry.example.test").pipe(Effect.asVoid),
          factory.forDefaultRegistry.pipe(Effect.asVoid),
        ];
        for (const effect of effects) {
          const failure = yield* effect.pipe(
            Effect.provide(
              Layer.mergeAll(
                Layer.succeed(FileSystem.FileSystem, fs),
                ConfigProvider.layer(provider),
              ),
            ),
            Effect.flip,
          );
          expect(failure).toMatchObject({ _tag: "ConfigError", cause: sourceError });
        }
        expect(writes).toEqual([]);
        expect(requests).toBe(0);
      }).pipe(Effect.provide(Path.layer)),
    );
  }
});
