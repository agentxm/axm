import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";

import { CredentialStore } from "./credential-store.js";
import { login } from "./login.js";
import type { SessionReplacementDecision } from "./login-presenter.js";
import {
  authCredentialFile,
  authRegistry,
  authRegistryHost,
  deviceLoginRequest,
  machineOutputPresenter,
  makeAuthPorts,
} from "./spec-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/preapproval-requests-new-sign-in",
  title: "Login preapproval starts a new sign-in over a valid session in every mode",
  statement:
    "When a valid registry session already exists, login with preapproval shall start a new sign-in without asking in interactive, machine-output, and non-interactive modes, while login without preapproval shall keep the session and report the kept account in modes that cannot ask and shall ask before replacing it in a mode that can.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "safe-repetition"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-auth/src/login.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The kept-session outcome carries the Registry host and handle a caller renders; that the rendered guidance names the preapproval command (`axm login --yes`) is a boundary rendering decision this capability cannot observe.",
      retirementCondition:
        "An apps/cli specification owns the already-signed-in rendering for login, or the rendered suggestion set becomes observable from this capability.",
    },
  ],
});

/** A valid session for the selected Registry, and the ports one mode composes. */
const ports = (options: {
  readonly machineOutput: boolean;
  readonly sessionReplacement?: SessionReplacementDecision;
}) =>
  makeAuthPorts({
    credentials: authCredentialFile,
    presenter: {
      ...(options.machineOutput ? machineOutputPresenter : {}),
      ...(options.sessionReplacement === undefined
        ? {}
        : {
            confirmSessionReplacement: () =>
              Effect.succeed<SessionReplacementDecision>(options.sessionReplacement ?? "replace"),
          }),
    },
  });

const storedAccessToken = Effect.gen(function* () {
  const stored = yield* (yield* CredentialStore).load(authRegistry);
  return Option.map(stored, (credentials) => credentials.access_token);
});

describe("Login preapproval over a valid session", () => {
  it.effect(
    "unattended machine output without preapproval reports one account and starts no browser",
    () => {
      const context = ports({ machineOutput: true });
      return Effect.gen(function* () {
        const before = yield* storedAccessToken;
        const outcome = yield* login(deviceLoginRequest(), authRegistry);

        expect(outcome).toEqual({
          _tag: "SessionRetained",
          registryHost: authRegistryHost,
          handle: "@alice",
        });
        expect(yield* storedAccessToken).toEqual(before);
        expect(context.requestedScopes).toEqual([]);
        expect(context.interactionState.openBrowserCalls).toEqual([]);
        expect(context.deviceInteractionState.openBrowserCalls).toEqual([]);
      }).pipe(Effect.provide(context.layer));
    },
  );

  it.effect("an interactive session with preapproval signs in again without asking", () => {
    const context = ports({ machineOutput: false, sessionReplacement: "replace" });
    return Effect.gen(function* () {
      yield* login(
        deviceLoginRequest({ yes: true, scopes: [], nonInteractive: false, machineOutput: false }),
        authRegistry,
      );

      expect(context.presenterState.sessionReplacementPrompts).toEqual([]);
      expect(context.presenterState.existingSessions).toEqual(["@alice"]);
      expect(context.requestedScopes).toHaveLength(1);
      expect(yield* storedAccessToken).toEqual(Option.some("fixture-new-access"));
      expect(context.presenterState.loginSuccesses).toEqual([
        { status: "logged-in", registryHost: authRegistryHost, handle: "@alice" },
      ]);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("machine output with preapproval signs in again and reports the new session", () => {
    const context = ports({ machineOutput: true });
    return Effect.gen(function* () {
      yield* login(
        deviceLoginRequest({ yes: true, scopes: [], nonInteractive: false }),
        authRegistry,
      );

      expect(context.requestedScopes).toHaveLength(1);
      expect(yield* storedAccessToken).toEqual(Option.some("fixture-new-access"));
      expect(context.presenterState.loginSuccesses.at(-1)).toEqual({
        status: "logged-in",
        registryHost: authRegistryHost,
        handle: "@alice",
      });
    }).pipe(Effect.provide(context.layer));
  });

  it.effect(
    "a non-interactive session with preapproval starts a device sign-in and hands approval to a person",
    () => {
      const context = ports({ machineOutput: true });
      return Effect.gen(function* () {
        yield* login(deviceLoginRequest({ yes: true, scopes: [] }), authRegistry);

        expect(context.requestedScopes).toHaveLength(1);
        expect(context.presenterState.pendingEmissions.at(-1)).toMatchObject({
          status: "pending-human",
          userCode: "ABCD-1234",
          resume: "axm login --wait --json",
        });
        // The existing session stays until the pending sign-in is approved.
        expect(yield* storedAccessToken).toEqual(Option.some("fixture-stored-access"));
      }).pipe(Effect.provide(context.layer));
    },
  );

  it.effect("a non-interactive session without preapproval keeps the session", () => {
    const context = ports({ machineOutput: true });
    return Effect.gen(function* () {
      const outcome = yield* login(deviceLoginRequest({ scopes: [] }), authRegistry);

      expect(outcome).toEqual({
        _tag: "SessionRetained",
        registryHost: authRegistryHost,
        handle: "@alice",
      });
      expect(context.requestedScopes).toEqual([]);
      expect(yield* storedAccessToken).toEqual(Option.some("fixture-stored-access"));
    }).pipe(Effect.provide(context.layer));
  });

  it.effect(
    "machine output without preapproval keeps the session even from an interactive terminal",
    () => {
      const context = ports({ machineOutput: true, sessionReplacement: "replace" });
      return Effect.gen(function* () {
        const outcome = yield* login(
          deviceLoginRequest({ scopes: [], nonInteractive: false }),
          authRegistry,
        );

        expect(outcome).toEqual({
          _tag: "SessionRetained",
          registryHost: authRegistryHost,
          handle: "@alice",
        });
        expect(context.presenterState.sessionReplacementPrompts).toEqual([]);
        expect(context.requestedScopes).toEqual([]);
      }).pipe(Effect.provide(context.layer));
    },
  );

  it.effect("an interactive session without preapproval asks before replacing the session", () => {
    const context = ports({ machineOutput: false, sessionReplacement: "keep" });
    return Effect.gen(function* () {
      const outcome = yield* login(
        deviceLoginRequest({ scopes: [], nonInteractive: false, machineOutput: false }),
        authRegistry,
      );

      expect(context.presenterState.sessionReplacementPrompts).toEqual([
        "Log in with a different account?",
      ]);
      expect(context.presenterState.existingSessions).toEqual(["@alice"]);
      expect(context.requestedScopes).toEqual([]);
      expect(outcome).toEqual({
        _tag: "SessionRetained",
        registryHost: authRegistryHost,
        handle: "@alice",
      });
      expect(yield* storedAccessToken).toEqual(Option.some("fixture-stored-access"));
    }).pipe(Effect.provide(context.layer));
  });
});
