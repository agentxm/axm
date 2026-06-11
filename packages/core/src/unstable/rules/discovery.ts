/**
 * Rule package discovery for local and git sources.
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
  RULE_MANIFEST_FILENAME,
  RuleManifestSchema,
  type RuleManifest,
} from "./manifest-schema.js";

export type DiscoveredRulePackage = DiscoveredManifestPackage<"rule", RuleManifest>;

export type RulePackageDiscoveryOptions = ManifestPackageDiscoveryOptions;

export const rulePackagesInDir = (
  searchPath: string,
  options: RulePackageDiscoveryOptions,
): Effect.Effect<ReadonlyArray<DiscoveredRulePackage>, never, FileSystem.FileSystem | Path.Path> =>
  discoverManifestPackagesInDir(
    {
      type: "rule",
      manifestFilename: RULE_MANIFEST_FILENAME,
      decodeManifest: Schema.decodeUnknownEffect(RuleManifestSchema),
      manifestName: (manifest) => manifest.name,
    },
    searchPath,
    options,
  );
