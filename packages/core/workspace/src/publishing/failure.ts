/**
 * The failure vocabulary a publish use case surfaces, and the redacted,
 * machine-readable cause the publish result reports for a step that actually
 * failed.
 *
 * The kernel renders every publish failure once; this module reads that
 * rendering to build the document's cause and to aggregate a run's failures.
 * It words nothing itself.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  collectSensitiveStrings,
  isRegistryClientFailure,
  redactRegistryText,
} from "@agentxm/registry-client";
import type { RegistryClientFailure } from "@agentxm/registry-client";
import { ConfigError } from "effect/Config";
import { workspaceFailureToStepFailure } from "../reconciliation/failure-rendering.js";
import type { OperationErrorCategory, StepFailure } from "../transitions/planning/index.js";

import { PublishFailed } from "./errors.js";

/** Every typed failure a publish use case can surface. */
export type PublishFailure = PublishFailed | RegistryClientFailure | ConfigError;

export const isPublishFailure = (error: unknown): error is PublishFailure =>
  error instanceof PublishFailed || error instanceof ConfigError || isRegistryClientFailure(error);

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

/** The kernel's rendering of a publish failure, which every reading below shares. */
const rendered = (failure: PublishFailure): StepFailure => workspaceFailureToStepFailure(failure);

/** True when the request policy proved the failure worth retrying. */
export const isRetryablePublishFailure = (failure: PublishFailure): boolean =>
  rendered(failure).metadata?.requestPolicy?.retryable === true;

/** The Registry problem code, when the failure carried one. */
export const publishFailureProblemCode = (failure: PublishFailure): string | undefined =>
  rendered(failure).metadata?.response?.problemCode;

/** The Registry lifecycle reason carried by a typed publication refusal. */
export const publishFailureLifecycleReason = (
  failure: PublishFailure,
): "deleting" | "held" | "archived" | undefined => {
  const response = rendered(failure).metadata?.response;
  const body = response?.body;
  if (
    response?.problemCode !== "lifecycle_blocked" ||
    typeof body !== "object" ||
    body === null ||
    !("reason" in body)
  )
    return undefined;
  return body.reason === "deleting" || body.reason === "held" || body.reason === "archived"
    ? body.reason
    : undefined;
};

/**
 * The redacted cause the publish document reports. Only evidence the Registry
 * or the request policy established is carried; credential shapes in
 * Registry-supplied text, and the exact credentials the response carried
 * under sensitive keys, are redacted before they reach durable output.
 */
export const publishCause = (failure: PublishFailure) => {
  const step = rendered(failure);
  const policy = step.metadata?.requestPolicy;
  const response = step.metadata?.response;
  const secrets = collectSensitiveStrings(step.metadata);
  return {
    code: step.category,
    class: CAUSE_CLASS_BY_CATEGORY[step.category],
    message: redactRegistryText(step.detail, { secrets }),
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
      : { requestId: redactRegistryText(response.requestId, { secrets }) }),
    ...(response === undefined
      ? {}
      : {
          responseStatus: response.status,
          ...(response.problemCode === undefined
            ? {}
            : { problemCode: redactRegistryText(response.problemCode, { secrets }) }),
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
  const steps = failures.map(rendered);
  const [firstStep] = steps;
  const allRetryable = failures.length > 0 && failures.every(isRetryablePublishFailure);
  const category: OperationErrorCategory =
    first !== undefined &&
    firstStep !== undefined &&
    (allRetryable || steps.every((step) => step.category === firstStep.category))
      ? firstStep.category
      : "internal";
  return new PublishFailed({
    category,
    detail: `Failed to publish ${failedCount} extension${failedCount === 1 ? "" : "s"}${
      firstStep !== undefined && category !== "internal" ? `: ${firstStep.detail}` : ""
    }`,
    ...(firstStep?.suggestions !== undefined && category !== "internal"
      ? { suggestions: firstStep.suggestions }
      : {}),
  });
};
