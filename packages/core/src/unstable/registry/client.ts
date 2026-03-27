/**
 * Registry client types and factory.
 *
 * Domain types for registry search and extension entries,
 * independent of any source provider abstraction.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { AppError } from "../app-error/index.js";
import type { Author, ExtensionType } from "../extensions/index.js";
import type { ExtensionIndex, VersionEntry } from "./schema.js";
import { createLocalRegistryClient } from "./local-client.js";
import { createRemoteRegistryClient } from "./remote-client.js";

// -----------------------------------------------------------------------------
// Search Options
// -----------------------------------------------------------------------------

/**
 * Options for searching extensions within a specific registry profile.
 *
 * - `handle`: profile handle to search (e.g. `"@acme"`)
 * - `names`: extension names to match (empty = all)
 * - `types`: extension types to include (empty = all)
 * - `limit`: max results to return (default: all)
 * - `offset`: number of results to skip (default: 0)
 */
export interface GetExtensionsByProfileArgs {
  readonly handle: string;
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
 * - `handle`: profile handle in the registry path (e.g. `"@acme"`)
 * - `type`: extension type
 * - `name`: extension name
 * - `version`: specific version to fetch, or `None` for latest
 */
export interface GetExtensionPackageArgs {
  readonly handle: string;
  readonly type: ExtensionType;
  readonly name: string;
  readonly version: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// Get Extension Index Args
// -----------------------------------------------------------------------------

/**
 * Options for fetching extension index metadata from a registry.
 *
 * - `handle`: profile handle in the registry path (e.g. `"@acme"`)
 * - `type`: extension type
 * - `name`: extension name
 */
export interface GetExtensionIndexArgs {
  readonly handle: string;
  readonly type: ExtensionType;
  readonly name: string;
}

// -----------------------------------------------------------------------------
// Publish Extension Args
// -----------------------------------------------------------------------------

/**
 * Options for publishing an extension version to a registry.
 *
 * - `handle`: profile handle in the registry path (e.g. `"@acme"`)
 * - `type`: extension type
 * - `name`: extension name
 * - `version`: version string to publish
 * - `archive`: zip archive bytes
 * - `metadata`: version entry metadata
 */
export interface PublishExtensionArgs {
  readonly handle: string;
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
 * - `handle`: profile handle in the registry path (e.g. `"@acme"`)
 * - `type`: extension type
 * - `name`: extension name
 */
export interface ExtensionExistsArgs {
  readonly handle: string;
  readonly type: ExtensionType;
  readonly name: string;
}

// -----------------------------------------------------------------------------
// Get Extensions By Profile Response
// -----------------------------------------------------------------------------

/**
 * Result from a registry extension search.
 */
export interface GetExtensionsByProfileResponse {
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
// Profile Exists Response
// -----------------------------------------------------------------------------

/**
 * Response from checking whether a profile exists in a registry.
 */
export interface ProfileExistsResponse {
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
  readonly profile: string;
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
    args: GetExtensionsByProfileArgs,
  ) => Effect.Effect<GetExtensionsByProfileResponse, AppError>;
  readonly profileExists: (handle: string) => Effect.Effect<ProfileExistsResponse, AppError>;
  readonly getExtensionIndex: (
    args: GetExtensionIndexArgs,
  ) => Effect.Effect<Option.Option<ExtensionIndex>, AppError>;
  readonly getExtensionPackage: (
    args: GetExtensionPackageArgs,
  ) => Effect.Effect<GetExtensionPackageResponse, AppError>;
  readonly publishExtension: (
    args: PublishExtensionArgs,
  ) => Effect.Effect<PublishExtensionResponse, AppError>;
  readonly extensionExists: (
    args: ExtensionExistsArgs,
  ) => Effect.Effect<ExtensionExistsResponse, AppError>;
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

/**
 * Create the appropriate registry client based on location scheme.
 *
 * - Local paths and `file://` URLs -> `LocalRegistryClient`
 * - `http://` and `https://` URLs -> `RemoteRegistryClient`
 *
 * @param location - Registry location (local path, file:// URL, or https:// URL)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createRegistryClient = (location: string) =>
  Effect.gen(function* () {
    if (location.startsWith("https://") || location.startsWith("http://")) {
      const ambientHttpClient = yield* Effect.serviceOption(HttpClient.HttpClient);
      const httpClient = yield* Option.match(ambientHttpClient, {
        onNone: () => HttpClient.HttpClient.asEffect().pipe(Effect.provide(FetchHttpClient.layer)),
        onSome: (client) => Effect.succeed(client),
      });
      return createRemoteRegistryClient(location, httpClient);
    }

    const localPath = location.startsWith("file://") ? location.slice(7) : location;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return createLocalRegistryClient(localPath, fs, path);
  });
