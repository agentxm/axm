/**
 * Package URL (purl) schema for decomposing purl strings into typed parts.
 *
 * Follows the same String -> Parts pattern as RegistrySourcePatternSchema.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as SchemaTransformation from "effect/SchemaTransformation";
import { PackageURL } from "packageurl-js";
import { PackageTypeSchema } from "./package-type.js";

/**
 * Spec-conformant character set for a purl qualifier key: lowercase ASCII
 * letters, digits, period, dash, and underscore; must start with a letter.
 * The purl spec declares qualifier keys case-insensitive with a lowercase
 * canonical form, so this schema accepts only the canonical form.
 *
 * @see https://github.com/package-url/purl-spec
 */
const PURL_QUALIFIER_KEY_PATTERN = /^[a-z][a-z0-9._-]*$/;

const PurlQualifierKeySchema = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(PURL_QUALIFIER_KEY_PATTERN, {
      title: "Purl Qualifier Key",
      description:
        "A purl qualifier key in canonical lowercase form. Allowed characters: ASCII letters, digits, '.', '-', '_'; must start with a letter.",
      examples: ["repository_url", "classifier", "arch"],
      message: "Expected a lowercase purl qualifier key like classifier or arch",
    }),
  ),
);

/**
 * Structured purl components schema covering the seven spec components:
 * type, namespace, name, version, qualifiers, and subpath. The `pkg` scheme
 * is implicit.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackageUrlPartsSchema = Schema.Struct({
  type: PackageTypeSchema,
  namespace: Schema.optional(Schema.String),
  name: Schema.String,
  version: Schema.optional(Schema.String),
  qualifiers: Schema.optional(Schema.Record(PurlQualifierKeySchema, Schema.NonEmptyString)),
  subpath: Schema.optional(Schema.NonEmptyString),
}).annotate({
  identifier: "PackageUrlParts",
  title: "Package URL Parts",
  description:
    "Decomposed purl components: type, namespace, name, version, qualifiers, and subpath.",
});

/**
 * Inferred type for decomposed purl parts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackageUrlParts = Schema.Schema.Type<typeof PackageUrlPartsSchema>;

/**
 * Format a PackageUrlParts as a human-readable display string: `name (type)`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const formatPackageDisplay = (parts: PackageUrlParts): string =>
  `${parts.name} (${parts.type})`;

const decodePackageTypeSync = Schema.decodeUnknownSync(PackageTypeSchema);

/**
 * Loose Package URL shape pattern: `pkg:<type>/<rest>`. The scheme is
 * case-insensitive per the purl spec, so the prefix accepts both cases.
 * The full purl structure is validated by `PackageURL.fromString` during
 * decoding; this pattern exists to expose a useful shape hint in JSON Schema.
 */
const PACKAGE_URL_PATTERN = /^[Pp][Kk][Gg]:[a-zA-Z][a-zA-Z0-9.+-]*\/.+$/;

/**
 * Schema that decodes purl strings into structured PackageUrlParts and
 * encodes parts back to canonical purl strings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackageUrlSchema = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(PACKAGE_URL_PATTERN, {
      title: "Package URL",
      description:
        "A Package URL (purl) string identifying a package across ecosystems (e.g. pkg:npm/react@18.2.0).",
      examples: ["pkg:npm/react@18.2.0", "pkg:pypi/requests@2.31.0", "pkg:cargo/serde@1.0"],
      message: "Expected a Package URL like pkg:npm/react@18.2.0",
    }),
  ),
  Schema.decodeTo(
    Schema.toType(PackageUrlPartsSchema),
    SchemaTransformation.transformOrFail({
      decode: (input: string) => {
        try {
          const parsed = PackageURL.fromString(input);
          const parts: PackageUrlParts = {
            type: decodePackageTypeSync(parsed.type),
            name: parsed.name,
            ...(parsed.namespace != null ? { namespace: parsed.namespace } : {}),
            ...(parsed.version != null ? { version: parsed.version } : {}),
            ...(parsed.qualifiers != null ? { qualifiers: { ...parsed.qualifiers } } : {}),
            ...(parsed.subpath != null ? { subpath: parsed.subpath } : {}),
          };
          return Effect.succeed(parts);
        } catch {
          return Effect.fail(
            new SchemaIssue.Forbidden(Option.some(input), {
              message: `Expected valid purl, got: ${input}`,
            }),
          );
        }
      },
      encode: (value) =>
        Effect.succeed(
          new PackageURL(
            value.type,
            value.namespace ?? null,
            value.name,
            value.version ?? null,
            value.qualifiers ?? null,
            value.subpath ?? null,
          ).toString(),
        ),
    }),
  ),
  Schema.annotate({ identifier: "PackageUrl" }),
);
