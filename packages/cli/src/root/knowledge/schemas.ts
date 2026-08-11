import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaParser from "effect/SchemaParser";
import * as SchemaTransformation from "effect/SchemaTransformation";

const conceptFields = {
  bundle: Schema.String,
  id: Schema.String,
  title: Schema.String,
  type: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  tags: Schema.optional(Schema.Array(Schema.String)),
  relativePath: Schema.String,
  body: Schema.String,
};

/** One concept summary row used by search result documents. */
export const ConceptSchema = Schema.Struct(conceptFields);

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

/** One concept detail returned by `knowledge open --json`. */
export const KnowledgeOpenConceptSchema = Schema.Struct({
  ...conceptFields,
  frontmatter: Schema.optional(FrontmatterDocumentSchema),
});
