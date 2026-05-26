/**
 * Registry discovery schemas for package-submitted companion extension metadata.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import {
  ExtensionNameSchema,
  extensionTypePluralSegments,
  extensionTypes,
} from "../extensions/common.js";
import { HandleSchema, SlugSchema } from "../extensions/handle.js";
import { VersionSchema } from "../version-constraints/version-constraints.js";

const discoveryExtensionWireTypes = [...extensionTypes, ...extensionTypePluralSegments] as const;
const DiscoveryExtensionWireTypeSchema = Schema.Literals(discoveryExtensionWireTypes);

export const DiscoveryResolvedExtensionSchema = Schema.Struct({
  owner: Schema.Union([HandleSchema, SlugSchema]),
  type: DiscoveryExtensionWireTypeSchema,
  name: ExtensionNameSchema,
  installVersion: VersionSchema,
});

export type DiscoveryResolvedExtension = Schema.Schema.Type<
  typeof DiscoveryResolvedExtensionSchema
>;

export const DiscoveryExtensionResultSchema = Schema.Struct({
  ref: Schema.String,
  resolved: Schema.Boolean,
  extension: Schema.optional(DiscoveryResolvedExtensionSchema),
  attestedBy: Schema.Array(Schema.Literals(["package", "extension"])),
  official: Schema.Boolean,
  packageVersionInRange: Schema.Boolean,
});

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
