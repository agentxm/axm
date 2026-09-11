/**
 * Local decoders for the machine documents the built CLI writes.
 *
 * An end-to-end project observes only shipped artifacts, so it may not import
 * the application's own schemas. These declare the fields the examples read,
 * which is also what keeps them honest: a spec that decoded the producer's
 * own schema would agree with the producer by construction.
 */

import * as Schema from "effect/Schema";

/** The `help <topic> --json` result document. */
export const HelpTopicDocument = Schema.Struct({
  ok: Schema.Literal(true),
  result: Schema.Struct({ topic: Schema.String, content: Schema.String }),
});

/** The stable machine error envelope every failing command writes. */
export const ErrorEnvelope = Schema.Struct({
  ok: Schema.Literal(false),
  code: Schema.String,
  title: Schema.String,
  detail: Schema.String,
  suggestions: Schema.optional(
    Schema.Array(
      Schema.Struct({
        description: Schema.String,
        cmd: Schema.optional(Schema.String),
        url: Schema.optional(Schema.String),
      }),
    ),
  ),
});
