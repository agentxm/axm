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
 * Structured purl components schema: type, namespace, name, and version.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackageUrlPartsSchema = Schema.Struct({
  type: PackageTypeSchema,
  namespace: Schema.optional(Schema.String),
  name: Schema.String,
  version: Schema.optional(Schema.String),
}).annotate({
  identifier: "PackageUrlParts",
  title: "Package URL Parts",
  description: "Decomposed purl components: type, namespace, name, and version.",
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
            null,
            null,
          ).toString(),
        ),
    }),
  ),
  Schema.annotate({ identifier: "PackageUrl" }),
);
