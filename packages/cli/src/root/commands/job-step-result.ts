/**
 * Shared helper for converting operation results to plan job step results.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { AppError } from "@axm.sh/core/unstable/app-error";
import type { JobStepResult } from "@axm.sh/core/unstable/workspace";

/**
 * Maps an operation result to a {@link JobStepResult} discriminated union.
 *
 * Operation functions return `{ result: string; message: string; error?: AppError }`.
 * Plan steps expect `JobStepResult` which is either
 * `{ result: "success"; message: string }` or
 * `{ result: "error"; message: string; error: AppError }`.
 */
export const toJobStepResult = (result: {
  readonly result: "success" | "error";
  readonly message: string;
  readonly error?: AppError;
}): JobStepResult =>
  result.result === "error" && result.error != null
    ? { result: "error", message: result.message, error: result.error }
    : { result: "success", message: result.message };
