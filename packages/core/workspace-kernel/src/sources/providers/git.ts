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

import { SourceNetworkFailure, SourceNotResolvable, type SourceError } from "../errors.js";
import { getTreeSha, shallowClone, shallowFetchCommit } from "../git/operations.js";
import type { SourceHostProvider } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { GitSource } from "@agentxm/extension-model/unstable/sources/types";
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
  FileSystem.FileSystem | Path.Path | Scope.Scope,
  SourceError
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
          Effect.mapError(
            (error) =>
              new SourceNetworkFailure({
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

  fetch: (source, ref) => {
    if (ref.refType !== "git-hosted") {
      return Effect.fail(
        new SourceNetworkFailure({
          detail: "Expected ref with location for git source, but none was provided",
        }),
      );
    }
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const tempDir = yield* Effect.acquireRelease(
        fs.makeTempDirectory({ prefix: "axm-source-commit-" }).pipe(
          Effect.mapError(
            (cause) =>
              new SourceNetworkFailure({
                detail: `Temporary directory for ${source.url.href} at ${ref.gitCommitSha} could not be created`,
                cause,
              }),
          ),
        ),
        (directory) => fs.remove(directory, { recursive: true }).pipe(Effect.ignore),
      );
      yield* shallowFetchCommit(source.url.href, tempDir, ref.gitCommitSha);
      const sourcePath = ref.sourcePath ?? ".";
      const fetchedTree = yield* getTreeSha(tempDir, sourcePath);
      if (fetchedTree !== ref.gitTreeSha) {
        return yield* new SourceNotResolvable({
          category: "conflict",
          detail: `Fetched Git content for ${source.url.href} at ${ref.gitCommitSha} did not match the accepted tree`,
        });
      }
      return {
        directory: sourcePath === "." ? tempDir : path.join(tempDir, sourcePath),
        scratchRoot: tempDir,
      };
    });
  },
});
