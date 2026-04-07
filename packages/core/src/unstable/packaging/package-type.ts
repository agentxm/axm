/**
 * Package type schema for purl type components.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

/**
 * Branded string schema for purl package types (e.g. "npm", "pypi", "maven").
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackageTypeSchema = Schema.String.pipe(
  Schema.annotate({
    identifier: "PackageType",
    title: "Package Type",
    description: "A purl package type identifier (e.g. npm, pypi, maven).",
    examples: ["npm", "pypi", "maven", "golang"],
  }),
  Schema.brand("PackageType"),
);

/**
 * Inferred type for purl package types.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackageType = Schema.Schema.Type<typeof PackageTypeSchema>;
