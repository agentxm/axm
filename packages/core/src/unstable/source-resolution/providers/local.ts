/**
 * Source provider for local filesystem paths.
 *
 * Wraps the existing `skillsInDir` logic into the `SourceHostProvider` interface.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { skillsInDir } from "../../workspace/read-model/discovery/index.js";
import { makeAppError } from "../../app-error/index.js";
import { decodeExtensionNameSync, type ExtensionRef } from "../../extensions/index.js";
import { docsPackagesInDir } from "../../docs/index.js";
import { fileUrlToPath } from "../../sources/index.js";
import type { SourceHostProvider, LocalSource } from "../../sources/index.js";

/**
 * Source host provider for local filesystem paths.
 *
 * Self-describing — no host config needed.
 * `match` returns true for file:// URLs and absolute/relative paths.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createLocalSourceHostProvider = (): SourceHostProvider<
  LocalSource,
  FileSystem.FileSystem | Path.Path
> => ({
  type: "local",

  match: (url: URL) => Effect.succeed(url.protocol === "file:"),

  find: (source, options) =>
    Effect.gen(function* () {
      const skillRefs =
        options.type === "docs"
          ? Effect.succeed<ReadonlyArray<ExtensionRef>>([])
          : skillsInDir(source.path, Option.none(), {
              fullDepth: false,
              includeInternal: false,
            }).pipe(
              Effect.mapError((error) =>
                makeAppError({
                  code: "network",
                  detail: `Failed to discover skills`,
                  cause: error,
                }),
              ),
              Effect.map((discovered) =>
                Array.map(
                  discovered,
                  (d): ExtensionRef => ({
                    type: "skill",
                    refType: "local",
                    skill: {
                      name: decodeExtensionNameSync(d.skill.name),
                      description: Option.some(d.skill.description),
                      metadata: d.skill.metadata,
                    },
                    source,
                    location: d.location,
                  }),
                ),
              ),
            );

      const docsRefs =
        options.type !== "docs" && options.type !== "*"
          ? Effect.succeed<ReadonlyArray<ExtensionRef>>([])
          : docsPackagesInDir(source.path, { fullDepth: false }).pipe(
              Effect.map((discovered) =>
                Array.map(
                  discovered,
                  (d): ExtensionRef => ({
                    type: "docs",
                    refType: "local",
                    file: { name: d.manifest.name },
                    source,
                    location: d.location,
                  }),
                ),
              ),
            );

      const mapped = [...(yield* skillRefs), ...(yield* docsRefs)];
      if (options.names.length === 0) return mapped;
      const nameSet = new Set(options.names);
      return mapped.filter((r) => {
        switch (r.type) {
          case "skill":
            return nameSet.has(r.skill.name);
          case "docs":
            return nameSet.has(r.file.name);
          default:
            return false;
        }
      });
    }),

  fetch: (_source, ref) => {
    if (ref.refType !== "local") {
      return Effect.fail(
        makeAppError({
          code: "network",
          detail: "Expected ref with location for local source, but none was provided",
        }),
      );
    }
    return Effect.succeed({
      directory: fileUrlToPath(ref.location),
    });
  },
});
