import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import { login } from "./login.js";
import {
  authSelectedRegistry,
  deviceLoginRequest,
  makeAuthPorts,
} from "./test-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/new-account-opens-account-creation",
  title: "New-account sign-in opens account creation",
  statement:
    "When login requests a new account, AXM shall carry prompt=create on the browser authorization request and, when using a device code, tell the person to use Sign up on the sign-in page without changing the device verification link or emitting prose in machine output.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption"],
  boundary: "platform",
  boundaryRationale:
    "Browser selection creates a native loopback listener; the authorization and presentation ports are observed in memory.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("New-account sign-in", () => {
  it.effect.each([false, true])(
    "carries the browser creation intent when newAccount=%s",
    (newAccount) => {
      const prompts: Array<string | undefined> = [];
      const ports = makeAuthPorts({
        environment: { BROWSER: "fixture-browser" },
        auth: {
          buildAuthorizeUrl: (_endpoint, input) => {
            prompts.push(input.prompt);
            return "https://identity.example.test/oauth/authorize";
          },
        },
        presenter: { abandonWaits: true },
      });
      return Effect.gen(function* () {
        yield* Effect.flip(
          login(
            deviceLoginRequest({
              newAccount,
              deviceCode: false,
              unattended: false,
              machineOutput: false,
            }),
            authSelectedRegistry,
          ),
        );
        expect(prompts).toEqual([newAccount ? "create" : undefined]);
      }).pipe(Effect.provide(ports.layer));
    },
  );

  it.effect.each([false, true])(
    "shows device creation guidance according to machineOutput=%s",
    (machineOutput) => {
      const ports = makeAuthPorts();
      return Effect.gen(function* () {
        yield* login(
          deviceLoginRequest({ newAccount: true, machineOutput, unattended: false }),
          authSelectedRegistry,
        );
        expect(ports.presenterState.newAccountDeviceSignIns).toEqual(machineOutput ? [] : [true]);
        expect(ports.deviceAuthorizations).toHaveLength(1);
      }).pipe(Effect.provide(ports.layer));
    },
  );
});
