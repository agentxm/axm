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
 * Schema that decodes purl strings into structured PackageUrlParts and
 * encodes parts back to canonical purl strings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackageUrlSchema = Schema.String.pipe(
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
);
