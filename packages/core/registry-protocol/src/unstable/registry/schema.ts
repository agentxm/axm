/**
 * Registry layout schemas for extension index and version entries.
 *
 * These schemas define the structure of registry metadata that describes
 * published extensions and their available versions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import {
  AuthorSchema,
  BugsSchema,
  ExtensionDependencyConstraintMapSchema,
  ExtensionFqnSchema,
  ExtensionNameSchema,
  ExtensionTypeSchema,
  RepositorySchema,
} from "@agentxm/extension-model/unstable/extensions/common";
import { HandleSchema } from "@agentxm/extension-model/unstable/extensions/handle";
import { CompanionPackageSchema } from "@agentxm/extension-model/unstable/package-urls";
import {
  PackageUrlSchema,
  type PackageUrlParts,
} from "@agentxm/extension-model/unstable/packaging/package-url";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";
import { DeprecationViewSchema } from "@agentxm/extension-model/unstable/extensions/deprecation";

export const DeprecationRevisionSchema = Schema.NonEmptyString.annotate({
  identifier: "DeprecationRevision",
  description: "Opaque publisher lifecycle revision used for conditional writes.",
});

export const DeprecationReplacementIntentSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("clear") }),
  Schema.Struct({ kind: Schema.Literal("set"), fqn: ExtensionFqnSchema }),
  Schema.Struct({ kind: Schema.Literal("preserve") }),
]).annotate({ identifier: "DeprecationReplacementIntent" });

export const DeprecationManagementViewSchema = Schema.Struct({
  deprecation: Schema.NullOr(DeprecationViewSchema),
  revision: DeprecationRevisionSchema,
}).annotate({ identifier: "DeprecationManagementView" });

export const DeprecationTransitionSchema = Schema.Struct({
  target: ExtensionFqnSchema,
  before: Schema.NullOr(DeprecationViewSchema),
  after: Schema.NullOr(DeprecationViewSchema),
  disposition: Schema.Literals(["created", "edited", "restored", "unchanged"] as const),
  revision: DeprecationRevisionSchema,
}).annotate({ identifier: "DeprecationTransition" });

export type DeprecationReplacementIntent = typeof DeprecationReplacementIntentSchema.Type;
export type DeprecationManagementView = typeof DeprecationManagementViewSchema.Type;
export type DeprecationTransition = typeof DeprecationTransitionSchema.Type;

// =============================================================================
// Version Entry
// =============================================================================

/**
 * A single published version of an extension in the registry.
 *
 * Fields:
 * - version: Semver version string (e.g., "1.2.3")
 * - published: ISO 8601 timestamp of publication
 * - dependencies: Optional map of `@owner/type/name` to semver range
 * - integrity: SRI integrity string in `sha512-<base64>` format
 *
 * @experimental This API is unstable and may change without notice.
 */
export const VersionEntrySchema = Schema.Struct({
  version: VersionSchema,
  published: DateTimeUtcSchema,
  dependencies: Schema.optional(ExtensionDependencyConstraintMapSchema),
  packages: Schema.optional(Schema.Array(CompanionPackageSchema)),
  integrity: Schema.String,
  yankedAt: Schema.optional(DateTimeUtcSchema),
  yankCategory: Schema.optional(Schema.String),
  yankNotice: Schema.optional(Schema.String),
}).annotate({
  identifier: "VersionEntry",
  title: "Version Entry",
  description: "A single published version of an extension in the registry.",
});

/**
 * Inferred type for VersionEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type VersionEntry = Schema.Schema.Type<typeof VersionEntrySchema>;

const decodePackageUrlOption = Schema.decodeUnknownOption(PackageUrlSchema);

export const companionPackageToPackageUrlParts = (
  companionPackage: NonNullable<VersionEntry["packages"]>[number],
): Option.Option<PackageUrlParts> => decodePackageUrlOption(companionPackage.purl);

export const packagesToPackageUrlParts = (
  packages: VersionEntry["packages"],
): ReadonlyArray<PackageUrlParts> => {
  if (packages === undefined) {
    return [];
  }

  return packages.flatMap((companionPackage) =>
    Option.match(companionPackageToPackageUrlParts(companionPackage), {
      onNone: (): ReadonlyArray<PackageUrlParts> => [],
      onSome: (packageUrl) => [packageUrl],
    }),
  );
};

// =============================================================================
// Extension Index
// =============================================================================

/**
 * Extension index metadata describing a published extension in the registry.
 *
 * Fields:
 * - name: Extension name without owner
 * - owner: Owner namespace including `@` prefix (e.g., "@acme")
 * - type: Extension type ("skill", "mcp-server", or "pack")
 * - description: Optional human-readable description
 * - repository: Optional repository URL or object (`{ type?, url, directory? }`)
 * - bugs: Optional bug-tracker URL or object (`{ url?, email? }`)
 * - license: Optional SPDX license identifier
 * - authors: Optional list of authors
 * - versions: Array of version entries, newest first
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionIndexSchema = Schema.Struct({
  name: ExtensionNameSchema,
  owner: HandleSchema,
  type: ExtensionTypeSchema,
  publisherBindingId: Schema.NonEmptyString,
  description: Schema.optional(Schema.String),
  repository: Schema.optional(RepositorySchema),
  bugs: Schema.optional(BugsSchema),
  license: Schema.optional(Schema.String),
  authors: Schema.optional(Schema.Array(AuthorSchema)),
  visibility: Schema.optional(Schema.Literals(["public", "private"] as const)),
  deprecation: Schema.NullOr(DeprecationViewSchema),
  versions: Schema.Array(VersionEntrySchema),
}).annotate({
  identifier: "ExtensionIndex",
  title: "Extension Index",
  description: "Registry metadata describing a published extension and its available versions.",
});

/**
 * Inferred type for ExtensionIndex schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionIndex = Schema.Schema.Type<typeof ExtensionIndexSchema>;
