/**
 * Source provider for local filesystem paths.
 *
 * Wraps the existing `discoverSkillsInDir` logic into the `SourceProvider` interface.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as FileSystem from "@effect/platform/FileSystem";
import type * as Path from "@effect/platform/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { discoverSkillsInDir } from "../../cli-commands/skills/install/discover-skills.js";
import { makeCliError } from "../../cli-error/index.js";
import { filterRefsByOptions } from "../provider.js";
import type { SourceProvider } from "../provider.js";
import type { LocalSourceInput } from "../types.js";

/**
 * Source provider for local filesystem paths.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createLocalProvider = (): SourceProvider<
  LocalSourceInput,
  FileSystem.FileSystem | Path.Path
> => ({
  type: "local",

  find: (source, options) =>
    Effect.gen(function* () {
      const refs = yield* discoverSkillsInDir(
        source.path,
        Option.none(),
        {
          fullDepth: false,
          includeInternal: false,
        },
        source,
      ).pipe(
        Effect.mapError((error) =>
          makeCliError({
            code: "SOURCE_FETCH_FAILED",
            what: `Failed to discover skills`,
            details: [error.message],
            cause: error,
          }),
        ),
      );

      // Override source to ensure it matches the local source passed in
      const mapped = Array.map(refs, (ref) => ({ ...ref, source }));

      return filterRefsByOptions(mapped, options);
    }),

  fetch: (_source, extension) =>
    Effect.succeed({ directory: extension.location.replace("file://", "") }),
});
