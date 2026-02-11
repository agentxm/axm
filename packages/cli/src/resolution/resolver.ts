/**
 * Main extension resolution entry point.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ResolutionError } from "./errors.js";
import {
  resolveAmbiguous,
  resolveAxmName,
  resolveBareName,
  resolveExplicitSource,
  resolveLocalPath,
  resolveUrl,
} from "./resolvers/index.js";
import type { SourceType } from "../sources/index.js";
import type { ExtensionRef, ExtensionType, ResolutionOptions } from "./types.js";

/**
 * Default resolution options with all fields set to None.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const defaultResolutionOptions: ResolutionOptions = {
  types: Option.none(),
  sources: Option.none(),
  agents: Option.none(),
  cwd: Option.none(),
  scope: Option.none(),
  projectDir: Option.none(),
  globalDir: Option.none(),
};

/**
 * Resolver function signature.
 *
 * @experimental This API is unstable and may change without notice.
 */
type Resolver = (
  input: string,
  options: ResolutionOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Effect.Effect<ExtensionRef[], any, any>;

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
  options: ResolutionOptions = defaultResolutionOptions,
) => {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Effect.Effect<ExtensionRef[], ResolutionError, any> =>
    Effect.gen(function* () {
      const maybeResolver = Array.head(remaining);
      if (Option.isNone(maybeResolver)) return [];

      const resolver = maybeResolver.value;
      const rest = Array.tailNonEmpty(remaining as Array.NonEmptyArray<Resolver>);

      const result = yield* resolver(input, options);

      if (result.length > 0) return result;

      return yield* tryResolvers(rest);
    });

  return Effect.gen(function* () {
    const results = yield* tryResolvers(resolvers);
    const filteredBySource = filterBySource(results, Option.getOrUndefined(options.sources));
    return filterByType(filteredBySource, Option.getOrUndefined(options.types));
  });
};
