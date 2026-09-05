import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { handleLogin } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  DEVICE_USER_CODE,
  EXISTING_ACCESS_TOKEN,
  EXISTING_HANDLE,
  LOGIN_REGISTRY_HOST,
  NEW_ACCESS_TOKEN,
  makeLoginSpecContext,
} from "../../support/login-harness.js";
import { CredentialStore } from "axm.sh/specification-harness";
import {
  authCredentialFile,
  authRegistry,
  loginOptions,
  makeAuthSpecContext,
} from "../../support/auth-harness.js";
import { probeFlag } from "../../support/parser-probe.js";

export const specification = defineSpecification({
  requirement: "cli/login/preapproval-requests-new-sign-in",
  title: "Login preapproval starts a new sign-in over a valid session in every mode",
  statement:
    "When a valid registry session already exists, login with preapproval shall start a new sign-in without asking in interactive, machine-output, and non-interactive modes, while login without preapproval shall keep the session and name the preapproval in modes that cannot ask and shall ask before replacing it in a mode that can.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "safe-repetition"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/auth/login.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const deviceLogin = (yes: boolean) => ({ yes, deviceCode: true, scopes: [] });

const alreadyLoggedIn = {
  status: "already-logged-in",
  registryHost: LOGIN_REGISTRY_HOST,
  handle: EXISTING_HANDLE,
};

const signInAgain = {
  description: "Sign in again with a different account",
  cmd: "axm login --yes",
};

describe("Login preapproval over a valid session", () => {
  it.effect("unattended JSON without preapproval reports one account and starts no browser", () => {
    const context = makeAuthSpecContext({ credentials: authCredentialFile });
    return context.provide(
      Effect.gen(function* () {
        const store = yield* CredentialStore;
        const before = yield* store.load(authRegistry);
        yield* handleLogin(loginOptions);
        expect(yield* store.load(authRegistry)).toEqual(before);
        expect(context.requestedScopes).toEqual([]);
        expect(context.interactionState.openBrowserCalls).toEqual([]);
        expect(context.deviceInteractionState.openBrowserCalls).toEqual([]);
        expect(context.rendererState.results).toHaveLength(1);
        expect(context.rendererState.results[0]?.data).toEqual({
          result: {
            status: "already-logged-in",
            registryHost: "registry.example.test",
            handle: "@alice",
          },
        });
      }),
    );
  });
  it.effect("an interactive session with preapproval signs in again without asking", () =>
    Effect.gen(function* () {
      const context = makeLoginSpecContext({ validSession: true });
      const prompts: Array<string> = [];

      yield* handleLogin(deviceLogin(true), {
        confirmRelogin: (message) =>
          Effect.sync(() => {
            prompts.push(message);
            return true;
          }),
      }).pipe(Effect.provide(context.layer));

      expect(prompts).toEqual([]);
      expect(context.deviceFlowStarts).toHaveLength(1);
      expect(yield* context.storedAccessToken).toBe(NEW_ACCESS_TOKEN);
      expect(context.rendererState.logs).toContainEqual({
        _tag: "success",
        message: `Logged in to ${LOGIN_REGISTRY_HOST} as ${EXISTING_HANDLE}.`,
      });
    }),
  );

  it.effect("machine output with preapproval signs in again and reports the new session", () =>
    Effect.gen(function* () {
      const context = makeLoginSpecContext({ machine: true, validSession: true });

      yield* handleLogin(deviceLogin(true)).pipe(Effect.provide(context.layer));

      expect(context.deviceFlowStarts).toHaveLength(1);
      expect(yield* context.storedAccessToken).toBe(NEW_ACCESS_TOKEN);
      expect(context.rendererState.results.at(-1)?.data).toMatchObject({
        result: { status: "logged-in", registryHost: LOGIN_REGISTRY_HOST, handle: EXISTING_HANDLE },
      });
    }),
  );

  it.effect(
    "a non-interactive session with preapproval starts a device sign-in and hands approval to a person",
    () =>
      Effect.gen(function* () {
        const context = makeLoginSpecContext({
          machine: true,
          flags: { nonInteractive: true, json: true },
          validSession: true,
        });

        yield* handleLogin(deviceLogin(true)).pipe(Effect.provide(context.layer));

        expect(context.deviceFlowStarts).toHaveLength(1);
        expect(context.rendererState.results.at(-1)?.data).toMatchObject({
          result: {
            status: "pending-human",
            userCode: DEVICE_USER_CODE,
            resume: "axm login --wait --json",
          },
        });
        // The existing session stays until the pending sign-in is approved.
        expect(yield* context.storedAccessToken).toBe(EXISTING_ACCESS_TOKEN);
      }),
  );

  it.effect(
    "a non-interactive session without preapproval keeps the session and names the preapproval",
    () =>
      Effect.gen(function* () {
        const context = makeLoginSpecContext({
          machine: true,
          flags: { nonInteractive: true, json: true },
          validSession: true,
        });

        yield* handleLogin(deviceLogin(false)).pipe(Effect.provide(context.layer));

        expect(context.deviceFlowStarts).toEqual([]);
        expect(yield* context.storedAccessToken).toBe(EXISTING_ACCESS_TOKEN);
        expect(context.rendererState.results.at(-1)?.data).toEqual({ result: alreadyLoggedIn });
        expect(context.rendererState.suggestions).toContainEqual(signInAgain);
      }),
  );

  it.effect(
    "machine output without preapproval keeps the session even from an interactive terminal",
    () =>
      Effect.gen(function* () {
        const context = makeLoginSpecContext({
          machine: true,
          flags: { nonInteractive: false, json: true },
          validSession: true,
        });
        const prompts: Array<string> = [];

        yield* handleLogin(deviceLogin(false), {
          confirmRelogin: (message) =>
            Effect.sync(() => {
              prompts.push(message);
              return true;
            }),
        }).pipe(Effect.provide(context.layer));

        expect(prompts).toEqual([]);
        expect(context.deviceFlowStarts).toEqual([]);
        expect(context.rendererState.results.at(-1)?.data).toEqual({ result: alreadyLoggedIn });
        expect(context.rendererState.suggestions).toContainEqual(signInAgain);
      }),
  );

  it.effect("an interactive session without preapproval asks before replacing the session", () =>
    Effect.gen(function* () {
      const context = makeLoginSpecContext({ validSession: true });
      const prompts: Array<string> = [];

      yield* handleLogin(deviceLogin(false), {
        confirmRelogin: (message) =>
          Effect.sync(() => {
            prompts.push(message);
            return false;
          }),
      }).pipe(Effect.provide(context.layer));

      expect(prompts).toEqual(["Log in with a different account?"]);
      expect(context.deviceFlowStarts).toEqual([]);
      expect(yield* context.storedAccessToken).toBe(EXISTING_ACCESS_TOKEN);
      expect(context.rendererState.logs).toContainEqual({
        _tag: "success",
        message: `Already logged in to ${LOGIN_REGISTRY_HOST} as ${EXISTING_HANDLE}.`,
      });
      expect(context.rendererState.suggestions).toContainEqual(signInAgain);
    }),
  );

  it.effect("the route offers the preapproval it documents and no preview", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["login"], "--yes")).toBe("accepted");
      expect(yield* probeFlag(["login"], "-y")).toBe("accepted");
      expect(yield* probeFlag(["login"], "--preview")).toBe("unrecognized");
    }),
  );
});
