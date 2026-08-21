/**
 * Source provider for generic git repositories.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";

import { makeAppError } from "../../app-error/index.js";
import { shallowClone } from "../../git/index.js";
import { fileUrlToPath } from "../../sources/index.js";
import type { SourceHostProvider, GitSource } from "../../sources/index.js";
import { discoverConventionRefs } from "./convention-discovery.js";

/**
 * Source host provider for generic git URLs.
 *
 * Self-describing — no host config needed.
 * `match` returns true for git://, ssh://, and git@... URL schemes.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createGitSourceHostProvider = (): SourceHostProvider<
  GitSource,
  FileSystem.FileSystem | Path.Path | Scope.Scope
> => ({
  type: "git",

  match: (url: URL) =>
    Effect.succeed(
      url.protocol === "git:" || url.protocol === "ssh:" || url.href.startsWith("git@"),
    ),

  find: (source, options) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const tempDir = yield* Effect.acquireRelease(
        fs.makeTempDirectory({ prefix: "axm-source-discovery-" }).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "network",
              detail: "Temporary source directory could not be created",
              cause: error,
            }),
          ),
        ),
        (dir) => fs.remove(dir, { recursive: true }).pipe(Effect.ignore),
      );

      yield* shallowClone(source.url.href, tempDir, Option.getOrUndefined(source.ref));
      return yield* discoverConventionRefs(source, tempDir, options);
    }),

  fetch: (_source, ref) => {
    if (ref.refType !== "git-hosted") {
      return Effect.fail(
        makeAppError({
          code: "network",
          detail: "Expected ref with location for git source, but none was provided",
        }),
      );
    }
    return Effect.succeed({
      directory: fileUrlToPath(ref.location),
    });
  },
});
