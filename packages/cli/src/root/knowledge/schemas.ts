import * as Schema from "effect/Schema";

/** One concept row, shared by the search and open result documents. */
export const ConceptSchema = Schema.Struct({
  bundle: Schema.String,
  id: Schema.String,
  title: Schema.String,
  type: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  tags: Schema.optional(Schema.Array(Schema.String)),
  relativePath: Schema.String,
  body: Schema.String,
});
