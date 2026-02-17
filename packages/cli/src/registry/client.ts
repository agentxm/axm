/**
 * Registry client types and factory.
 *
 * Domain types for registry search and extension entries,
 * independent of any source provider abstraction.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { CliError } from "../cli-error/index.js";
import type { Author, ExtensionType } from "../extensions/common.js";
import type { VersionEntry } from "./local-schema.js";
import { createLocalRegistryClient } from "./local-client.js";
import { createRemoteRegistryClient } from "./client-remote.js";

// -----------------------------------------------------------------------------
// Search Options
// -----------------------------------------------------------------------------

/**
 * Options for searching extensions in a registry.
 *
 * - `names`: extension names to match (empty = all)
 * - `type`: extension type filter or `"*"` for all
 * - `limit`: max results to return (default: all)
 * - `offset`: number of results to skip (default: 0)
 */
export interface GetExtensionsArgs {
  readonly names: ReadonlyArray<string>;
  readonly type: ExtensionType | "*";
  readonly limit: Option.Option<number>;
  readonly offset: number;
}

// -----------------------------------------------------------------------------
// Get Extension Version Args
// -----------------------------------------------------------------------------

/**
 * Options for fetching a specific extension version from a registry.
 *
 * - `scope`: registry scope (e.g. `"@acme"`)
 * - `type`: extension type
 * - `name`: extension name
 * - `version`: specific version to fetch, or `None` for latest
 */
export interface GetExtensionVersionArgs {
  readonly scope: string;
  readonly type: ExtensionType;
  readonly name: string;
  readonly version: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// Publish Extension Args
// -----------------------------------------------------------------------------

/**
 * Options for publishing an extension version to a registry.
 *
 * - `scope`: registry scope (e.g. `"@acme"`)
 * - `type`: extension type
 * - `name`: extension name
 * - `version`: version string to publish
 * - `archive`: zip archive bytes
 * - `metadata`: version entry metadata
 */
export interface PublishExtensionArgs {
  readonly scope: string;
  readonly type: ExtensionType;
  readonly name: string;
  readonly version: string;
  readonly archive: Uint8Array;
  readonly metadata: VersionEntry;
}

// -----------------------------------------------------------------------------
// Extension Exists Args
// -----------------------------------------------------------------------------

/**
 * Options for checking whether an extension exists in a registry.
 *
 * - `scope`: registry scope (e.g. `"@acme"`)
 * - `type`: extension type
 * - `name`: extension name
 */
export interface ExtensionExistsArgs {
  readonly scope: string;
  readonly type: ExtensionType;
  readonly name: string;
}

// -----------------------------------------------------------------------------
// Get Extensions Result
// -----------------------------------------------------------------------------

/**
 * Paginated result from a registry extension search.
 */
export interface GetExtensionsResult {
  readonly extensions: ReadonlyArray<RegistryExtension>;
  readonly pagination: {
    readonly total: number;
    readonly limit: number;
    readonly offset: number;
    readonly hasMore: boolean;
  };
}

// -----------------------------------------------------------------------------
// Extension Entry
// -----------------------------------------------------------------------------

/**
 * A discovered extension entry from a registry search.
 *
 * Represents a single matched extension with its resolved version and checksum.
 */
export interface RegistryExtension {
  readonly scope: string;
  readonly type: ExtensionType;
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly repository: Option.Option<string>;
  readonly license: Option.Option<string>;
  readonly authors: Option.Option<ReadonlyArray<Author>>;
  readonly version: string;
  readonly checksum: string;
}

// -----------------------------------------------------------------------------
// Registry Client Interface
// -----------------------------------------------------------------------------

/**
 * Client interface for interacting with a registry.
 *
 * All operations are scoped to a registry root provided at construction time.
 * Uses registry-domain types only — no source provider dependencies.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RegistryClient {
  readonly getExtensions: (
    options: GetExtensionsArgs,
  ) => Effect.Effect<GetExtensionsResult, CliError>;
  readonly scopeExists: (scope: string) => Effect.Effect<boolean, CliError>;
  readonly getExtensionVersion: (
    args: GetExtensionVersionArgs,
  ) => Effect.Effect<Uint8Array, CliError>;
  readonly publishExtension: (args: PublishExtensionArgs) => Effect.Effect<void, CliError>;
  readonly extensionExists: (args: ExtensionExistsArgs) => Effect.Effect<boolean, CliError>;
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

/**
 * Create the appropriate registry client based on location scheme.
 *
 * - Local paths and `file://` URLs -> `LocalRegistryClient`
 * - `https://` URLs -> `RemoteRegistryClient` (stub)
 *
 * @param location - Registry location (local path, file:// URL, or https:// URL)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createRegistryClient = (location: string) =>
  Effect.gen(function* () {
    if (location.startsWith("https://")) {
      return createRemoteRegistryClient();
    }

    const localPath = location.startsWith("file://") ? location.slice(7) : location;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return createLocalRegistryClient(localPath, fs, path);
  });
