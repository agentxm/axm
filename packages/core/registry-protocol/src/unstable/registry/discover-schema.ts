/**
 * Registry discovery schemas for package-submitted companion extension metadata.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import {
  ExtensionFqnSchema,
  ExtensionNameSchema,
  extensionTypePluralSegments,
  extensionTypes,
} from "@agentxm/extension-model/unstable/extensions/common";
import { HandleSchema, SlugSchema } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  AgentExtensionGitSourceSchema,
  AgentExtensionPathSourceSchema,
  AgentExtensionRegistrySourceSchema,
} from "@agentxm/extension-model/unstable/recommendations/agent-extensions";
import {
  VersionRangeSchema,
  VersionSchema,
} from "@agentxm/extension-model/unstable/version-constraints";

const discoveryExtensionWireTypes = [...extensionTypes, ...extensionTypePluralSegments] as const;
const DiscoveryExtensionWireTypeSchema = Schema.Literals(discoveryExtensionWireTypes);

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

export const DiscoveryRegistryResolutionSchema = Schema.Struct({
  type: Schema.Literal("registry"),
  version: VersionSchema,
});

export const DiscoveryGitResolutionSchema = AgentExtensionGitSourceSchema;
export const DiscoveryPathResolutionSchema = AgentExtensionPathSourceSchema;

const makeResolvedExtensionSchema = <TResolution extends Schema.Top>(resolution: TResolution) =>
  Schema.Struct({
    owner: Schema.Union([HandleSchema, SlugSchema]),
    type: DiscoveryExtensionWireTypeSchema,
    name: ExtensionNameSchema,
    resolution,
  });

export const DiscoveryRegistryResolvedExtensionSchema = makeResolvedExtensionSchema(
  DiscoveryRegistryResolutionSchema,
);
export const DiscoveryGitResolvedExtensionSchema = makeResolvedExtensionSchema(
  DiscoveryGitResolutionSchema,
);
export const DiscoveryPathResolvedExtensionSchema = makeResolvedExtensionSchema(
  DiscoveryPathResolutionSchema,
);

export const DiscoveryResolvedExtensionSchema = Schema.Union([
  DiscoveryRegistryResolvedExtensionSchema,
  DiscoveryGitResolvedExtensionSchema,
  DiscoveryPathResolvedExtensionSchema,
]);

export type DiscoveryResolvedExtension = Schema.Schema.Type<
  typeof DiscoveryResolvedExtensionSchema
>;

const discoveryResultFields = {
  ref: Schema.String,
  resolved: Schema.Boolean,
  attestedBy: Schema.Array(Schema.Literals(["package", "extension"])),
  packageVersionInRange: Schema.Boolean,
};

const DiscoveryRegistryExtensionResultSchema = Schema.Struct({
  ...discoveryResultFields,
  source: AgentExtensionRegistrySourceSchema,
  extension: Schema.optional(DiscoveryRegistryResolvedExtensionSchema),
  official: Schema.Boolean,
});

const DiscoveryGitExtensionResultSchema = Schema.Struct({
  ...discoveryResultFields,
  source: AgentExtensionGitSourceSchema,
  extension: Schema.optional(DiscoveryGitResolvedExtensionSchema),
  official: Schema.Literal(false),
});

const DiscoveryPathExtensionResultSchema = Schema.Struct({
  ...discoveryResultFields,
  source: AgentExtensionPathSourceSchema,
  extension: Schema.optional(DiscoveryPathResolvedExtensionSchema),
  official: Schema.Literal(false),
});

export const DiscoveryExtensionResultSchema = Schema.Union([
  DiscoveryRegistryExtensionResultSchema,
  DiscoveryGitExtensionResultSchema,
  DiscoveryPathExtensionResultSchema,
]);

export type DiscoveryExtensionResult = Schema.Schema.Type<typeof DiscoveryExtensionResultSchema>;

export const DiscoveryPackageResultSchema = Schema.Struct({
  purl: Schema.String,
  version: Schema.String,
  status: Schema.Literals(["resolved", "invalid_purl"]),
  extensions: Schema.Array(DiscoveryExtensionResultSchema),
});

export type DiscoveryPackageResult = Schema.Schema.Type<typeof DiscoveryPackageResultSchema>;

export const DiscoverPackagesResponseSchema = Schema.Struct({
  results: Schema.Array(DiscoveryPackageResultSchema),
});

export type DiscoverPackagesResponse = Schema.Schema.Type<typeof DiscoverPackagesResponseSchema>;
