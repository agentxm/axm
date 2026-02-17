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

import type { CliError } from "../cli-error/index.js";
import type { ExtensionType } from "../extensions/common.js";
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
 * - `agents`: agent compatibility filter (empty = all)
 * - `type`: extension type filter or `"*"` for all
 */
export interface GetExtensionsArgs {
  readonly names: ReadonlyArray<string>;
  readonly agents: ReadonlyArray<string>;
  readonly type: ExtensionType | "*";
}

// -----------------------------------------------------------------------------
// Extension Entry
// -----------------------------------------------------------------------------

/**
 * A discovered extension entry from a registry search.
 *
 * Represents a single matched extension with its resolved version and checksum.
 */
export interface RegistryExtensionEntry {
  readonly scope: string;
  readonly type: ExtensionType;
  readonly name: string;
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
  ) => Effect.Effect<
    ReadonlyArray<RegistryExtensionEntry>,
    CliError,
    FileSystem.FileSystem | Path.Path
  >;
  readonly scopeExists: (
    scope: string,
  ) => Effect.Effect<boolean, CliError, FileSystem.FileSystem | Path.Path>;
  readonly getExtension: (
    scope: string,
    type: ExtensionType,
    name: string,
    version: string,
  ) => Effect.Effect<Uint8Array, CliError, FileSystem.FileSystem | Path.Path>;
  readonly publishExtension: (
    scope: string,
    type: ExtensionType,
    name: string,
    version: string,
    archive: Uint8Array,
    metadata: VersionEntry,
  ) => Effect.Effect<void, CliError, FileSystem.FileSystem | Path.Path>;
  readonly extensionExists: (
    scope: string,
    type: ExtensionType,
    name: string,
  ) => Effect.Effect<boolean, CliError, FileSystem.FileSystem | Path.Path>;
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
export const createRegistryClient = (location: string): RegistryClient => {
  if (location.startsWith("https://")) {
    return createRemoteRegistryClient();
  }

  const localPath = location.startsWith("file://") ? location.slice(7) : location;
  return createLocalRegistryClient(localPath);
};
