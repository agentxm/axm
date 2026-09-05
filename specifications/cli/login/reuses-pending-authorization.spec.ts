import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Option from "effect/Option";
import { PendingDeviceLoginStore } from "axm.sh/specification-harness";
import { handleLogin } from "axm.sh/specification-harness";
import { loginOptions, makeAuthSpecContext } from "../../support/auth-harness.js";
import { getAppError, RegistryUrl } from "axm.sh/specification-harness";
import { otherAuthRegistry } from "../../support/auth-harness.js";

export const specification = defineSpecification({
  requirement: "cli/login/reuses-pending-authorization",
  title: "Repeated sign-in preserves pending authorization",
  statement:
    "When a device authorization is unexpired, AXM shall reuse it for the same Registry and equivalent requested scopes, refuse a conflicting request without changing it, and replace it only when restart is explicitly requested.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/auth/login.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pending authorization reuse", () => {
  it.effect("reuses equivalent scopes and requires explicit replacement for conflicts", () => {
    const context = makeAuthSpecContext();
    return context.provide(
      Effect.gen(function* () {
        yield* handleLogin({ ...loginOptions, scopes: ["account:read", "extensions:read"] });
        const store = yield* PendingDeviceLoginStore;
        const original = yield* store.load();
        yield* handleLogin({
          ...loginOptions,
          scopes: ["extensions:read", "account:read", "extensions:read"],
        });
        expect(yield* store.load()).toEqual(original);
        expect(context.requestedScopes).toHaveLength(1);
        expect(context.rendererState.results[1]?.data).toMatchObject({
          result: { flow: "re-emitted" },
        });
        const changedScopes = yield* handleLogin(loginOptions).pipe(Effect.flip);
        expect(getAppError(changedScopes).code).toBe("conflict");
        const changedRegistry = yield* handleLogin(loginOptions).pipe(
          Effect.provideService(RegistryUrl, otherAuthRegistry),
          Effect.flip,
        );
        expect(getAppError(changedRegistry).code).toBe("conflict");
        expect(yield* store.load()).toEqual(original);
        yield* handleLogin({ ...loginOptions, restart: true });
        const replacement = yield* store.load();
        expect(Option.isSome(replacement)).toBe(true);
        expect(replacement).not.toEqual(original);
        expect(context.requestedScopes).toHaveLength(2);
      }),
    );
  });
});
