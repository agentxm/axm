/**
 * Registry discover schemas for package-aware extension discovery.
 *
 * Defines the request/response shapes for the discover endpoint that
 * maps detected packages and workspace recommendations to extensions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { ExtensionTypeSchema } from "../extensions/index.js";
import { ExtensionNameSchema } from "../extensions/common.js";
import { HandleSchema } from "../extensions/handle.js";
import { ExactSemverVersionSchema } from "../version-constraints/version-constraints.js";
import { PackageUrlSchema } from "../packaging/package-url.js";

// =============================================================================
// Discover Extension Entry
// =============================================================================

/**
 * An extension discovered via package compatibility or recommendation.
 *
 * Fields:
 * - type: Extension type (skill, mcp-server, etc.)
 * - name: Extension name without owner
 * - owner: Owner namespace including `@` prefix (e.g., "@acme")
 * - description: Human-readable description
 * - latestVersion: Latest compatible semver version
 *
 * @experimental This API is unstable and may change without notice.
 */
export const DiscoverExtensionEntrySchema = Schema.Struct({
  type: ExtensionTypeSchema,
  name: ExtensionNameSchema,
  owner: HandleSchema,
  description: Schema.String,
  latestVersion: ExactSemverVersionSchema,
}).annotate({
  identifier: "DiscoverExtensionEntry",
  title: "Discover Extension Entry",
  description: "An extension discovered via package compatibility or recommendation.",
});

/**
 * Inferred type for DiscoverExtensionEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type DiscoverExtensionEntry = Schema.Schema.Type<typeof DiscoverExtensionEntrySchema>;

// =============================================================================
// Discover Extensions Response
// =============================================================================

/**
 * Response from extension discovery showing compatible and recommended extensions.
 *
 * Fields:
 * - results: Extensions grouped by detected package
 * - resolvedRecommendations: Flat list of extensions from workspace recommendations
 *
 * @experimental This API is unstable and may change without notice.
 */
export const DiscoverExtensionsResponseSchema = Schema.Struct({
  results: Schema.Array(
    Schema.Struct({
      detectedPackage: PackageUrlSchema,
      extensions: Schema.Array(DiscoverExtensionEntrySchema),
    }),
  ),
  resolvedRecommendations: Schema.Array(DiscoverExtensionEntrySchema),
}).annotate({
  identifier: "DiscoverExtensionsResponse",
  title: "Discover Extensions Response",
  description: "Response from extension discovery showing compatible and recommended extensions.",
});

/**
 * Inferred type for DiscoverExtensionsResponse schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type DiscoverExtensionsResponse = Schema.Schema.Type<
  typeof DiscoverExtensionsResponseSchema
>;
