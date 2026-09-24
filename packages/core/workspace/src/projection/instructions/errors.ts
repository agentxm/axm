/**
 * Typed failures for instruction-projection maintenance. The producer owns the
 * category choice and user-facing wording; the application boundary converts
 * the carried fields into its error envelope verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import type { PathTraversalDetected, SymlinkCreationError } from "../../desired-state/index.js";
import type { WorkspaceSnapshotError } from "../../transitions/settlement/index.js";
import { FailureSuggestedActionSchema } from "../../transitions/planning/plan/errors.js";

/**
 * An instruction-projection maintenance step could not proceed. `category`
 * and `detail` carry the boundary rendering 1:1.
 */
export class InstructionMaintenanceFailed extends Schema.TaggedError<InstructionMaintenanceFailed>()(
  "InstructionMaintenanceFailed",
  {
    category: Schema.Literals(["conflict", "internal"]),
    detail: Schema.String,
    suggestions: Schema.optional(Schema.Array(FailureSuggestedActionSchema)),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

/** Every failure the instruction-projection module surfaces. */
export type InstructionMaintenanceFailure =
  | InstructionMaintenanceFailed
  | PathTraversalDetected
  | SymlinkCreationError
  | WorkspaceSnapshotError;
