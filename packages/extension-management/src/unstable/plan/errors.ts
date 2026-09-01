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
