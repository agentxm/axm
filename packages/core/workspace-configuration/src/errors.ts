/**
 * Typed failures for workspace-configuration flows. The producer owns the
 * category choice and user-facing wording; the application boundary converts
 * the carried fields into its error envelope verbatim. The CLI's interaction
 * implementation also maps prompt-guard failures into this family, so setup
 * prompts surface through the same conversion.
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
 * A workspace-configuration flow could not proceed. `category` and `detail`
 * carry the boundary rendering 1:1.
 */
export class WorkspaceConfigurationFailed extends Schema.TaggedError<WorkspaceConfigurationFailed>()(
  "WorkspaceConfigurationFailed",
  {
    category: Schema.Literals(["conflict", "internal", "usage", "validation"]),
    detail: Schema.String,
    suggestions: Schema.optional(Schema.Array(CarriedSuggestedActionSchema)),
    recover: Schema.optional(Schema.String),
    cmd: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Unknown),
  },
) {}
