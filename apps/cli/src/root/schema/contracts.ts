import * as Schema from "effect/Schema";

/** The schema command exports a JSON Schema document, never an AXM result envelope. */
export const JsonSchemaDocumentSchema = Schema.StructWithRest(
  Schema.Struct({
    $schema: Schema.Literal("https://json-schema.org/draft/2020-12/schema"),
    "x-axm-command": Schema.String,
    "x-axm-validates": Schema.Literals(["stdout", "field-value"]),
    "x-axm-field": Schema.optional(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Json)],
).annotate({
  identifier: "JsonSchemaDocument",
  description:
    "A standalone JSON Schema document with local references. Standard schema keywords and extension annotations remain JSON values; this finite document contract does not embed generated command schemas recursively.",
});
