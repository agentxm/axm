/**
 * Recoveries for a refusal of a trusted publisher's workload token.
 *
 * The Registry's forbidding rules come with recoveries written for a person's
 * own credential: use your signed-in session. A GitHub Actions job has no
 * session to fall back to; what its workload token may do is the trusted
 * publisher's permission document, so a refusal of those limits points there.
 * The Registry client stays unaware of credentials: the application records
 * which source the invocation's credential comes from and rewrites the
 * recovery where it renders failures.
 */

import * as ServiceMap from "effect/Context";
import * as Option from "effect/Option";

import { TRUSTED_PUBLISHER_SETTINGS_URL } from "@agentxm/registry-access/authentication";
import type { AmbientCredentialSource } from "@agentxm/registry-access/credentials";
import {
  makeStepFailure,
  type FailureMetadata,
  type StepFailure,
} from "@agentxm/workspace-kernel/operations";

import { AppError } from "./app-error.js";

/**
 * Where this invocation's credential for its default Registry comes from,
 * decided once when the invocation starts. None when the credential, if any,
 * is a stored session.
 */
export const InvocationCredentialSource: ServiceMap.Reference<
  Option.Option<AmbientCredentialSource>
> = ServiceMap.Reference<Option.Option<AmbientCredentialSource>>(
  "@agentxm/axm/InvocationCredentialSource",
  { defaultValue: () => Option.none() },
);

const TRUSTED_PUBLISHER_RECOVERY = {
  description: "Adjust the trusted publisher's permissions in AgentXM settings.",
  url: TRUSTED_PUBLISHER_SETTINGS_URL,
} as const;

/**
 * The forbidding rules a trusted publisher's permission document decides: the
 * credential's scope and resource limits, and every publish refusal except an
 * exhausted quota, which no permission changes.
 */
const decidedByTrustedPublisher = (problemCode: string): boolean =>
  problemCode === "insufficient_scope" ||
  problemCode === "resource_restriction" ||
  (problemCode.startsWith("publish/") && problemCode !== "publish/quota-exceeded");

interface RenderedRefusal {
  readonly metadata?: FailureMetadata | undefined;
}

const refusedByTrustedPublisher = (
  source: Option.Option<AmbientCredentialSource>,
  failure: RenderedRefusal,
): boolean => {
  const response = failure.metadata?.response;
  return (
    Option.contains(source, "github-actions") &&
    response?.status === 403 &&
    response.problemCode !== undefined &&
    decidedByTrustedPublisher(response.problemCode)
  );
};

/** A step failure as it reads for this invocation's credential source. */
export const stepFailureForCredentialSource = (
  source: Option.Option<AmbientCredentialSource>,
  failure: StepFailure,
): StepFailure =>
  refusedByTrustedPublisher(source, failure)
    ? makeStepFailure({
        category: failure.category,
        title: failure.title,
        detail: failure.detail,
        problem: failure.problem,
        metadata: failure.metadata,
        retryable: failure.retryable,
        status: failure.status,
        blockedOn: failure.blockedOn,
        action: failure.action,
        inputs: failure.inputs,
        suggestions: [TRUSTED_PUBLISHER_RECOVERY],
        cause: failure.cause,
      })
    : failure;

/** A command's failure as it reads for this invocation's credential source. */
export const appErrorForCredentialSource = (
  source: Option.Option<AmbientCredentialSource>,
  error: AppError,
): AppError =>
  refusedByTrustedPublisher(source, error)
    ? new AppError({
        code: error.code,
        title: error.title,
        detail: error.detail,
        ...(error.metadata === undefined ? {} : { metadata: error.metadata }),
        ...(error.status === undefined ? {} : { status: error.status }),
        ...(error.retryable === undefined ? {} : { retryable: error.retryable }),
        ...(error.blockedOn === undefined ? {} : { blockedOn: error.blockedOn }),
        ...(error.action === undefined ? {} : { action: error.action }),
        ...(error.problem === undefined ? {} : { problem: error.problem }),
        ...(error.inputs === undefined ? {} : { inputs: error.inputs }),
        suggestions: [TRUSTED_PUBLISHER_RECOVERY],
        cause: error.cause,
      })
    : error;
