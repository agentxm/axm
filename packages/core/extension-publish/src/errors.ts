/**
 * Typed failures for the extension-publish feature. The producer owns the
 * category choice and user-facing wording; the application boundary converts
 * the carried fields into its error envelope verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

const CarriedSuggestedActionSchema = Schema.Struct({
  description: Schema.String,
  cmd: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});

/**
 * A publish policy step could not proceed. The carried fields mirror the
 * application error envelope's inputs 1:1: `category` selects the code,
 * `recover` folds into the leading suggested action, and `detail`,
 * `suggestions`, and `cause` carry over verbatim.
 */
export class PublishFailed extends Schema.TaggedError<PublishFailed>()("PublishFailed", {
  category: Schema.Literals(["conflict", "internal", "not_found", "usage", "validation"]),
  detail: Schema.String,
  recover: Schema.optional(Schema.String),
  cmd: Schema.optional(Schema.String),
  suggestions: Schema.optional(Schema.Array(CarriedSuggestedActionSchema)),
  cause: Schema.optional(Schema.Unknown),
}) {}
