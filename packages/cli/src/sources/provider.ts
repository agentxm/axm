/**
 * Source provider abstraction for unified extension discovery and fetching.
 *
 * Defines the `SourceHostProvider` interface that all source types implement,
 * along with supporting types for search criteria, discovery results, and errors.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";

import type { CliError } from "../cli-error/index.js";
import type { ExtensionType } from "../extensions/common.js";
import type { VersionEntry } from "../registry/index.js";
import type { Source, SourceExtensionRef } from "./types.js";

// -----------------------------------------------------------------------------
// Search Criteria
// -----------------------------------------------------------------------------

/**
 * Search criteria passed to `find` -- independent of source identity.
 *
 * - `names`: extension names to match (empty = all)
 * - `type`: findable extension type filter or `"*"` for all
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface FindOptions {
  readonly names: ReadonlyArray<string>;
  readonly type: ExtensionType | "*";
}

// -----------------------------------------------------------------------------
// Fetch Result
// -----------------------------------------------------------------------------

/**
 * Materialized extension files ready for installation.
 *
 * Returned by `fetch` after files have been prepared.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ExtensionFiles {
  /** Absolute path to directory containing extension files. */
  readonly directory: string;
}

// -----------------------------------------------------------------------------
// Provider Interface
// -----------------------------------------------------------------------------

/**
 * Source host provider that unifies how all source types are accessed.
 *
 * Each source type is implemented as a provider with `match`, `find` and `fetch`
 * capabilities. The `R` parameter captures Effect requirements for the
 * provider's operations.
 *
 * @typeParam S - The specific `Source` variant this provider handles.
 * @typeParam R - Effect requirements for provider operations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SourceHostProvider<S extends Source = Source, R = never> {
  /** Source type discriminator matching `S["type"]`. */
  readonly type: S["type"];
  /** Check if a URL belongs to this provider. */
  readonly match: (url: URL) => Effect.Effect<boolean, CliError, R>;
  /** Discover extensions at the given source matching the search criteria. */
  readonly find: (
    source: S,
    options: FindOptions,
  ) => Effect.Effect<ReadonlyArray<SourceExtensionRef>, CliError, R>;
  /** Fetch and materialize extension files for a discovered ref. */
  readonly fetch: (
    source: S,
    ref: SourceExtensionRef,
  ) => Effect.Effect<ExtensionFiles, CliError, R>;
}

/**
 * Extended provider for registry sources — adds publish operations.
 *
 * Callers construct the archive, determine version, and compute metadata
 * before calling publishExtension — the provider handles storage only.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PublishableSourceHostProvider<
  S extends Source = Source,
  R = never,
> extends SourceHostProvider<S, R> {
  readonly publishExtension: (
    scope: string,
    type: ExtensionType,
    name: string,
    version: string,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => Effect.Effect<void, CliError, R>;
}
