/**
 * The rendering of the Registry access failure family — sign-in state, device
 * authorization, token policy, and the access failures a challenged remote
 * write settles with — into the one rendered failure a plan step settles with
 * and the application boundary projects.
 *
 * A pending verification keeps its handoff rather than degrading to an
 * internal error, and a failure reads the same whether it surfaces from a
 * publish step or from a sign-in command.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  REGISTRY_ACCESS_ERROR_CATEGORIES,
  isRegistryAccessFailure,
  type RegistryAccessFailure,
} from "@agentxm/registry-access/authentication";

import {
  makeStepFailure,
  type OperationErrorCategory,
  type StepFailure,
} from "../operations/index.js";
import { resolutionFailureToStepFailure } from "../planning/index.js";

// The registry-access category vocabulary and the kernel's must stay the
// same strings; divergence is a compile error here, at the renderer that
// carries them over.
REGISTRY_ACCESS_ERROR_CATEGORIES satisfies ReadonlyArray<OperationErrorCategory>;

const TOKEN_SETTINGS_URL = "https://agentxm.ai/u/settings/tokens";

/** Sign-in runs for the whole installation, never narrowed to a workspace scope. */
const signIn = (description: string, cmd: string) =>
  ({ description, cmd, commandScope: "global" }) as const;

const minutes = (count: number): string => (count === 1 ? "1 minute" : `${String(count)} minutes`);

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
            "Start a non-blocking sign-in with a code and ask a person to approve it.",
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
        detail: "Sign-in canceled in the browser. Nothing changed.",
        suggestions: [signIn("Try signing in again.", "axm login")],
      });
    case "DeviceLoginCodeExpired":
      return makeStepFailure({
        category: "auth",
        detail: "That code expired. Run axm login to get a new one.",
        suggestions: [signIn("Try signing in again.", "axm login")],
      });
    case "DeviceAuthorizationPending":
      return makeStepFailure({
        category: "timeout",
        // However the wait ended, the code is untouched and the next sign-in
        // picks it up, so a stopped wait and an elapsed one read the same.
        detail: `Stopped waiting. The code is still good for ${minutes(error.minutesLeft)}. Run axm login to pick up where you left off.`,
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
        suggestions: [signIn("Pick up the sign-in where you left off.", error.resume)],
      });
    case "AuthInteractionAbandoned":
      return makeStepFailure({ category: "usage", detail: error.message });
    case "WorkloadTokenUnavailable":
      // A CI job whose identity no trusted publisher accepts cannot sign in
      // on its own; a person changes the job's permissions or registers it.
      return makeStepFailure({
        category: "auth_required",
        detail: error.detail,
        blockedOn: "human",
        suggestions: error.suggestions,
        cause: error.cause,
      });
    case "AuthExchangeFailed": {
      // The flow assigns auth semantics to a token-exchange transport
      // failure: its own sentence and recoveries over the transport's
      // evidence and cause.
      const transport = resolutionFailureToStepFailure(error.cause);
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
