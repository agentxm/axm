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
import { SourceError } from "../provider.js";
import type { ExtensionRef, FindOptions, SourceProvider } from "../provider.js";
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
        Effect.mapError(
          (error) =>
            new SourceError({
              message: `Failed to discover skills: ${error.message}`,
              cause: error,
            }),
        ),
      );

      // Override source to ensure it matches the local source passed in
      const mapped = Array.map(refs, (ref) => ({ ...ref, source }));

      return filterByOptions(mapped, options);
    }),

  fetch: (_source, extension) =>
    Effect.succeed({ directory: extension.location.replace("file://", "") }),
});

// -----------------------------------------------------------------------------
// Filtering
// -----------------------------------------------------------------------------

const filterByOptions = (
  refs: ReadonlyArray<ExtensionRef>,
  options: FindOptions,
): ReadonlyArray<ExtensionRef> => {
  let filtered = refs;

  if (options.names.length > 0) {
    const nameSet = new Set(options.names);
    filtered = Array.filter(filtered, (ref) => {
      const name = ref.type === "skill" ? ref.skill.name : ref.name;
      return nameSet.has(name);
    });
  }

  return filtered;
};
