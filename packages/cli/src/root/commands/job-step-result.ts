/**
 * Shared helper for converting operation results to plan job step results.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { AppError } from "@agentxm/client-core/unstable/app-error";
import type { JobStepArtifact, JobStepResult } from "@agentxm/client-core/unstable/plan";

/**
 * Maps an operation result to a {@link JobStepResult} discriminated union.
 *
 * Operation functions return `{ result: string; message: string; error?: AppError }`.
 * Plan steps expect `JobStepResult` which is either
 * `{ result: "success"; message: string; links?: { html: string } }` or
 * `{ result: "error"; message: string; error: AppError }`.
 */
export const toJobStepResult = (result: {
  readonly result: "success" | "error";
  readonly message: string;
  readonly error?: AppError;
  readonly links?: { readonly html: string };
  readonly artifact?: JobStepArtifact;
}): JobStepResult =>
  result.result === "error" && result.error != null
    ? { result: "error", message: result.message, error: result.error }
    : {
        result: "success",
        message: result.message,
        ...(result.links !== undefined ? { links: result.links } : {}),
        ...(result.artifact !== undefined ? { artifact: result.artifact } : {}),
      };
