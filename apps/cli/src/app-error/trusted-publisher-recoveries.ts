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

import { trustedPublisherSettingsUrl } from "@agentxm/registry-access/authentication";
import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import type { GeneratedRegistryClient } from "@agentxm/registry-client";
import type { AmbientCredentialSource } from "@agentxm/registry-access/credentials";
import {
  makeStepFailure,
  type FailureMetadata,
  type StepFailure,
} from "@agentxm/workspace-kernel/operations";

import { AppError, makeAppError } from "./app-error.js";

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

const trustedPublisherRecovery = (failure: RenderedRefusal) => {
  const requestUrl = failure.metadata?.request?.url;
  if (requestUrl === undefined || !URL.canParse(requestUrl)) return undefined;
  const url = new URL(requestUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  return {
    description: "Adjust the trusted publisher's permissions in AgentXM settings.",
    url: trustedPublisherSettingsUrl(decodeHttpRegistryEndpointSync(url.origin)),
  };
};

/**
 * The forbidding rules a trusted publisher's permission document decides: the
 * credential's scope and resource limits, and publish permissions. Quotas and
 * plan limits retain their own recovery because permission changes do not raise them.
 */
const DECIDED_BY_TRUSTED_PUBLISHER: ReadonlySet<string> = new Set([
  "insufficient_scope",
  "resource_restriction",
  "publish_insufficient_scope",
  "publish_resource_restriction",
  "publish_handle_not_owned",
  "publish_publish_forbidden",
] satisfies ReadonlyArray<GeneratedRegistryClient.ForbiddenErrorEncoded["code"]>);

const decidedByTrustedPublisher = (problemCode: string): boolean =>
  DECIDED_BY_TRUSTED_PUBLISHER.has(problemCode);

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
): StepFailure => {
  const recovery = trustedPublisherRecovery(failure);
  return recovery !== undefined && refusedByTrustedPublisher(source, failure)
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
        suggestions: [recovery],
        cause: failure.cause,
      })
    : failure;
};

/** A command's failure as it reads for this invocation's credential source. */
export const appErrorForCredentialSource = (
  source: Option.Option<AmbientCredentialSource>,
  error: AppError,
): AppError => {
  const recovery = trustedPublisherRecovery(error);
  return recovery !== undefined && refusedByTrustedPublisher(source, error)
    ? makeAppError({ ...error, cause: error.cause, suggestions: [recovery] })
    : error;
};
