import * as Schema from "effect/Schema";

export const HelpIndexResultSchema = Schema.Struct({
  usage: Schema.String,
  topics: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      description: Schema.String,
      kind: Schema.Literals(["markdown", "json-schema"]),
    }),
  ),
});

const JsonSchemaObject = Schema.Record(Schema.String, Schema.Unknown);

export const HelpTopicResultSchema = Schema.Union([
  Schema.Struct({
    topic: Schema.String,
    kind: Schema.Literal("markdown"),
    content: Schema.String,
  }),
  Schema.Struct({
    topic: Schema.String,
    kind: Schema.Literal("json-schema"),
    schema: JsonSchemaObject,
  }),
]);
export type HelpTopicResult = typeof HelpTopicResultSchema.Type;
