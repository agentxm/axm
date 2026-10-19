/**
 * Registry discovery request schemas for package-submitted companion extension
 * metadata.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { ExtensionFqnSchema } from "@agentxm/extension-model/unstable/extensions/common";
import {
  AgentExtensionGitSourceSchema,
  AgentExtensionPathSourceSchema,
  AgentExtensionRegistrySourceSchema,
} from "@agentxm/extension-model/unstable/recommendations/agent-extensions";
import { VersionRangeSchema } from "@agentxm/extension-model/unstable/version-constraints";

const DiscoveryRegistryDeclarationSchema = Schema.Struct({
  ref: ExtensionFqnSchema,
  source: AgentExtensionRegistrySourceSchema,
  versionRange: Schema.optionalKey(VersionRangeSchema),
});

const DiscoveryGitDeclarationSchema = Schema.Struct({
  ref: ExtensionFqnSchema,
  source: AgentExtensionGitSourceSchema,
});

const DiscoveryPathDeclarationSchema = Schema.Struct({
  ref: ExtensionFqnSchema,
  source: AgentExtensionPathSourceSchema,
});

/** A normalized recommendation submitted for package-side attestation. */
export const DiscoveryDeclaredExtensionSchema = Schema.Union([
  DiscoveryRegistryDeclarationSchema,
  DiscoveryGitDeclarationSchema,
  DiscoveryPathDeclarationSchema,
]);

export type DiscoveryDeclaredExtension = Schema.Schema.Type<
  typeof DiscoveryDeclaredExtensionSchema
>;

/** Maximum package entries admitted by one Registry discovery request. */
export const MAX_DISCOVERY_PACKAGES = 500;

/** Maximum declarations across all package entries in one discovery request. */
export const MAX_DISCOVERY_DECLARED_EXTENSIONS = 500;

/** Maximum UTF-8 encoded JSON body size, including the request envelope. */
export const MAX_DISCOVERY_REQUEST_BYTES = 1024 * 1024;

export const DiscoverPackageInputSchema = Schema.Struct({
  purl: Schema.String,
  version: Schema.String,
  declaredExtensions: Schema.Array(DiscoveryDeclaredExtensionSchema).check(
    Schema.isMaxLength(MAX_DISCOVERY_DECLARED_EXTENSIONS),
  ),
});

export type DiscoverPackageInput = Schema.Schema.Type<typeof DiscoverPackageInputSchema>;

export const DiscoverPackagesRequestSchema = Schema.Struct({
  client: Schema.Struct({ axmVersion: Schema.String }),
  packages: Schema.Array(DiscoverPackageInputSchema).check(
    Schema.isMaxLength(MAX_DISCOVERY_PACKAGES),
    Schema.makeFilter((packages) =>
      packages.reduce((count, pkg) => count + pkg.declaredExtensions.length, 0) <=
      MAX_DISCOVERY_DECLARED_EXTENSIONS
        ? true
        : `A discovery request permits at most ${MAX_DISCOVERY_DECLARED_EXTENSIONS} declared extensions across all packages`,
    ),
  ),
}).annotate({
  description:
    "Discovery requests admit at most 500 packages and 500 declared extensions in total; the transport limits the UTF-8 encoded JSON body to 1 MiB, including the request envelope.",
});

export type DiscoverPackagesRequest = Schema.Schema.Type<typeof DiscoverPackagesRequestSchema>;
