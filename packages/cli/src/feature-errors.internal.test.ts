/**
 * Envelope pinning for the registry-auth boundary conversions. The auth
 * feature's internal tests assert typed failures; the byte-for-byte envelope
 * contract that used to live at the construction sites is pinned here, in the
 * one place that owns the mapping.
 */

import { describe, expect, it } from "vitest";

import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import {
  AuthExchangeFailed,
  AuthLoginRequired,
  AuthTokenPolicyRequired,
  DeviceAuthorizationPending,
  DeviceLoginCodeExpired,
  DeviceLoginDenied,
  RegistryAuthFailed,
  StepUpRequired,
} from "@agentxm/registry-auth";
import { RegistryRequestFailed } from "@agentxm/registry-client";

import {
  authExchangeFailedToAppError,
  authFailureToAppError,
  authLoginRequiredToAppError,
  authTokenPolicyRequiredToAppError,
  deviceAuthorizationPendingToAppError,
  deviceLoginCodeExpiredToAppError,
  deviceLoginDeniedToAppError,
  registryAuthFailedToAppError,
  stepUpRequiredToAppError,
} from "./feature-errors.js";

describe("registry-auth envelope conversions", () => {
  it("carries a policy failure's category, wording, and recovery over 1:1", () => {
    const error = registryAuthFailedToAppError(
      new RegistryAuthFailed({
        category: "auth_expired",
        detail: "The step-up request expired before verification completed.",
        recover: "Rerun the command to start a new verification request.",
      }),
    );
    expect(error.code).toBe("auth_expired");
    expect(error.title).toBe("Authentication Expired");
    expect(error.detail).toBe("The step-up request expired before verification completed.");
    expect(error.suggestions).toEqual([
      { description: "Rerun the command to start a new verification request." },
    ]);
  });

  it("converts a typed auth failure in cause position into the nested envelope", () => {
    const error = registryAuthFailedToAppError(
      new RegistryAuthFailed({
        category: "auth_expired",
        detail: "The pending device sign-in expired. No credentials were changed.",
        suggestions: [
          {
            description: "Request a new device sign-in code.",
            cmd: "axm login --device-code --json",
          },
        ],
        cause: new DeviceLoginCodeExpired(),
      }),
    );
    expect(error.cause).toMatchObject({
      _tag: "AppError",
      code: "auth",
      detail: "Login code expired",
    });
  });

  it("renders the sign-in-required envelope exactly as the shared builder", () => {
    const error = authLoginRequiredToAppError(
      new AuthLoginRequired({ message: "Not authenticated" }),
    );
    expect(error.code).toBe("auth_required");
    expect(error.detail).toBe("Not authenticated");
    expect(error.blockedOn).toBe("human");
    expect(error.suggestions).toEqual([
      {
        description: "Start a non-blocking device sign-in and ask a person to approve it.",
        cmd: "axm login --device-code --json",
      },
      {
        description: "Create a personal access token in AgentXM.ai.",
        url: "https://agentxm.ai/u/settings/tokens",
      },
    ]);
  });

  it("renders the ambient-token-policy envelope exactly as the former builder", () => {
    const error = authTokenPolicyRequiredToAppError(new AuthTokenPolicyRequired({}));
    expect(error.code).toBe("auth_required");
    expect(error.detail).toBe("No authentication token is available.");
    expect(error.blockedOn).toBe("human");
    expect(error.suggestions).toEqual([
      {
        description:
          "Set AXM_TOKEN_FILE (preferred) or AXM_TOKEN for non-interactive authentication.",
      },
      {
        description: "Create a personal access token in AgentXM.ai.",
        url: "https://agentxm.ai/u/settings/tokens",
      },
    ]);
  });

  it("renders the device-login terminal outcomes verbatim", () => {
    const denied = deviceLoginDeniedToAppError(new DeviceLoginDenied());
    expect(denied.code).toBe("auth");
    expect(denied.detail).toBe("Login was denied or cancelled");
    expect(denied.suggestions).toEqual([
      { description: "Try signing in again.", cmd: "axm login" },
    ]);

    const expired = deviceLoginCodeExpiredToAppError(new DeviceLoginCodeExpired());
    expect(expired.code).toBe("auth");
    expect(expired.detail).toBe("Login code expired");
    expect(expired.suggestions).toEqual([
      { description: "Try signing in again.", cmd: "axm login" },
    ]);
  });

  it("renders the pending-human timeout envelope with the full open-url action", () => {
    const error = deviceAuthorizationPendingToAppError(
      new DeviceAuthorizationPending({
        timeoutSeconds: 30,
        verificationUri: "https://auth.agentxm.ai/device",
        verificationUriComplete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
        userCode: "ABCD-1234",
        expiresAt: "2026-08-10T16:05:00.000Z",
        resume: "axm login --wait --json",
      }),
    );
    expect(error.code).toBe("timeout");
    expect(error.status).toBe("pending-human");
    expect(error.retryable).toBe(true);
    expect(error.blockedOn).toBe("human");
    expect(error.action).toEqual({
      kind: "open-url",
      url: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
      fallbackUrl: "https://auth.agentxm.ai/device",
      code: "ABCD-1234",
      expiresAt: "2026-08-10T16:05:00.000Z",
      resume: "axm login --wait --json",
    });
    expect(error.detail).toBe(
      "Device sign-in did not complete within 30 seconds. The pending flow is still available.",
    );
    expect(error.suggestions).toEqual([
      { description: "Resume waiting after approval.", cmd: "axm login --wait --json" },
    ]);
  });

  it("restores step-up metadata and cause from the carried transport failure", () => {
    const failure = new RegistryRequestFailed({
      category: "auth",
      detail: "Could not create token",
      metadata: { response: { status: 401, body: { code: "eotp" } } },
      cause: "original transport cause",
    });
    const error = stepUpRequiredToAppError(
      new StepUpRequired({
        stepUp: {
          requestId: "step_1",
          verificationUrl: "https://agentxm.ai/step-up/step_1",
          statusUrl: "https://registry.agentxm.ai/v1/auth/step-up/requests/step_1",
          expiresAt: "2026-08-10T16:05:00.000Z",
          intervalSeconds: 2,
          action: "Create access token",
          target: "ci-admin",
        },
        failure,
      }),
    );
    expect(error.code).toBe("auth_required");
    expect(error.detail).toBe("Step-up authentication is required");
    expect(error.blockedOn).toBe("human");
    expect(error.action).toEqual({
      kind: "open-url",
      url: "https://agentxm.ai/step-up/step_1",
      expiresAt: "2026-08-10T16:05:00.000Z",
    });
    expect(error.metadata).toEqual({ response: { status: 401, body: { code: "eotp" } } });
    expect(error.suggestions).toEqual([
      {
        description:
          "Complete verification while the command is waiting, or rerun the command to restart.",
      },
    ]);
    expect(error.cause).toBe("original transport cause");
  });

  it("overlays exchange semantics while keeping the mapped failure's title and metadata", () => {
    const error = authExchangeFailedToAppError(
      new AuthExchangeFailed({
        detail: "Token refresh request failed",
        suggestions: [{ description: "Sign in again.", cmd: "axm login" }],
        failure: new RegistryRequestFailed({
          category: "network",
          detail: "Token exchange failed: the Registry could not be reached.",
          cause: "socket closed",
        }),
      }),
    );
    expect(error.code).toBe("auth");
    // The former in-place conversion froze the title at the pre-overlay
    // category's default; the overlay preserves it.
    expect(error.title).toBe("Network Error");
    expect(error.detail).toBe("Token refresh request failed");
    expect(error.suggestions).toEqual([{ description: "Sign in again.", cmd: "axm login" }]);
    expect(error.cause).toBe("socket closed");
  });

  it("passes envelopes through and wraps unknown failures as internal", () => {
    const envelope = makeAppError({ code: "usage", detail: "bad flags" });
    expect(authFailureToAppError(envelope)).toBe(envelope);

    const registry = authFailureToAppError(
      new RegistryRequestFailed({ category: "not_found", detail: "missing" }),
    );
    expect(registry.code).toBe("not_found");
    expect(registry.detail).toBe("missing");

    const unknown = authFailureToAppError("boom");
    expect(unknown.code).toBe("internal");
    expect(unknown.detail).toBe("boom");
  });
});
