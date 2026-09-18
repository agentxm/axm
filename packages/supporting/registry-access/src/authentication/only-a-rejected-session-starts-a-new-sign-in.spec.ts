import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { RegistryProblem, RegistryRequestFailed } from "@agentxm/registry-client";
import { defineSpecification } from "@agentxm/specification-metadata";

import { login } from "./login.js";
import {
  authCredentialFile,
  authHandle,
  authRegistry,
  authRegistryHost,
  deviceLoginRequest,
  machineOutputPresenter,
  makeAuthPorts,
} from "./test-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/only-a-rejected-session-starts-a-new-sign-in",
  title: "Login replaces a stored session only when the Registry rejects it",
  statement:
    "When login finds a stored session, AXM shall ask the Registry who it is through the transport that renews a stored session, without naming the stored access token; it shall start a new sign-in when the Registry rejects the credential, and shall report the failure and start no sign-in when the Registry cannot be asked.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-access/src/authentication/login.ts"],
  supersedes: [],
  assumptions: [
    "The transport renews a stored session before and after a rejection, as cli/session/renews-the-stored-session-once requires, so a rejection that reaches login is the Registry's answer about the session and not about a lapsed access token.",
  ],
  openQuestions: [],
});

const rejected = new RegistryProblem({
  category: "auth",
  title: "Unauthorized",
  metadata: {
    request: { service: "registry", url: `${authRegistry}/v1/auth/me` },
    response: { status: 401 },
  },
  cause: undefined,
});

const unreachable = new RegistryRequestFailed({
  category: "network",
  detail: "Could not read authenticated user: the Registry could not be reached.",
});

describe("Login over a stored session", () => {
  it.effect("reads the identity without naming the stored access token", () => {
    const named: Array<string | undefined> = [];
    const context = makeAuthPorts({
      credentials: authCredentialFile,
      presenter: machineOutputPresenter,
      auth: {
        getMe: (accessToken) =>
          Effect.sync(() => {
            named.push(accessToken);
            return {
              userHandle: authHandle,
              tokenType: "session",
              authority: "account" as const,
              permissions: null,
              resourceRestrictions: null,
              expiresAt: null,
              approvedAt: null,
            };
          }),
      },
    });
    return Effect.gen(function* () {
      expect(yield* login(deviceLoginRequest(), authRegistry)).toEqual({
        _tag: "SessionRetained",
        registryHost: authRegistryHost,
        handle: "@alice",
      });
      // Naming the token would carry it past the renewing transport, and a
      // session whose access token had lapsed would read as one the Registry
      // ended.
      expect(named).toEqual([undefined]);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("starts a new sign-in when the Registry rejects the session", () => {
    const context = makeAuthPorts({
      credentials: authCredentialFile,
      presenter: machineOutputPresenter,
      auth: { getMe: () => Effect.fail(rejected) },
    });
    return Effect.gen(function* () {
      yield* login(deviceLoginRequest(), authRegistry).pipe(Effect.exit);
      expect(context.deviceAuthorizations).toHaveLength(1);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("reports a Registry it could not ask, and starts no sign-in", () => {
    const context = makeAuthPorts({
      credentials: authCredentialFile,
      presenter: machineOutputPresenter,
      auth: { getMe: () => Effect.fail(unreachable) },
    });
    return Effect.gen(function* () {
      const failure = yield* login(deviceLoginRequest(), authRegistry).pipe(Effect.flip);
      expect(failure).toBe(unreachable);
      expect(context.deviceAuthorizations).toEqual([]);
      expect(context.presenterState.rejectedStoredCredentials).toEqual([]);
    }).pipe(Effect.provide(context.layer));
  });
});
