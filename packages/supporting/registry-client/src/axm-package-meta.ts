/**
 * Schema for axm package metadata shipped by library authors.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { ExtensionFqnSchema } from "@agentxm/extension-model/unstable/extensions/common";
import { VersionRangeSchema } from "@agentxm/extension-model/unstable/version-constraints";

export const PackageExtensionDeclarationSchema = Schema.Struct({
  ref: ExtensionFqnSchema,
  versionRange: Schema.optional(Schema.NullOr(VersionRangeSchema)),
}).annotate({
  identifier: "PackageExtensionDeclaration",
  title: "Package Extension Declaration",
  description:
    "An extension declared by package-native AXM metadata, with an optional semver version range.",
});

export type PackageExtensionDeclaration = Schema.Schema.Type<
  typeof PackageExtensionDeclarationSchema
>;

/**
 * Schema for the axm package metadata file that library authors ship
 * to surface recommended axm extensions for their package.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const AxmPackageMetaSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  extensions: Schema.Array(PackageExtensionDeclarationSchema),
}).annotate({
  identifier: "AxmPackageMeta",
  title: "axm Package Metadata",
  description: "Recommendation metadata shipped by library authors to surface axm extensions.",
});

/**
 * Inferred type for AxmPackageMeta schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AxmPackageMeta = Schema.Schema.Type<typeof AxmPackageMetaSchema>;
