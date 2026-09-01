/**
 * Multi-source pattern resolution: handles both single sources and glob patterns.
 *
 * Wraps `resolveSource` for single inputs and expands globs against all known
 * skills (locked, configured, and on-disk) to resolve multiple sources.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as FileSystem from "effect/FileSystem";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import type * as Path from "effect/Path";
import * as Effect from "effect/Effect";

import {
  SourceNotResolvable,
  sourceResolutionFailureCategory,
  type SourceResolutionFailure,
} from "./errors.js";
import { expandGlobs, isGlobPattern } from "./glob.js";
import { resolveSource } from "./resolve-source.js";
import { WorkspaceCatalog } from "./workspace-catalog.js";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const sortNames = (names: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...names].sort((a, b) => a.localeCompare(b));

/** Resolve a single skill name with fallbacks: resolveSource → configured source → on-disk path. */
const resolveNameWithFallback = (
  name: string,
  configuredSkills: Readonly<Record<string, { readonly source?: string | undefined }>>,
  onDiskByName: ReadonlyMap<string, string>,
) =>
  resolveSource(name).pipe(
    Effect.catch((error) => {
      if (sourceResolutionFailureCategory(error) !== "validation") {
        return Effect.fail(error);
      }

      const configuredEntry = configuredSkills[name];
      if (configuredEntry?.source !== undefined) {
        return resolveSource(configuredEntry.source);
      }

      const diskPath = onDiskByName.get(name);
      if (diskPath !== undefined) {
        return Effect.succeed<Source>({ type: "local", path: diskPath });
      }

      return Effect.fail(error);
    }),
  );

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

/**
 * Resolve a source pattern into one or more `Source` values.
 *
 * - Single input (name, path, URL, etc.) → delegates to `resolveSource`, returns single-element array
 * - Glob pattern (e.g. `effect-*`) → expands against locked, configured, and on-disk skills
 *
 * For single name inputs, includes fallbacks to configured skills and on-disk discovery
 * when the skill is not in the lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const resolveSourcePattern = (
  input: string,
): Effect.Effect<
  ReadonlyArray<Source>,
  SourceResolutionFailure,
  WorkspaceCatalog | FileSystem.FileSystem | HttpClient.HttpClient | Path.Path
> =>
  isGlobPattern(input)
    ? Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        const candidates = yield* catalog.skillCandidates;
        const matchedNames = expandGlobs([input], candidates.names);

        if (matchedNames.length === 0) {
          return yield* new SourceNotResolvable({
            category: "not_found",
            detail: "No skills matched the given pattern",
            suggestions: [
              {
                description: "Inspect installed skills.",
                cmd: "axm skills list",
              },
            ],
          });
        }

        return yield* Effect.forEach(
          sortNames(matchedNames),
          (name) =>
            resolveNameWithFallback(name, candidates.configuredSkills, candidates.onDiskByName),
          { concurrency: "unbounded" },
        );
      })
    : resolveSource(input).pipe(
        Effect.catch((error) => {
          if (sourceResolutionFailureCategory(error) !== "validation") {
            return Effect.fail(error);
          }
          return Effect.gen(function* () {
            const catalog = yield* WorkspaceCatalog;
            const candidates = yield* catalog.skillCandidates;
            return yield* resolveNameWithFallback(
              input,
              candidates.configuredSkills,
              candidates.onDiskByName,
            );
          });
        }),
        Effect.map((source) => [source]),
      );
