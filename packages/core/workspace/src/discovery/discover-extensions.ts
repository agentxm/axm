/**
 * Discover companion extensions for a project directory.
 *
 * The read-only application API behind `axm discover`: the caller names the
 * project directory, the feature detects packages, consults the configured
 * Registry through the `RegistryClientFactory` port, and returns the typed
 * outcome the machine document is decoded from. Client construction belongs to
 * the composition root, so the requirement stays in `R`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { PackageUrlSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { RegistryClientFactory } from "@agentxm/registry-client";

import { discover, type DiscoverPackageResult, type DiscoverResult } from "./discover.js";

export interface DiscoverExtensionsRequest {
  /** The project directory whose direct dependencies are inspected. */
  readonly projectDir: string;
}

const DiscoveredExtensionSchema = Schema.Struct({
  ref: Schema.String,
  source: Schema.Union([
    Schema.Struct({ type: Schema.Literal("registry"), url: Schema.String }),
    Schema.Struct({
      type: Schema.Literal("git"),
      url: Schema.String,
      path: Schema.optionalKey(Schema.String),
      revision: Schema.optionalKey(Schema.String),
    }),
    Schema.Struct({ type: Schema.Literal("path"), path: Schema.String }),
  ]),
  resolved: Schema.Boolean,
  owner: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  resolution: Schema.optional(
    Schema.Union([
      Schema.Struct({ type: Schema.Literal("registry"), version: Schema.String }),
      Schema.Struct({
        type: Schema.Literal("git"),
        url: Schema.String,
        path: Schema.optionalKey(Schema.String),
        revision: Schema.optionalKey(Schema.String),
      }),
      Schema.Struct({ type: Schema.Literal("path"), path: Schema.String }),
    ]),
  ),
  attestedBy: Schema.Array(Schema.String),
  official: Schema.Boolean,
  packageVersionInRange: Schema.Boolean,
});

const DiscoveredPackageSchema = Schema.Struct({
  package: Schema.String,
  extensions: Schema.Array(DiscoveredExtensionSchema),
});

/** The machine document `axm discover` emits. */
export const DiscoverOutputSchema = Schema.Struct({
  items: Schema.Array(DiscoveredPackageSchema),
  count: Schema.Number,
  totalDetected: Schema.Number,
  registryAvailable: Schema.Boolean,
});
export type DiscoverOutput = typeof DiscoverOutputSchema.Type;

export interface DiscoverExtensionsResult {
  /** The typed outcome document. */
  readonly document: DiscoverOutput;
  /** Detected packages with their recommendation entries, for rendering. */
  readonly packages: ReadonlyArray<DiscoverPackageResult>;
  /** Whether the Registry answered; local declarations stand alone when it did not. */
  readonly registryAvailable: boolean;
}

const encodePurl = Schema.encodeSync(PackageUrlSchema);

const sourceDocument = (source: DiscoverPackageResult["extensions"][number]["source"]) => {
  switch (source.type) {
    case "registry":
      return { type: source.type, url: source.url.href };
    case "git":
      return {
        type: source.type,
        url: source.url.href,
        ...(source.path === undefined ? {} : { path: source.path }),
        ...(source.revision === undefined ? {} : { revision: source.revision }),
      };
    case "path":
      return source;
  }
};

const resolutionDocument = (
  resolution: NonNullable<DiscoverPackageResult["extensions"][number]["extension"]>["resolution"],
) => {
  switch (resolution.type) {
    case "registry":
      return resolution;
    case "git":
      return {
        type: resolution.type,
        url: resolution.url.href,
        ...(resolution.path === undefined ? {} : { path: resolution.path }),
        ...(resolution.revision === undefined ? {} : { revision: resolution.revision }),
      };
    case "path":
      return resolution;
  }
};

const toDocument = (result: DiscoverResult): DiscoverOutput => ({
  items: result.packages.map((pkg) => ({
    package: encodePurl(pkg.detectedPackage),
    extensions: pkg.extensions.map((entry) => ({
      ref: entry.ref,
      source: sourceDocument(entry.source),
      resolved: entry.resolved,
      ...(entry.extension?.owner === undefined ? {} : { owner: entry.extension.owner }),
      ...(entry.extension?.type === undefined ? {} : { type: entry.extension.type }),
      ...(entry.extension?.name === undefined ? {} : { name: entry.extension.name }),
      ...(entry.extension?.resolution === undefined
        ? {}
        : { resolution: resolutionDocument(entry.extension.resolution) }),
      attestedBy: [...entry.attestedBy],
      official: entry.official,
      packageVersionInRange: entry.packageVersionInRange,
    })),
  })),
  count: result.packages.length,
  totalDetected: result.totalDetected,
  registryAvailable: result.registryAvailable,
});

/**
 * Human-readable name of a detected package, without its purl encoding.
 */
export const detectedPackageName = (pkg: DiscoverPackageResult): string => {
  const parts = pkg.detectedPackage;
  const qualified = parts.namespace === undefined ? parts.name : `${parts.namespace}/${parts.name}`;
  return parts.version === undefined ? qualified : `${qualified}@${parts.version}`;
};

export const DiscoverExtensions = {
  query: Effect.fn("DiscoverExtensions.query")(function* (request: DiscoverExtensionsRequest) {
    const factory = yield* RegistryClientFactory;
    const result = yield* discover(request.projectDir, factory);
    return {
      document: toDocument(result),
      packages: result.packages,
      registryAvailable: result.registryAvailable,
    } satisfies DiscoverExtensionsResult;
  }),
};
