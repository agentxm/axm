/**
 * Typed failures for the self-update capability. The producer owns the
 * category choice and the user-facing sentence; the application boundary
 * converts the carried fields into its error envelope verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

import { OperationErrorCategorySchema } from "@agentxm/workspace-operations";

const CarriedSuggestedActionSchema = Schema.Struct({
  description: Schema.String,
  cmd: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});

/**
 * A self-update step could not proceed. The carried fields mirror the
 * application error envelope's inputs 1:1: `category` selects the code and
 * `detail`, `suggestions`, and `cause` carry over verbatim.
 */
export class UpgradeFailed extends Schema.TaggedError<UpgradeFailed>()("UpgradeFailed", {
  category: OperationErrorCategorySchema,
  detail: Schema.String,
  suggestions: Schema.optional(Schema.Array(CarriedSuggestedActionSchema)),
  cause: Schema.optional(Schema.Unknown),
}) {}
