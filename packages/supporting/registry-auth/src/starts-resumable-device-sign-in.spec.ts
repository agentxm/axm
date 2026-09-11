import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";

import { CredentialStore } from "./credential-store.js";
import { DeviceLoginPendingResultSchema } from "./device-login.js";
import { login } from "./login.js";
import { PendingDeviceLoginStore } from "./pending-device-login-store.js";
import {
  authRegistry,
  deviceLoginRequest,
  machineOutputPresenter,
  makeAuthPorts,
} from "./spec-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/starts-resumable-device-sign-in",
  title: "Unattended device sign-in returns the human action",
  statement:
    "When device sign-in starts unattended, AXM shall retain the pending authorization and return its verification URL, user code, expiry, requested scopes, and resume command without waiting for approval or opening a browser.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-auth/src/device-login.ts"],
  supersedes: [],
  assumptions: [
    "Machine output is the presenter consuming the pending device-login document; the application's renderer-backed presenter implements that port contract.",
  ],
  openQuestions: [],
});

describe("Unattended device sign-in", () => {
  it.effect("returns the action without credentials or polling", () => {
    const ports = makeAuthPorts({ presenter: machineOutputPresenter });
    return Effect.gen(function* () {
      yield* login(deviceLoginRequest(), authRegistry);

      const pending = yield* (yield* PendingDeviceLoginStore).load();
      expect(Option.isSome(pending)).toBe(true);
      expect(Option.isNone(yield* (yield* CredentialStore).load(authRegistry))).toBe(true);
      expect(ports.polledCodes).toEqual([]);
      expect(ports.deviceInteractionState.openBrowserCalls).toEqual([]);
      expect(ports.deviceInteractionState.copyToClipboardCalls).toEqual([]);
      // Machine output consumed the document, so nothing was presented to a person.
      expect(ports.presenterState.deviceFlowPresentations).toEqual([]);
      expect(ports.presenterState.pendingApprovals).toEqual([]);

      expect(ports.presenterState.pendingEmissions).toHaveLength(1);
      const emitted = ports.presenterState.pendingEmissions[0];
      expect(Schema.encodeUnknownSync(DeviceLoginPendingResultSchema)(emitted)).toMatchObject({
        status: "pending-human",
        blockedOn: "human",
        retryable: true,
        verificationUri: "https://identity.example.test/device",
        verificationUriComplete: "https://identity.example.test/device?user_code=ABCD-1234",
        userCode: "ABCD-1234",
        requestedScopes: ports.requestedScopes[0],
        expiresAt: "1970-01-01T00:01:00.000Z",
        resume: "axm login --wait --json",
      });
      expect(JSON.stringify(ports.presenterState.pendingEmissions)).not.toContain(
        "fixture-device-secret",
      );
    }).pipe(Effect.provide(ports.layer));
  });
});
