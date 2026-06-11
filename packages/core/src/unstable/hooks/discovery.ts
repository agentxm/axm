/**
 * Hook package discovery for local and git sources.
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
  HOOK_MANIFEST_FILENAME,
  HookManifestSchema,
  type HookManifest,
} from "./manifest-schema.js";

export type DiscoveredHookPackage = DiscoveredManifestPackage<"hook", HookManifest>;

export type HookPackageDiscoveryOptions = ManifestPackageDiscoveryOptions;

export const hookPackagesInDir = (
  searchPath: string,
  options: HookPackageDiscoveryOptions,
): Effect.Effect<ReadonlyArray<DiscoveredHookPackage>, never, FileSystem.FileSystem | Path.Path> =>
  discoverManifestPackagesInDir(
    {
      type: "hook",
      manifestFilename: HOOK_MANIFEST_FILENAME,
      decodeManifest: Schema.decodeUnknownEffect(HookManifestSchema),
      manifestName: (manifest) => manifest.name,
    },
    searchPath,
    options,
  );
