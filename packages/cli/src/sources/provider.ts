/**
 * Source provider abstraction for unified extension discovery and fetching.
 *
 * Defines the `SourceHostProvider` interface that all source types implement,
 * along with supporting types for search criteria, discovery results, and errors.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

import type { CliError } from "../cli-error/index.js";
import type { Skill } from "../extensions/skills/types.js";
import type { RegistryExtensionType, VersionEntry } from "../registry/index.js";
import type { FindableExtensionType, NewSource, SourceExtensionRef, SourceInput } from "./types.js";

// -----------------------------------------------------------------------------
// Search Criteria
// -----------------------------------------------------------------------------

/**
 * Search criteria passed to `find` -- independent of source identity.
 *
 * - `names`: extension names to match (empty = all)
 * - `agents`: agent compatibility filter (empty = all)
 * - `type`: findable extension type filter or `"*"` for all
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface FindOptions {
  readonly names: ReadonlyArray<string>;
  readonly agents: ReadonlyArray<string>;
  readonly type: FindableExtensionType | "*";
}

// -----------------------------------------------------------------------------
// Discovery Results (legacy — kept for backward compatibility)
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
export interface SourceHostProvider<S extends NewSource = NewSource, R = never> {
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
 * before calling publishVersion — the provider handles storage only.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PublishableSourceHostProvider<
  S extends NewSource = NewSource,
  R = never,
> extends SourceHostProvider<S, R> {
  readonly publishVersion: (
    scope: string,
    type: RegistryExtensionType,
    name: string,
    version: string,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => Effect.Effect<void, CliError, R>;
}

// -----------------------------------------------------------------------------
// Legacy Provider Interface
// -----------------------------------------------------------------------------

/**
 * @experimental This API is unstable and may change without notice.
 */
export interface LegacySourceProvider<S extends SourceInput = SourceInput, R = never> {
  /** Source type discriminator matching `S["type"]`. */
  readonly type: S["type"];
  /** Discover extensions at the given source matching the search criteria. */
  readonly find: (
    source: S,
    options: FindOptions,
  ) => Effect.Effect<ReadonlyArray<ExtensionRef>, CliError, R>;
  /** Fetch and materialize extension files for a discovered ref. */
  readonly fetch: (
    source: S,
    extension: ExtensionRef,
  ) => Effect.Effect<ExtensionFiles, CliError, R>;
}

// -----------------------------------------------------------------------------
// Shared Helpers
// -----------------------------------------------------------------------------

/** Filter extension refs by name options. No-op when `options.names` is empty. */
export const filterRefsByOptions = (
  refs: ReadonlyArray<ExtensionRef>,
  options: FindOptions,
): ReadonlyArray<ExtensionRef> => {
  if (options.names.length === 0) return refs;
  const nameSet = new Set(options.names);
  return Array.filter(refs, (ref) => {
    const name = ref.type === "skill" ? ref.skill.name : ref.name;
    return nameSet.has(name);
  });
};
