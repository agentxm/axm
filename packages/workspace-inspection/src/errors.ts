/**
 * Typed failures for workspace-inspection queries. The producer owns the
 * category choice and user-facing wording; the application boundary converts
 * the carried fields into its error envelope verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

/**
 * A workspace-inspection query could not proceed. `category` and `detail`
 * carry the boundary rendering 1:1.
 */
export class WorkspaceInspectionFailed extends Schema.TaggedError<WorkspaceInspectionFailed>()(
  "WorkspaceInspectionFailed",
  {
    category: Schema.Literals(["internal", "validation"]),
    detail: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}
