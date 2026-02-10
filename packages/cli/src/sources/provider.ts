/**
 * Source provider abstraction for unified extension discovery and fetching.
 *
 * Defines the `SourceProvider` interface that all source types implement,
 * along with supporting types for search criteria, discovery results, and errors.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Data from "effect/Data";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

import type { ExtensionType } from "../extensions/common.js";
import type { Skill } from "../extensions/skills/types.js";
import type { SourceInput } from "./types.js";

// -----------------------------------------------------------------------------
// Search Criteria
// -----------------------------------------------------------------------------

/**
 * Search criteria passed to `find` -- independent of source identity.
 *
 * - `names`: extension names to match (empty = all)
 * - `agents`: agent compatibility filter (empty = all)
 * - `type`: extension type filter (`"skill"`, `"mcp-server"`, or `"*"` for all)
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface FindOptions {
  readonly names: ReadonlyArray<string>;
  readonly agents: ReadonlyArray<string>;
  readonly type: ExtensionType | "*";
}

// -----------------------------------------------------------------------------
// Discovery Results
// -----------------------------------------------------------------------------

/**
 * Discriminated union of discovered extension references.
 *
 * Returned by `find`, consumed by `fetch`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionRef = SkillRef | McpServerRef;

/**
 * A discovered skill reference.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillRef {
  /** Discriminator for the extension type. */
  readonly type: "skill";
  /** Parsed skill metadata from SKILL.md. */
  readonly skill: Skill;
  /** The source that was searched. */
  readonly source: SourceInput;
  /** URL where extension files are materialized (`file://` or `https://`). */
  readonly location: string;
  /** Resolved version for registry sources; `None` for git/local. */
  readonly version: Option.Option<string>;
  /** Git tree SHA for integrity verification. */
  readonly gitTreeSha: Option.Option<string>;
}

/**
 * A discovered MCP server reference (forward compatibility).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface McpServerRef {
  /** Discriminator for the extension type. */
  readonly type: "mcp-server";
  /** Name of the MCP server. */
  readonly name: string;
  /** The source that was searched. */
  readonly source: SourceInput;
  /** URL where extension files are materialized (`file://` or `https://`). */
  readonly location: string;
  /** Resolved version for registry sources; `None` for git/local. */
  readonly version: Option.Option<string>;
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
// Errors
// -----------------------------------------------------------------------------

/**
 * Error for source provider operations (find/fetch).
 *
 * Subsumes existing `DiscoveryError` and `CloneUrlError` as providers
 * replace the current discovery code.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class SourceError extends Data.TaggedError("SourceError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

/**
 * Error for registry-specific operations (fetchIndex, publishVersion, etc.).
 *
 * @experimental This API is unstable and may change without notice.
 */
export class RegistryError extends Data.TaggedError("RegistryError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

/**
 * Error when no registry source is configured.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class RegistryNotConfiguredError extends Data.TaggedError("RegistryNotConfiguredError")<{
  readonly message: string;
}> {}

// -----------------------------------------------------------------------------
// Provider Interface
// -----------------------------------------------------------------------------

/**
 * Source provider that unifies how all source types are accessed.
 *
 * Each source type is implemented as a provider with `find` and `fetch`
 * capabilities. The `R` parameter captures Effect requirements for the
 * provider's operations.
 *
 * @typeParam S - The specific `SourceInput` variant this provider handles.
 * @typeParam R - Effect requirements for provider operations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SourceProvider<S extends SourceInput = SourceInput, R = never> {
  /** Source type discriminator matching `S["source"]`. */
  readonly type: S["source"];
  /** Discover extensions at the given source matching the search criteria. */
  readonly find: (
    source: S,
    options: FindOptions,
  ) => Effect.Effect<ReadonlyArray<ExtensionRef>, SourceError, R>;
  /** Fetch and materialize extension files for a discovered ref. */
  readonly fetch: (
    source: S,
    extension: ExtensionRef,
  ) => Effect.Effect<ExtensionFiles, SourceError, R>;
}

// -----------------------------------------------------------------------------
// Provider Registry
// -----------------------------------------------------------------------------

/**
 * Maps each source type to its provider implementation.
 *
 * Internal to the `SourceProviders` service -- handlers don't see this directly.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ProviderRegistry = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- R is existential per provider
  [K in SourceInput["source"]]: SourceProvider<Extract<SourceInput, { source: K }>, any>;
};
