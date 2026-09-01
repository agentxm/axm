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
import * as Effect from "effect/Effect";

import { makeAppError, type AppError } from "../../app-error/index.js";
import { fileUrlToPath } from "../file-url.js";
import type { SourceHostProvider } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { LocalSource } from "@agentxm/extension-model/unstable/sources/types";
import { discoverConventionRefs } from "./convention-discovery.js";

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
  FileSystem.FileSystem | Path.Path,
  AppError
> => ({
  type: "local",

  match: (url: URL) => Effect.succeed(url.protocol === "file:"),

  find: (source, options) =>
    discoverConventionRefs(source, source.path, options).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "network",
          detail: "Failed to discover extensions",
          cause: error,
        }),
      ),
    ),

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
