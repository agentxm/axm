import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { RegistryRequestFailed } from "@agentxm/registry-client";
import { defineSpecification } from "@agentxm/specification-metadata";

import { getAppError } from "../../test-support/test-helpers.js";
import {
  ISSUED_TOKEN_ID,
  ISSUED_TOKEN_SECRET,
  makeTokenSpecContext,
} from "../../test-support/token-harness.js";
import { handleCreateToken, handleToken } from "./token.js";

export const specification = defineSpecification({
  requirement: "cli/token/create/revokes-undelivered-token",
  title: "A new token stdout did not accept is revoked",
  statement:
    "When axm token create issues a token that stdout does not acknowledge, AXM shall make one bounded attempt to revoke exactly that token with the creating session, report its ID and whether revocation succeeded on stderr with the revoke command when it did not, and exit unsuccessfully; AXM shall not revoke an existing credential that axm token failed to write.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["apps/cli/src/root/auth/token.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Hard termination, a forced second signal, or an unreachable Registry can leave an undelivered token active; the stderr report is then the only recovery evidence.",
      retirementCondition:
        "The Registry offers idempotent creation or escrow that makes delivery recoverable.",
    },
  ],
});

const create = handleCreateToken({
  name: "ci",
  expires: "30d",
  owners: [],
  extensions: [],
  permission: "read",
  output: "token",
});

describe("Undelivered token compensation", () => {
  it.effect("revokes the issued token and still fails", () => {
    const context = makeTokenSpecContext({ failDelivery: true });
    return Effect.gen(function* () {
      const failure = yield* create.pipe(Effect.flip);

      expect(getAppError(failure).code).toBe("unavailable");
      expect(context.revocations).toEqual([ISSUED_TOKEN_ID]);
      const stderr = context.stderr();
      expect(stderr).toContain(`Revoked token ${ISSUED_TOKEN_ID}`);
      expect(stderr).not.toContain(ISSUED_TOKEN_SECRET);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("reports a failed revocation with its recovery command", () => {
    const context = makeTokenSpecContext({
      failDelivery: true,
      revoke: () =>
        Effect.fail(new RegistryRequestFailed({ category: "network", detail: "offline" })),
    });
    return Effect.gen(function* () {
      const failure = yield* create.pipe(Effect.flip);

      expect(getAppError(failure).code).toBe("unavailable");
      expect(context.revocations).toEqual([ISSUED_TOKEN_ID]);
      expect(context.stderr()).toContain(`axm token revoke ${ISSUED_TOKEN_ID}`);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("reports a revocation that outlasts its budget with the recovery command", () => {
    const context = makeTokenSpecContext({ failDelivery: true, revoke: () => Effect.never });
    return Effect.gen(function* () {
      const creating = yield* create.pipe(Effect.flip, Effect.forkChild);
      yield* TestClock.adjust("10 seconds");
      const failure = yield* Fiber.join(creating);

      expect(getAppError(failure).code).toBe("unavailable");
      expect(context.revocations).toEqual([ISSUED_TOKEN_ID]);
      const stderr = context.stderr();
      expect(stderr).toContain("automatic revocation timed out");
      expect(stderr).toContain(`axm token revoke ${ISSUED_TOKEN_ID}`);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("revokes the issued token when interrupted before stdout acknowledges it", () => {
    const context = makeTokenSpecContext({ stallDelivery: true });
    return Effect.gen(function* () {
      const creating = yield* create.pipe(Effect.forkChild);
      // Let the creation reach the stalled write before interrupting it.
      yield* Effect.yieldNow;
      yield* TestClock.adjust("1 millis");
      expect(context.creations).toEqual(["ci"]);
      yield* Fiber.interrupt(creating);

      expect(context.revocations).toEqual([ISSUED_TOKEN_ID]);
      const stderr = context.stderr();
      expect(stderr).toContain(`Revoked token ${ISSUED_TOKEN_ID}`);
      expect(stderr).not.toContain(ISSUED_TOKEN_SECRET);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("never revokes an existing credential it failed to write", () => {
    const context = makeTokenSpecContext({ failDelivery: true });
    return Effect.gen(function* () {
      const failure = yield* handleToken({ output: "token" }).pipe(Effect.flip);

      expect(getAppError(failure).code).toBe("unavailable");
      expect(context.revocations).toEqual([]);
    }).pipe(Effect.provide(context.layer));
  });
});
