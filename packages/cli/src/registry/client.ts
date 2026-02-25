/**
 * Registry client types and factory.
 *
 * Domain types for registry search and extension entries,
 * independent of any source provider abstraction.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as FileSystem from "@effect/platform/FileSystem";
import * as HttpClient from "@effect/platform/HttpClient";
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
 * Options for searching extensions within a specific registry namespace.
 *
 * - `namespace`: registry namespace to search (e.g. `"@acme"`)
 * - `names`: extension names to match (empty = all)
 * - `types`: extension types to include (empty = all)
 * - `limit`: max results to return (default: all)
 * - `offset`: number of results to skip (default: 0)
 */
export interface GetExtensionsByNamespaceArgs {
  readonly namespace: string;
  readonly names: ReadonlyArray<string>;
  readonly types: ReadonlyArray<ExtensionType>;
  readonly limit: Option.Option<number>;
  readonly offset: number;
}

// -----------------------------------------------------------------------------
// Get Extension Package Args
// -----------------------------------------------------------------------------

/**
 * Options for fetching a specific extension version from a registry.
 *
 * - `namespace`: registry namespace (e.g. `"@acme"`)
 * - `type`: extension type
 * - `name`: extension name
 * - `version`: specific version to fetch, or `None` for latest
 */
export interface GetExtensionPackageArgs {
  readonly namespace: string;
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
 * - `namespace`: registry namespace (e.g. `"@acme"`)
 * - `type`: extension type
 * - `name`: extension name
 * - `version`: version string to publish
 * - `archive`: zip archive bytes
 * - `metadata`: version entry metadata
 */
export interface PublishExtensionArgs {
  readonly namespace: string;
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
 * - `namespace`: registry namespace (e.g. `"@acme"`)
 * - `type`: extension type
 * - `name`: extension name
 */
export interface ExtensionExistsArgs {
  readonly namespace: string;
  readonly type: ExtensionType;
  readonly name: string;
}

// -----------------------------------------------------------------------------
// Get Extensions By Namespace Response
// -----------------------------------------------------------------------------

/**
 * Result from a registry extension search.
 */
export interface GetExtensionsByNamespaceResponse {
  readonly extensions: ReadonlyArray<RegistryExtensionManifest<ExtensionType>>;
  readonly total: number;
}

// -----------------------------------------------------------------------------
// Get Extension Package Response
// -----------------------------------------------------------------------------

/**
 * Response from fetching a specific extension version archive.
 */
export interface GetExtensionPackageResponse {
  readonly archive: Uint8Array;
}

// -----------------------------------------------------------------------------
// Publish Extension Response
// -----------------------------------------------------------------------------

/**
 * Response from publishing an extension version.
 */
export interface PublishExtensionResponse {
  readonly published: true;
}

// -----------------------------------------------------------------------------
// Namespace Exists Response
// -----------------------------------------------------------------------------

/**
 * Response from checking whether a namespace exists in a registry.
 */
export interface NamespaceExistsResponse {
  readonly exists: boolean;
}

// -----------------------------------------------------------------------------
// Extension Exists Response
// -----------------------------------------------------------------------------

/**
 * Response from checking whether an extension exists in a registry.
 */
export interface ExtensionExistsResponse {
  readonly exists: boolean;
}

// -----------------------------------------------------------------------------
// Extension Entry
// -----------------------------------------------------------------------------

/**
 * A discovered extension entry from a registry search.
 *
 * Represents a single matched extension with its resolved version and integrity.
 */
export interface RegistryExtensionManifest<T extends ExtensionType = ExtensionType> {
  readonly namespace: string;
  readonly type: T;
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly repository: Option.Option<string>;
  readonly license: Option.Option<string>;
  readonly authors: ReadonlyArray<Author>;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly version: string;
  readonly integrity: string;
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
  readonly getExtensionsByScope: (
    args: GetExtensionsByNamespaceArgs,
  ) => Effect.Effect<GetExtensionsByNamespaceResponse, CliError>;
  readonly namespaceExists: (namespace: string) => Effect.Effect<NamespaceExistsResponse, CliError>;
  readonly getExtensionPackage: (
    args: GetExtensionPackageArgs,
  ) => Effect.Effect<GetExtensionPackageResponse, CliError>;
  readonly publishExtension: (
    args: PublishExtensionArgs,
  ) => Effect.Effect<PublishExtensionResponse, CliError>;
  readonly extensionExists: (
    args: ExtensionExistsArgs,
  ) => Effect.Effect<ExtensionExistsResponse, CliError>;
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
      const httpClient = yield* HttpClient.HttpClient.pipe(
        Effect.provide(FetchHttpClient.layer),
      );
      return createRemoteRegistryClient(location, httpClient);
    }

    const localPath = location.startsWith("file://") ? location.slice(7) : location;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return createLocalRegistryClient(localPath, fs, path);
  });
