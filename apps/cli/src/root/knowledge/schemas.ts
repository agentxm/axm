import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaParser from "effect/SchemaParser";
import * as SchemaTransformation from "effect/SchemaTransformation";

const FrontmatterWireSchema = Schema.Record(Schema.String, Schema.Json);

/** Preserve the core source mapping while validating JSON compatibility on encoding. */
export const FrontmatterDocumentSchema = FrontmatterWireSchema.pipe(
  Schema.decodeTo(
    Schema.toType(Schema.Record(Schema.String, Schema.Unknown)),
    SchemaTransformation.transformOrFail<Readonly<Record<string, unknown>>, Schema.JsonObject>({
      decode: (frontmatter) => Effect.succeed(frontmatter),
      encode: (frontmatter) => SchemaParser.decodeUnknownEffect(FrontmatterWireSchema)(frontmatter),
    }),
  ),
);
