/**
 * Hook package discovery for local and git sources.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import { discoverManifestPackagesInDir } from "../extensions/manifest-package-discovery.js";
import {
  HOOK_MANIFEST_FILENAME,
  HookManifestSchema,
  type HookManifest,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";

export interface DiscoveredHookPackage {
  readonly type: "hook";
  readonly manifest: HookManifest;
  readonly location: string;
}

export interface HookPackageDiscoveryOptions {
  readonly fullDepth: boolean;
}

const discoverHookPackagesInDir = discoverManifestPackagesInDir({
  type: "hook",
  manifestFilename: HOOK_MANIFEST_FILENAME,
  manifestSchema: HookManifestSchema,
});

export const hookPackagesInDir = (
  searchPath: string,
  options: HookPackageDiscoveryOptions,
): Effect.Effect<ReadonlyArray<DiscoveredHookPackage>, never, FileSystem.FileSystem | Path.Path> =>
  discoverHookPackagesInDir(searchPath, options);
