/**
 * Envelope pinning for the Registry access family. The kernel renders every
 * access failure once; this file pins the envelope the CLI projects from that
 * rendering, byte-for-byte where the former in-place conversions were pinned.
 */

import { describe, expect, it } from "vitest";

import { makeAppError } from "./app-error/index.js";
import {
  AuthExchangeFailed,
  SignedOut,
  AuthTokenPolicyRequired,
  DeviceAuthorizationPending,
  DeviceLoginCodeExpired,
  DeviceLoginDenied,
  RegistryAccessFailed,
  StepUpRequired,
} from "@agentxm/registry-access/authentication";
import { RegistryRequestFailed } from "@agentxm/registry-client";

import { failureToAppError } from "./app-error/conversions.js";
import { coerceAuthFailure } from "./feature-errors.js";

describe("registry-access envelope projection", () => {
  it("carries a policy failure's category, wording, and recovery over 1:1", () => {
    const error = failureToAppError(
      new RegistryAccessFailed({
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

  it("renders a typed auth failure in cause position as the kernel renders it alone", () => {
    const error = failureToAppError(
      new RegistryAccessFailed({
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
      _tag: "StepFailure",
      category: "auth",
      detail: "Login code expired",
    });
  });

  it("renders the signed-out envelope with the command that ends it", () => {
    const error = failureToAppError(new SignedOut({ message: "You are not signed in." }));
    expect(error.code).toBe("auth_required");
    expect(error.detail).toBe("You are not signed in.");
    expect(error.blockedOn).toBe("human");
    expect(error.suggestions).toEqual([
      { description: "Sign in.", cmd: "axm login", commandScope: "global" },
      {
        description: "Start a non-blocking device sign-in and ask a person to approve it.",
        cmd: "axm login --device-code --json",
        commandScope: "global",
      },
      {
        description: "Create a personal access token in AgentXM.ai.",
        url: "https://agentxm.ai/u/settings/tokens",
      },
    ]);
  });

  it("renders the ambient-token-policy envelope", () => {
    const error = failureToAppError(new AuthTokenPolicyRequired({}));
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
    const denied = failureToAppError(new DeviceLoginDenied());
    expect(denied.code).toBe("auth");
    expect(denied.detail).toBe("Login was denied or cancelled");
    expect(denied.suggestions).toEqual([
      { description: "Try signing in again.", cmd: "axm login", commandScope: "global" },
    ]);

    const expired = failureToAppError(new DeviceLoginCodeExpired());
    expect(expired.code).toBe("auth");
    expect(expired.detail).toBe("Login code expired");
    expect(expired.suggestions).toEqual([
      { description: "Try signing in again.", cmd: "axm login", commandScope: "global" },
    ]);
  });

  it("renders the pending-human timeout envelope with the full open-url action", () => {
    const error = failureToAppError(
      new DeviceAuthorizationPending({
        registryUrl: "https://registry.example.test",
        intervalSeconds: 2,
        waitEnded: { _tag: "Elapsed", seconds: 30 },
        verificationUri: "https://auth.agentxm.ai/device",
        verificationUriComplete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
        userCode: "ABCD-1234",
        expiresAt: "2026-08-10T16:05:00.000Z",
        resume: "axm login --device-code --wait-for-human 300 --json",
      }),
    );
    expect(error.code).toBe("timeout");
    expect(error.status).toBe("pending-human");
    expect(error.retryable).toBe(true);
    expect(error.blockedOn).toBe("human");
    expect(error.action).toEqual({
      kind: "open-url",
      purpose: "login",
      registryUrl: "https://registry.example.test",
      requestRef: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
      intervalSeconds: 2,
      url: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
      fallbackUrl: "https://auth.agentxm.ai/device",
      code: "ABCD-1234",
      expiresAt: "2026-08-10T16:05:00.000Z",
      resume: "axm login --device-code --wait-for-human 300 --json",
    });
    expect(error.detail).toBe(
      "Device sign-in did not complete within 30 seconds. The pending flow is still available.",
    );
    expect(error.suggestions).toEqual([
      {
        description: "Resume waiting after approval.",
        cmd: "axm login --device-code --wait-for-human 300 --json",
        commandScope: "global",
      },
    ]);
  });

  it("restores step-up metadata and cause from the carried transport failure", () => {
    const failure = new RegistryRequestFailed({
      category: "auth",
      detail: "Could not create token",
      metadata: { response: { status: 401, body: { code: "eotp" } } },
      cause: "original transport cause",
    });
    const error = failureToAppError(
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

  it("overlays exchange semantics while keeping the transport failure's evidence", () => {
    const error = failureToAppError(
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
    expect(error.title).toBe("Unauthorized");
    expect(error.detail).toBe("Token refresh request failed");
    expect(error.suggestions).toEqual([
      { description: "Sign in again.", cmd: "axm login", commandScope: "global" },
    ]);
    expect(error.cause).toBe("socket closed");
  });

  it("passes envelopes through and leaves other expected failures untouched", () => {
    const envelope = makeAppError({ code: "usage", detail: "bad flags" });
    expect(coerceAuthFailure(envelope)).toBe(envelope);

    const registry = failureToAppError(
      new RegistryRequestFailed({ category: "not_found", detail: "missing" }),
    );
    expect(registry.code).toBe("not_found");
    expect(registry.detail).toBe("missing");

    const unknown = failureToAppError("boom");
    expect(unknown.code).toBe("internal");
    expect(unknown.detail).toBe("boom");
  });
});
