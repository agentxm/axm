/**
 * Source provider for local filesystem paths.
 *
 * Wraps the existing `discoverSkillsInDir` logic into the `SourceHostProvider` interface.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { discoverSkillsInDir } from "../../cli-commands/skills/install/discover-skills.js";
import { makeCliError } from "../../cli-error/index.js";
import type { CliEnvConfig } from "../../config/index.js";
import type { SourceHostProvider } from "../provider.js";
import type { LocalSource, ExtensionRef } from "../types.js";
import { fileUrlToPath } from "../utils.js";

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
  FileSystem.FileSystem | Path.Path | CliEnvConfig
> => ({
  type: "local",

  match: (url: URL) => Effect.succeed(url.protocol === "file:"),

  find: (source, options) =>
    Effect.gen(function* () {
      const discovered = yield* discoverSkillsInDir(source.path, Option.none(), {
        fullDepth: false,
        includeInternal: false,
      }).pipe(
        Effect.mapError((error) =>
          makeCliError({
            code: "SOURCE_FETCH_FAILED",
            what: `Failed to discover skills`,
            details: [error.message],
            cause: error,
          }),
        ),
      );

      // Map to ExtensionRef with LocalRefDetails
      const mapped: ReadonlyArray<ExtensionRef> = Array.map(discovered, (d) => ({
        type: "skill" as const,
        refType: "local" as const,
        skill: {
          name: d.skill.name,
          description: Option.some(d.skill.description),
          metadata: d.skill.metadata,
        },
        source,
        location: d.location,
      }));

      if (options.skillNames.length === 0) return mapped;
      const nameSet = new Set(options.skillNames);
      return mapped.filter((r) => r.type === "skill" && nameSet.has(r.skill.name));
    }),

  fetch: (_source, ref) => {
    if (ref.refType !== "local") {
      return Effect.fail(
        makeCliError({
          code: "SOURCE_FETCH_FAILED",
          what: "Expected ref with location for local source, but none was provided",
        }),
      );
    }
    return Effect.succeed({
      directory: fileUrlToPath(ref.location),
    });
  },
});
