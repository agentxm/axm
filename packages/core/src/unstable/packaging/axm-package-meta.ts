/**
 * Schema for axm package metadata shipped by library authors.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { FullyQualifiedRefSchema } from "../extensions/common.js";

/**
 * Schema for the axm package metadata file that library authors ship
 * to surface recommended axm extensions for their package.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const AxmPackageMetaSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  recommendedExtensions: Schema.Array(FullyQualifiedRefSchema),
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
