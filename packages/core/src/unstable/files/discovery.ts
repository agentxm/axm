/**
 * Files package discovery for local and git sources.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import { discoverManifestPackagesInDir } from "../extensions/manifest-package-discovery.js";
import {
  FILES_MANIFEST_FILENAME,
  FilesManifestSchema,
  type FilesManifest,
} from "./manifest-schema.js";

export interface DiscoveredFilesPackage {
  readonly type: "files";
  readonly manifest: FilesManifest;
  readonly location: string;
}

export interface FilesPackageDiscoveryOptions {
  readonly fullDepth: boolean;
}

const discoverFilesPackagesInDir = discoverManifestPackagesInDir({
  type: "files",
  manifestFilename: FILES_MANIFEST_FILENAME,
  manifestSchema: FilesManifestSchema,
});

export const filesPackagesInDir = (
  searchPath: string,
  options: FilesPackageDiscoveryOptions,
): Effect.Effect<ReadonlyArray<DiscoveredFilesPackage>, never, FileSystem.FileSystem | Path.Path> =>
  discoverFilesPackagesInDir(searchPath, options);
