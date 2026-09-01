/**
 * Rule package discovery for local and git sources.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import { discoverManifestPackagesInDir } from "../extensions/manifest-package-discovery.js";
import {
  RULE_MANIFEST_FILENAME,
  RuleManifestSchema,
  type RuleManifest,
} from "@agentxm/extension-model/unstable/rules/manifest-schema";

export interface DiscoveredRulePackage {
  readonly type: "rule";
  readonly manifest: RuleManifest;
  readonly location: string;
}

export interface RulePackageDiscoveryOptions {
  readonly fullDepth: boolean;
}

const discoverRulePackagesInDir = discoverManifestPackagesInDir({
  type: "rule",
  manifestFilename: RULE_MANIFEST_FILENAME,
  manifestSchema: RuleManifestSchema,
});

export const rulePackagesInDir = (
  searchPath: string,
  options: RulePackageDiscoveryOptions,
): Effect.Effect<ReadonlyArray<DiscoveredRulePackage>, never, FileSystem.FileSystem | Path.Path> =>
  discoverRulePackagesInDir(searchPath, options);
