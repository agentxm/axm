/**
 * Files package discovery for local and git sources.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import {
  discoverManifestPackagesInDir,
  type DiscoveredManifestPackage,
  type ManifestPackageDiscoveryOptions,
} from "../extensions/discovery-scan.js";
import {
  FILES_MANIFEST_FILENAME,
  FilesManifestSchema,
  type FilesManifest,
} from "./manifest-schema.js";

export type DiscoveredFilesPackage = DiscoveredManifestPackage<"files", FilesManifest>;

export type FilesPackageDiscoveryOptions = ManifestPackageDiscoveryOptions;

export const filesPackagesInDir = (
  searchPath: string,
  options: FilesPackageDiscoveryOptions,
): Effect.Effect<ReadonlyArray<DiscoveredFilesPackage>, never, FileSystem.FileSystem | Path.Path> =>
  discoverManifestPackagesInDir(
    {
      type: "files",
      manifestFilename: FILES_MANIFEST_FILENAME,
      decodeManifest: Schema.decodeUnknownEffect(FilesManifestSchema),
      manifestName: (manifest) => manifest.name,
    },
    searchPath,
    options,
  );
