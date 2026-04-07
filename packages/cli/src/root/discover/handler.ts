/**
 * Discover command handler.
 *
 * Wires the discover pipeline to CLI renderer output.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import {
  discover,
  type DiscoverResult,
  type DiscoverPackageResult,
} from "@axm.sh/core/unstable/discover";
import { PackageUrlSchema } from "@axm.sh/core/unstable/packaging";
import { createRegistryClient } from "@axm.sh/core/unstable/registry";
import { RegistryUrl } from "@axm.sh/core/unstable/auth";

import { emitResultDocument } from "../../json-output.js";

const encodePurl = Schema.encodeSync(PackageUrlSchema);

// -----------------------------------------------------------------------------
// Handler Args
// -----------------------------------------------------------------------------

export interface DiscoverHandlerArgs {
  readonly path: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// JSON Output Schema
// -----------------------------------------------------------------------------

const DiscoverExtensionResultSchema = Schema.Struct({
  owner: Schema.String,
  type: Schema.String,
  name: Schema.String,
  description: Schema.String,
  latestVersion: Schema.String,
  signal: Schema.String,
});

const DiscoverPackageResultSchema = Schema.Struct({
  package: Schema.String,
  extensions: Schema.Array(DiscoverExtensionResultSchema),
});

const DiscoverResultSchema = Schema.Struct({
  totalDetected: Schema.Number,
  registryAvailable: Schema.Boolean,
  packages: Schema.Array(DiscoverPackageResultSchema),
});

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

export const handleDiscover = Effect.fn("Discover.handle")(function* (args: DiscoverHandlerArgs) {
  const renderer = yield* CliRenderer;
  const registryUrl = yield* RegistryUrl;

  // Resolve project directory
  const projectDir = Option.getOrElse(args.path, () => process.cwd());

  // Create registry client
  const registryClient = yield* createRegistryClient(registryUrl);

  // Run discover pipeline
  const result = yield* discover(projectDir, registryClient);

  // JSON output
  const jsonResult = toJsonResult(result);
  if (yield* emitResultDocument("discover", jsonResult, DiscoverResultSchema)) {
    return;
  }

  // Interactive output
  yield* renderer.info("axm discover");

  if (!result.registryAvailable) {
    yield* renderer.warn("Registry unavailable. Showing local recommendations only.");
  }

  if (result.packages.length === 0) {
    yield* renderer.message("No compatible extensions found.");
    return;
  }

  // Render per-package groups
  for (const pkg of result.packages) {
    yield* renderer.message("");
    yield* renderer.step(formatPackageName(pkg));

    for (const entry of pkg.extensions) {
      const badge = entry.signal === "recommended" ? "[recommended]" : "[compatible]";
      const fqn = `${entry.extension.owner}/${entry.extension.type}/${entry.extension.name}`;
      const desc =
        entry.extension.description.length > 0 ? ` - ${entry.extension.description}` : "";
      yield* renderer.message(`  ${badge} ${fqn}@${entry.extension.latestVersion}${desc}`);
    }
  }

  // Summary
  const totalExtensions = result.packages.reduce((sum, pkg) => sum + pkg.extensions.length, 0);
  const packagesWithResults = result.packages.length;

  yield* renderer.message("");
  yield* renderer.success(
    `Found ${totalExtensions} compatible extension${totalExtensions === 1 ? "" : "s"} for ${packagesWithResults} of ${result.totalDetected} detected package${result.totalDetected === 1 ? "" : "s"}.`,
  );
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const formatPackageName = (pkg: DiscoverPackageResult): string => {
  const parts = pkg.detectedPackage;
  if (parts.namespace !== undefined) {
    return parts.version !== undefined
      ? `${parts.namespace}/${parts.name}@${parts.version}`
      : `${parts.namespace}/${parts.name}`;
  }
  return parts.version !== undefined ? `${parts.name}@${parts.version}` : parts.name;
};

const toJsonResult = (result: DiscoverResult) => ({
  totalDetected: result.totalDetected,
  registryAvailable: result.registryAvailable,
  packages: result.packages.map((pkg) => ({
    package: encodePurl(pkg.detectedPackage),
    extensions: pkg.extensions.map((entry) => ({
      owner: entry.extension.owner,
      type: entry.extension.type,
      name: entry.extension.name,
      description: entry.extension.description,
      latestVersion: entry.extension.latestVersion,
      signal: entry.signal,
    })),
  })),
});
