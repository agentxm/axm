import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Option from "effect/Option";
import { CredentialStore, PendingDeviceLoginStore } from "axm.sh/specification-harness";
import { handleLogin } from "axm.sh/specification-harness";
import { authRegistry, loginOptions, makeAuthSpecContext } from "../../support/auth-harness.js";

export const specification = defineSpecification({
  requirement: "cli/login/starts-resumable-device-sign-in",
  title: "Unattended device sign-in returns the human action",
  statement:
    "When device sign-in starts unattended, AXM shall retain the pending authorization and return its verification URL, user code, expiry, requested scopes, and resume command without waiting for approval or opening a browser.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/auth/login.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Unattended device sign-in", () => {
  it.effect("returns the action without credentials or polling", () => {
    const context = makeAuthSpecContext();
    return context.provide(
      Effect.gen(function* () {
        yield* handleLogin(loginOptions);
        const pending = yield* (yield* PendingDeviceLoginStore).load();
        expect(Option.isSome(pending)).toBe(true);
        expect(Option.isNone(yield* (yield* CredentialStore).load(authRegistry))).toBe(true);
        expect(context.polledCodes).toEqual([]);
        expect(context.deviceInteractionState.openBrowserCalls).toEqual([]);
        expect(context.deviceInteractionState.copyToClipboardCalls).toEqual([]);
        expect(context.rendererState.results).toHaveLength(1);
        expect(context.rendererState.results[0]?.data).toMatchObject({
          result: {
            status: "pending-human",
            blockedOn: "human",
            retryable: true,
            verificationUri: "https://identity.example.test/device",
            verificationUriComplete: "https://identity.example.test/device?user_code=ABCD-1234",
            userCode: "ABCD-1234",
            requestedScopes: context.requestedScopes[0],
            expiresAt: "1970-01-01T00:01:00.000Z",
            resume: "axm login --wait --json",
          },
        });
        expect(JSON.stringify(context.rendererState.results)).not.toContain(
          "fixture-device-secret",
        );
      }),
    );
  });
});
