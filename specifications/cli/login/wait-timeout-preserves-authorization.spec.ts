import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Option from "effect/Option";
import { CredentialStore, PendingDeviceLoginStore } from "axm.sh/specification-harness";
import { handleLogin, captureHelpDoc } from "axm.sh/specification-harness";
import {
  authRegistry,
  loginOptions,
  makeAuthSpecContext,
  resumeLoginOptions,
} from "../../support/auth-harness.js";
import * as TestClock from "effect/testing/TestClock";
import * as Fiber from "effect/Fiber";
import { getAppError } from "axm.sh/specification-harness";

export const specification = defineSpecification({
  requirement: "cli/login/wait-timeout-preserves-authorization",
  title: "A bounded wait leaves sign-in resumable",
  statement:
    "When login --wait reaches the requested timeout before authorization completes, AXM shall report pending human approval with resume instructions and preserve the pending authorization and existing credentials.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/auth/login.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Bounded approval wait", () => {
  it.effect("login help explains how to bound a pending device sign-in wait", () =>
    Effect.gen(function* () {
      const doc = yield* captureHelpDoc(["login"]);
      const timeout = doc.flags.find((flag) => flag.name === "timeout");
      expect(timeout).toBeDefined();
      expect(timeout && Option.getOrElse(timeout.description, () => "")).toContain(
        "requires --wait",
      );
      expect(doc.examples).toContainEqual({
        command: "axm login --wait --timeout 300",
        description: "Wait up to 300 seconds for a pending device sign-in",
      });
    }),
  );

  it.effect("retains the same authorization after a caller-selected timeout", () => {
    const context = makeAuthSpecContext({ auth: { pollDeviceToken: () => Effect.never } });
    return context.provide(
      Effect.gen(function* () {
        yield* handleLogin(loginOptions);
        const pendingStore = yield* PendingDeviceLoginStore;
        const before = yield* pendingStore.load();
        const waiting = yield* handleLogin({ ...resumeLoginOptions, timeoutSeconds: 5 }).pipe(
          Effect.flip,
          Effect.forkChild,
        );
        yield* TestClock.adjust("5 seconds");
        const error = getAppError(yield* Fiber.join(waiting));
        expect(error).toMatchObject({
          code: "timeout",
          status: "pending-human",
          retryable: true,
          blockedOn: "human",
          action: { resume: "axm login --wait --json" },
        });
        expect(JSON.stringify(error)).toContain("axm login --wait --json");
        expect(yield* pendingStore.load()).toEqual(before);
        expect(Option.isNone(yield* (yield* CredentialStore).load(authRegistry))).toBe(true);
      }),
    );
  });
});
