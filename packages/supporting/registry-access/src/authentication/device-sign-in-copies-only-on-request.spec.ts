import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { login } from "./login.js";
import { authRegistry, deviceLoginRequest, makeAuthPorts } from "./test-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/device-sign-in-copies-only-on-request",
  title: "Device sign-in leaves the clipboard alone unless asked",
  statement:
    "Device sign-in shall not write to the clipboard unless the person asks for a copy while the sign-in waits.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-access/src/authentication/device-login.ts"],
  supersedes: [],
  assumptions: [
    "The copy a person asks for runs through the application's wait, which this capability does not drive; the examples observe that the sign-in itself never copies.",
  ],
  openQuestions: [],
});

const interactiveRequest = (overrides: Parameters<typeof deviceLoginRequest>[0] = {}) =>
  deviceLoginRequest({ nonInteractive: false, machineOutput: false, ...overrides });

describe("Device sign-in and the clipboard", () => {
  it.effect("a waited sign-in presents the code without copying it", () => {
    const ports = makeAuthPorts();
    return Effect.gen(function* () {
      yield* login(interactiveRequest(), authRegistry);

      expect(ports.presenterState.handoffs).toHaveLength(1);
      expect(ports.deviceInteractionState.copyToClipboardCalls).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });

  it.effect("a bounded wait a person watches copies nothing", () => {
    const ports = makeAuthPorts();
    return Effect.gen(function* () {
      yield* login(interactiveRequest({ waitForHumanSeconds: 300 }), authRegistry);

      expect(ports.presenterState.handoffs).toHaveLength(1);
      expect(ports.deviceInteractionState.copyToClipboardCalls).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });

  it.effect("a sign-in nothing waits on copies nothing", () => {
    const ports = makeAuthPorts();
    return Effect.gen(function* () {
      yield* login(interactiveRequest({ nonInteractive: true }), authRegistry);

      expect(ports.presenterState.pendingApprovals).toHaveLength(1);
      expect(ports.deviceInteractionState.copyToClipboardCalls).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });
});
