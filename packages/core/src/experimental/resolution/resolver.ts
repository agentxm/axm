/**
 * Main extension resolution entry point.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { FileSystem } from "@effect/platform";
import * as Effect from "effect/Effect";
import type { ResolutionError } from "./errors.js";
import {
  resolveAmbiguous,
  resolveAxmName,
  resolveBareName,
  resolveExplicitSource,
  resolveLocalPath,
  resolveUrl,
} from "./resolvers/index.js";
import type { ExtensionRef, ExtensionType, ResolutionOptions, SourceType } from "./types.js";

/**
 * Resolver function signature.
 *
 * @experimental This API is unstable and may change without notice.
 */
type Resolver = (
  input: string,
  options: ResolutionOptions,
) => Effect.Effect<ExtensionRef[], ResolutionError, FileSystem.FileSystem>;

/**
 * Filters extension references by source type.
 *
 * If sources is undefined or empty, returns all refs (no filtering).
 * Otherwise, only returns refs whose source matches one of the specified sources.
 *
 * @param refs - Extension references to filter
 * @param sources - Optional list of source types to include
 * @returns Filtered extension references
 *
 * @experimental This API is unstable and may change without notice.
 */
const filterBySource = (refs: ExtensionRef[], sources?: readonly SourceType[]): ExtensionRef[] => {
  if (!sources || sources.length === 0) return refs;
  const sourceSet = new Set(sources);
  return refs.filter((ref) => sourceSet.has(ref.source));
};

/**
 * Filters extension references by extension type.
 *
 * If types is undefined or empty, returns all refs (no filtering).
 * Otherwise, only returns refs whose type matches one of the specified types.
 *
 * @param refs - Extension references to filter
 * @param types - Optional list of extension types to include
 * @returns Filtered extension references
 *
 * @experimental This API is unstable and may change without notice.
 */
const filterByType = (refs: ExtensionRef[], types?: readonly ExtensionType[]): ExtensionRef[] => {
  if (!types || types.length === 0) return refs;
  const typeSet = new Set(types);
  return refs.filter((ref) => typeSet.has(ref.type));
};

/**
 * Resolves an extension input string to one or more extension references.
 *
 * Tries resolvers in order and returns the first non-empty result:
 * 1. resolveAxmName - Scoped names like @owner/name
 * 2. resolveBareName - Bare names like name
 * 3. resolveExplicitSource - Explicit source prefixes (github:, gitlab:, etc.)
 * 4. resolveAmbiguous - Multiple matches requiring user selection
 * 5. resolveUrl - Direct URLs
 *
 * After resolution, filters results by source type and extension type if specified in options.
 *
 * @param input - The extension input string to resolve
 * @param options - Resolution configuration options
 * @returns Effect resolving to array of extension references (empty if no matches)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const resolveExtension = (
  input: string,
  options: ResolutionOptions = {},
): Effect.Effect<ExtensionRef[], ResolutionError, FileSystem.FileSystem> => {
  const resolvers: Resolver[] = [
    resolveAxmName,
    resolveBareName,
    resolveLocalPath,
    resolveExplicitSource,
    resolveAmbiguous,
    resolveUrl,
  ];

  const tryResolvers = (
    remaining: Resolver[],
  ): Effect.Effect<ExtensionRef[], ResolutionError, FileSystem.FileSystem> =>
    Effect.gen(function* () {
      if (remaining.length === 0) return [];

      const [resolver, ...rest] = remaining;
      if (!resolver) return [];

      const result = yield* resolver(input, options);

      if (result.length > 0) return result;

      return yield* tryResolvers(rest);
    });

  return Effect.gen(function* () {
    const results = yield* tryResolvers(resolvers);
    const filteredBySource = filterBySource(results, options.sources);
    return filterByType(filteredBySource, options.types);
  });
};
