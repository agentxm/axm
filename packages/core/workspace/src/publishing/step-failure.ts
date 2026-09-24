/**
 * The rendering of the publish failure family — publish policy refusals and
 * the Registry access failures a challenged remote write settles with — into
 * the one rendered failure a plan step settles with and the application
 * boundary projects.
 *
 * Publishing is the workspace feature whose remote writes are authorized and
 * may be challenged, so the access family renders here beside the feature's
 * own refusal: a pending verification keeps its handoff rather than degrading
 * to an internal error, and it reads the same whether it surfaces from a
 * publish step or from a sign-in command.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  REGISTRY_ACCESS_ERROR_CATEGORIES,
  isRegistryAccessFailure,
  type RegistryAccessFailure,
} from "@agentxm/registry-access/authentication";

import { resolutionFailureToStepFailure } from "../materialization/resolution-step-failure.js";
import {
  makeStepFailure,
  type OperationErrorCategory,
  type StepFailure,
} from "../transitions/planning/plan/errors.js";

import type { PublishFailed } from "./errors.js";

// The registry-access category vocabulary and the kernel's must stay the
// same strings; divergence is a compile error here, at the renderer that
// carries them over.
REGISTRY_ACCESS_ERROR_CATEGORIES satisfies ReadonlyArray<OperationErrorCategory>;

/** Every failure publishing and Registry access construct. */
export type PublishFamilyFailure = PublishFailed | RegistryAccessFailure;

const TOKEN_SETTINGS_URL = "https://agentxm.ai/u/settings/tokens";

/** Sign-in runs for the whole installation, never narrowed to a workspace scope. */
const signIn = (description: string, cmd: string) =>
  ({ description, cmd, commandScope: "global" }) as const;

/** Translate one publish policy refusal. */
export const publishFailedToStepFailure = (error: PublishFailed): StepFailure =>
  makeStepFailure({
    category: error.category,
    detail: error.detail,
    recover: error.recover,
    cmd: error.cmd,
    suggestions: error.suggestions,
    cause: error.cause,
  });

/**
 * Translate one Registry access failure. A typed access failure in cause
 * position renders recursively, so a diagnostic chain reads each link the way
 * it would read on its own.
 */
export const registryAccessFailureToStepFailure = (error: RegistryAccessFailure): StepFailure => {
  switch (error._tag) {
    case "RegistryAccessFailed":
      return makeStepFailure({
        category: error.category,
        detail: error.detail,
        recover: error.recover,
        cmd: error.cmd,
        suggestions: error.suggestions,
        cause: isRegistryAccessFailure(error.cause)
          ? registryAccessFailureToStepFailure(error.cause)
          : error.cause,
      });
    case "SignedOut":
      // The one result for being signed out: there are two states, so there
      // is one way to report the first, with the command that ends it. The
      // device-code form is carried alongside for an invocation that has no
      // terminal of its own to run a browser sign-in from, and a token for
      // one that cannot sign in at all.
      return makeStepFailure({
        category: "auth_required",
        detail: error.message,
        blockedOn: "human",
        suggestions: [
          signIn("Sign in.", "axm login"),
          signIn(
            "Start a non-blocking device sign-in and ask a person to approve it.",
            "axm login --device-code --json",
          ),
          { description: "Create a personal access token in AgentXM.ai.", url: TOKEN_SETTINGS_URL },
        ],
        cause: error.cause,
      });
    case "AuthTokenPolicyRequired":
      return makeStepFailure({
        category: "auth_required",
        detail: "No authentication token is available.",
        blockedOn: "human",
        suggestions: [
          {
            description:
              "Set AXM_TOKEN_FILE (preferred) or AXM_TOKEN for non-interactive authentication.",
          },
          { description: "Create a personal access token in AgentXM.ai.", url: TOKEN_SETTINGS_URL },
        ],
        cause: error.cause,
      });
    case "DeviceLoginDenied":
      return makeStepFailure({
        category: "auth",
        detail: "Login was denied or cancelled",
        suggestions: [signIn("Try signing in again.", "axm login")],
      });
    case "DeviceLoginCodeExpired":
      return makeStepFailure({
        category: "auth",
        detail: "Login code expired",
        suggestions: [signIn("Try signing in again.", "axm login")],
      });
    case "DeviceAuthorizationPending":
      return makeStepFailure({
        category: "timeout",
        detail:
          error.waitEnded._tag === "Stopped"
            ? "Waiting for device sign-in was stopped. The pending flow is still available."
            : `Device sign-in did not complete within ${String(error.waitEnded.seconds)} seconds. The pending flow is still available.`,
        status: "pending-human",
        retryable: true,
        blockedOn: "human",
        action: {
          kind: "open-url",
          purpose: "login",
          requestRef: error.verificationUriComplete,
          registryUrl: error.registryUrl,
          intervalSeconds: error.intervalSeconds,
          url: error.verificationUriComplete,
          fallbackUrl: error.verificationUri,
          code: error.userCode,
          expiresAt: error.expiresAt,
          resume: error.resume,
        },
        suggestions: [signIn("Resume waiting after approval.", error.resume)],
      });
    case "StepUpVerificationPending":
      return makeStepFailure({
        category: error.timedOut ? "timeout" : "auth_required",
        detail: "Human verification is pending. No challenged write has completed.",
        status: "pending-human",
        retryable: true,
        blockedOn: "human",
        action: error.action,
        recover: error.action.resume,
      });
    case "AuthInteractionAbandoned":
      return makeStepFailure({ category: "usage", detail: error.message });
    case "StepUpRequired": {
      // Evidence and cause come from the carried transport failure, rendered
      // as the kernel renders it wherever else it surfaces.
      const transport = resolutionFailureToStepFailure(error.failure);
      return makeStepFailure({
        category: "auth_required",
        detail: "Step-up authentication is required",
        blockedOn: "human",
        action: {
          kind: "open-url",
          url: error.stepUp.verificationUrl,
          expiresAt: error.stepUp.expiresAt,
        },
        metadata: transport.metadata,
        recover:
          "Complete verification while the command is waiting, or rerun the command to restart.",
        cause: transport.cause,
      });
    }
    case "AuthExchangeFailed": {
      // The flow assigns auth semantics to a token-exchange transport
      // failure: its own sentence and recoveries over the transport's
      // evidence and cause.
      const transport = resolutionFailureToStepFailure(error.failure);
      return makeStepFailure({
        category: "auth",
        detail: error.detail,
        metadata: transport.metadata,
        suggestions: error.suggestions?.map((suggestion) =>
          suggestion.cmd === undefined ? suggestion : { ...suggestion, commandScope: "global" },
        ),
        cause: transport.cause,
      });
    }
  }
};

/** Translate one publish or Registry access failure. */
export const publishFailureToStepFailure = (error: PublishFamilyFailure): StepFailure =>
  error._tag === "PublishFailed"
    ? publishFailedToStepFailure(error)
    : registryAccessFailureToStepFailure(error);
