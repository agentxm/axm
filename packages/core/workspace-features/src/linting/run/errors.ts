/**
 * Typed failures for lint-run staging and settings loading. The producer owns
 * the category choice and user-facing wording; the application boundary
 * converts the carried fields into its error envelope verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

/**
 * A lint input-staging step (such as materializing the Git index snapshot)
 * could not proceed. `category`, `title`, and `detail` carry the boundary
 * rendering 1:1.
 */
export class LintStagingFailed extends Schema.TaggedError<LintStagingFailed>()(
  "LintStagingFailed",
  {
    category: Schema.Literals(["validation", "internal"]),
    title: Schema.optional(Schema.String),
    detail: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}
