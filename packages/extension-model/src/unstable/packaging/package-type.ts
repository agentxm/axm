/**
 * Package type schema for purl type components.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

/**
 * Spec-conformant character set for a purl type: lowercase ASCII letters,
 * digits, period, plus, and dash; must start with a letter. The purl spec
 * declares `type` case-insensitive with a lowercase canonical form, so this
 * schema accepts only the canonical form.
 *
 * @see https://github.com/package-url/purl-spec
 */
const PACKAGE_TYPE_PATTERN = /^[a-z][a-z0-9.+-]*$/;

/**
 * Branded string schema for purl package types (e.g. "npm", "pypi", "maven").
 *
 * Enforces the purl spec character set and lowercase canonical form. To
 * accept inputs in any case, decode through {@link PackageUrlSchema} which
 * normalises the type before constructing parts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackageTypeSchema = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(PACKAGE_TYPE_PATTERN, {
      title: "Package Type",
      description:
        "A purl package type identifier in canonical lowercase form (e.g. npm, pypi, maven). Allowed characters: ASCII letters, digits, '.', '+', '-'; must start with a letter.",
      examples: ["npm", "pypi", "maven", "golang"],
      message: "Expected a lowercase purl package type like npm or pypi",
    }),
  ),
  Schema.brand("PackageType"),
  Schema.annotate({ identifier: "PackageType" }),
);

/**
 * Inferred type for purl package types.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackageType = Schema.Schema.Type<typeof PackageTypeSchema>;
