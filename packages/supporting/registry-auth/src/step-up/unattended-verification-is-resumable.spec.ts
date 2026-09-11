import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { defineSpecification } from "@agentxm/specification-metadata";

import { StepUpVerificationPending } from "../errors.js";
import {
  authCredentialFile,
  authFailureCategory,
  authRegistry,
  makeAuthPorts,
  makeStepUpRequest,
  stepUpChallenge,
  stepUpExpiresAt,
  stepUpRequestId,
  stepUpStatusUrl,
  stepUpVerificationUrl,
} from "../spec-support/test-helpers.js";
import { runWithStepUp } from "../step-up.js";

export const specification = defineSpecification({
  requirement: "cli/unattended-verification-is-resumable",
  title: "Unattended verification returns the same resumable request",
  statement:
    "When a Registry write no person is guiding requires human verification, AXM shall return a pending-human handoff immediately unless a bounded wait was explicitly requested, identify its purpose, Registry, nonsecret request reference, verification URL, expiry, polling interval and resume instruction, resume only that referenced request with the original inputs without creating a replacement or performing the write before verification, refuse a reference naming another Registry, another purpose, or carrying a query without presenting any credential, and refuse a nonpositive bounded wait before attempting the write.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "privacy-and-consent", "safe-repetition"],
  methods: ["decision-table", "example"],
  derivedFrom: ["cli/registry-writes-complete-required-verification"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The Registry boundary is controlled; server-side action, actor and intent binding enforcement is outside this CLI evidence.",
      retirementCondition:
        "Deployed Registry conformance evidence verifies rejection of altered action, actor and intent bindings.",
    },
    {
      limitation:
        "That machine output or a missing terminal each make an invocation unattended, and that the pending handoff renders as exit 13 (or 16 when the wait elapses) in the JSON error envelope, are boundary decisions this capability cannot observe; the envelope and exit codes are pinned by apps/cli/src/auth-pending-envelopes.test.ts, and that login does not offer the resume flag by apps/cli/src/cli-flags/human-verification.test.ts.",
      retirementCondition:
        "cli/exit-codes-match-published-reference adopts the pending-verification exit codes, and one owner states the unattended-invocation rule the write commands each derive today.",
    },
  ],
});

const label = "Unyank extension version";
const stepUp = makeStepUpRequest(label, "@alice/skills/review@1.0.0");
const presentation = { operationLabel: label, waitingLabel: `verification to ${label}` } as const;

/** One challenged Registry write, recorded so no replay goes unnoticed. */
const makeWrite = (writes: Array<string | undefined>) => (verification?: string) =>
  Effect.gen(function* () {
    writes.push(verification);
    return yield* stepUpChallenge(stepUp);
  });

describe("Unattended step-up", () => {
  for (const waitForHumanSeconds of [0, -1]) {
    it.effect(`rejects invalid wait ${waitForHumanSeconds} before starting a write`, () => {
      const writes: Array<string | undefined> = [];
      const { layer } = makeAuthPorts({ credentials: authCredentialFile });
      return Effect.gen(function* () {
        const failure = yield* runWithStepUp(
          makeWrite(writes),
          presentation,
          { unattended: true, waitForHumanSeconds },
          authRegistry,
        ).pipe(Effect.flip);
        expect(authFailureCategory(failure)).toBe("validation");
        expect(writes).toEqual([]);
      }).pipe(Effect.provide(layer));
    });
  }

  it.effect("returns the handoff immediately without polling or opening a browser", () => {
    const writes: Array<string | undefined> = [];
    const ports = makeAuthPorts({
      credentials: authCredentialFile,
      auth: { waitForStepUpRequest: () => Effect.die("Must not poll") },
    });
    return Effect.gen(function* () {
      const failure = yield* runWithStepUp(
        makeWrite(writes),
        presentation,
        { unattended: true },
        authRegistry,
      ).pipe(Effect.flip);

      expect(failure).toBeInstanceOf(StepUpVerificationPending);
      expect(failure).toMatchObject({
        timedOut: false,
        action: {
          kind: "open-url",
          purpose: "step-up",
          registryUrl: authRegistry,
          requestRef: stepUpStatusUrl,
          url: stepUpVerificationUrl,
          expiresAt: stepUpExpiresAt,
          intervalSeconds: 2,
          resume: expect.stringContaining(`--step-up-request ${stepUpStatusUrl}`),
        },
      });
      // The handoff carries no credential of any kind.
      expect(JSON.stringify(failure)).not.toContain("fixture-stored-access");
      expect(writes).toEqual([undefined]);
      expect(ports.interactionState.openBrowserCalls).toEqual([]);
      expect(ports.presenterState.stepUpChallenges).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });

  for (const status of ["pending", "verified", "expired", "cancelled", "consumed"] as const) {
    it.effect(`resumes the existing ${status} request`, () => {
      const statusRequests: Array<string> = [];
      const writes: Array<string | undefined> = [];
      const ports = makeAuthPorts({
        credentials: authCredentialFile,
        auth: {
          getStepUpRequest: (_token, requestId) =>
            Effect.sync(() => {
              statusRequests.push(requestId);
              return { status, expires_at: DateTime.makeUnsafe(stepUpExpiresAt) };
            }),
          waitForStepUpRequest: () => Effect.die("Must not poll"),
        },
      });
      return Effect.gen(function* () {
        const exit = yield* runWithStepUp(
          (verification?: string) =>
            Effect.sync(() => {
              writes.push(verification);
              return { result: "changed" } as const;
            }),
          presentation,
          { unattended: true, resumeReference: stepUpStatusUrl },
          authRegistry,
        ).pipe(Effect.exit);

        expect(exit._tag).toBe(status === "verified" ? "Success" : "Failure");
        expect(statusRequests).toEqual([stepUpRequestId]);
        expect(writes).toEqual(status === "verified" ? [stepUpRequestId] : []);
        expect(ports.interactionState.openBrowserCalls).toEqual([]);
      }).pipe(Effect.provide(ports.layer));
    });
  }

  for (const invalid of [
    `https://another.example.test/v1/auth/step-up/requests/${stepUpRequestId}`,
    `${authRegistry}/v1/auth/publish/requests/${stepUpRequestId}`,
    `${stepUpStatusUrl}?replacement=true`,
  ]) {
    it.effect(`rejects an unrelated reference ${invalid}`, () => {
      const writes: Array<string | undefined> = [];
      const { layer } = makeAuthPorts({
        credentials: authCredentialFile,
        auth: { getStepUpRequest: () => Effect.die("Must not send credentials") },
      });
      return Effect.gen(function* () {
        const failure = yield* runWithStepUp(
          makeWrite(writes),
          presentation,
          { unattended: true, resumeReference: invalid },
          authRegistry,
        ).pipe(Effect.flip);
        expect(authFailureCategory(failure)).toBe("validation");
        expect(writes).toEqual([]);
      }).pipe(Effect.provide(layer));
    });
  }

  it.effect("a bounded wait returns the same pending request without retrying the write", () => {
    const writes: Array<string | undefined> = [];
    const ports = makeAuthPorts({
      credentials: authCredentialFile,
      auth: { waitForStepUpRequest: () => Effect.never },
    });
    return Effect.gen(function* () {
      const fiber = yield* runWithStepUp(
        makeWrite(writes),
        presentation,
        { unattended: true, waitForHumanSeconds: 5 },
        authRegistry,
      ).pipe(Effect.flip, Effect.forkChild);
      yield* TestClock.adjust("5 seconds");
      const failure = yield* Fiber.join(fiber);

      expect(failure).toBeInstanceOf(StepUpVerificationPending);
      expect(failure).toMatchObject({
        timedOut: true,
        action: { requestRef: stepUpStatusUrl },
      });
      expect(writes).toEqual([undefined]);
      expect(ports.interactionState.openBrowserCalls).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });
});
