/**
 * The failure vocabulary a publish use case surfaces, and the redacted,
 * machine-readable cause the publish result reports for a step that actually
 * failed.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { isRegistryClientFailure, redactRegistryText } from "@agentxm/registry-client";
import type { RegistryClientFailure } from "@agentxm/registry-client";
import type { OperationErrorCategory } from "@agentxm/workspace-operations";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { PublishFailed } from "./errors.js";

/** Every typed failure a publish use case can surface. */
export type PublishFailure = PublishFailed | RegistryClientFailure;

export const isPublishFailure = (error: unknown): error is PublishFailure =>
  error instanceof PublishFailed || isRegistryClientFailure(error);

/** Error classes the publish document reports beside the category. */
export type PublishCauseClass = "internal" | "user" | "external";

const CAUSE_CLASS_BY_CATEGORY: Readonly<Record<OperationErrorCategory, PublishCauseClass>> = {
  issues: "user",
  usage: "user",
  not_found: "user",
  auth: "user",
  forbidden: "user",
  conflict: "user",
  rate_limit: "external",
  network: "external",
  validation: "user",
  internal: "internal",
  unavailable: "external",
  quota: "external",
  auth_required: "user",
  auth_expired: "user",
  auth_denied: "user",
  timeout: "external",
};

/** The category the failure assigned itself. */
export const publishFailureCategory = (failure: PublishFailure): OperationErrorCategory =>
  failure._tag === "PublishFailed" ? failure.category : failure.category;

/** The user-facing sentence the failure carries. */
export const publishFailureDetail = (failure: PublishFailure): string =>
  failure._tag === "PublishFailed"
    ? failure.detail
    : failure._tag === "RegistryProblem"
      ? (failure.detail ?? failure.title ?? "The registry rejected the request.")
      : failure.detail;

export const publishFailureSuggestions = (
  failure: PublishFailure,
): ReadonlyArray<SuggestedAction> => failure.suggestions ?? [];

const failureMetadata = (failure: PublishFailure) =>
  failure._tag === "PublishFailed" ? undefined : failure.metadata;

/** True when the request policy proved the failure worth retrying. */
export const isRetryablePublishFailure = (failure: PublishFailure): boolean =>
  failureMetadata(failure)?.requestPolicy?.retryable === true;

/** The Registry problem code, when the failure carried one. */
export const publishFailureProblemCode = (failure: PublishFailure): string | undefined =>
  failureMetadata(failure)?.response?.problemCode;

/**
 * The redacted cause the publish document reports. Only evidence the Registry
 * or the request policy established is carried; credential shapes in
 * Registry-supplied text are redacted before they reach durable output.
 */
export const publishCause = (failure: PublishFailure) => {
  const category = publishFailureCategory(failure);
  const metadata = failureMetadata(failure);
  const policy = metadata?.requestPolicy;
  const response = metadata?.response;
  return {
    code: category,
    class: CAUSE_CLASS_BY_CATEGORY[category],
    message: redactRegistryText(publishFailureDetail(failure)),
    retryable: policy?.retryable ?? false,
    ...(policy === undefined
      ? {}
      : {
          attemptCount: policy.attemptCount,
          maxAttempts: policy.maxAttempts,
          attemptsExhausted: policy.exhausted,
          ...(policy.stoppedBy === undefined ? {} : { retryStoppedBy: policy.stoppedBy }),
        }),
    ...(response?.requestId === undefined
      ? {}
      : { requestId: redactRegistryText(response.requestId) }),
    ...(response === undefined
      ? {}
      : {
          responseStatus: response.status,
          ...(response.problemCode === undefined
            ? {}
            : { problemCode: redactRegistryText(response.problemCode) }),
        }),
  };
};

/**
 * Aggregate the failures of a publish run into one. A shared category and a
 * retryable verdict survive; a mixed set is reported as internal so no caller
 * reads a specific recovery into it.
 */
export const aggregatePublishFailure = (
  failedCount: number,
  failures: ReadonlyArray<PublishFailure>,
): PublishFailed => {
  const [first] = failures;
  const allRetryable = failures.length > 0 && failures.every(isRetryablePublishFailure);
  const category: OperationErrorCategory =
    first !== undefined &&
    (allRetryable ||
      failures.every(
        (failure) => publishFailureCategory(failure) === publishFailureCategory(first),
      ))
      ? publishFailureCategory(first)
      : "internal";
  return new PublishFailed({
    category,
    detail: `Failed to publish ${failedCount} extension${failedCount === 1 ? "" : "s"}${
      first !== undefined && category !== "internal" ? `: ${publishFailureDetail(first)}` : ""
    }`,
    ...(first !== undefined && category !== "internal"
      ? { suggestions: publishFailureSuggestions(first) }
      : {}),
  });
};
