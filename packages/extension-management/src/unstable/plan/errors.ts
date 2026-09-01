/**
 * Error category vocabulary for serialized plan and step data.
 *
 * The categories are the same strings as the CLI's `AppErrorCode` so machine
 * output stays byte-identical across the package boundary; the conversion
 * boundary beside the CLI error vocabulary asserts the parity at compile
 * time. The kernel owns the vocabulary because plans, journals, and machine
 * output serialize it; it never owns titles, exit codes, or rendering.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

/** Every category a plan, step result, or risk condition may serialize. */
export const OPERATION_ERROR_CATEGORIES = [
  "issues",
  "usage",
  "not_found",
  "auth",
  "forbidden",
  "conflict",
  "rate_limit",
  "network",
  "validation",
  "internal",
  "unavailable",
  "quota",
  "auth_required",
  "auth_expired",
  "auth_denied",
  "timeout",
] as const;

export const OperationErrorCategorySchema = Schema.Literals(OPERATION_ERROR_CATEGORIES).annotate({
  identifier: "OperationErrorCategory",
});

export type OperationErrorCategory = (typeof OPERATION_ERROR_CATEGORIES)[number];

/**
 * The `SuggestedAction` contract shape, without the safe-command runtime
 * filter: a step failure carries whatever suggestion its producer chose, and
 * the CLI boundary sanitizes suggested commands before rendering them.
 */
const CarriedSuggestedActionSchema = Schema.Struct({
  description: Schema.String,
  cmd: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});

// The carried shape and the contract type must stay the same type.
type CarriedSuggestedAction = typeof CarriedSuggestedActionSchema.Type;
const _suggestedActionParity = (value: CarriedSuggestedAction): SuggestedAction => value;
void _suggestedActionParity;

/**
 * The one serializable failure a plan step settles with. Step authors own the
 * category choice and the user-facing detail sentence; `suggestions` carries
 * only display data the boundary cannot reconstruct from fields, and `cause`
 * carries the typed feature error or raw cause for diagnostic chains. The CLI
 * boundary owns rendering, exit codes, and the AppError envelope.
 */
export class StepFailure extends Schema.TaggedError<StepFailure>()("StepFailure", {
  category: OperationErrorCategorySchema,
  detail: Schema.String,
  suggestions: Schema.optional(Schema.Array(CarriedSuggestedActionSchema)),
  cause: Schema.optional(Schema.Unknown),
}) {}

/**
 * Detail sentence for a stale execution candidate; the CLI conversion emits
 * it verbatim so blocked output stays byte-identical.
 */
export const STALE_CANDIDATE_DETAIL = "The execution candidate became stale before apply.";

/**
 * The frozen execution candidate's material preimages changed between
 * validation and apply. Detected by tag, never by detail-string comparison.
 */
export class StaleExecutionCandidate extends Schema.TaggedError<StaleExecutionCandidate>()(
  "StaleExecutionCandidate",
  {
    /** The plan name of the candidate that went stale. */
    candidate: Schema.String,
  },
) {}
