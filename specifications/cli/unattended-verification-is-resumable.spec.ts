import { parserRejection } from "../support/parser-probe.js";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  getAppError,
  handleUnyank,
  classifyError,
  JsonErrorEnvelopeSchema,
} from "axm.sh/specification-harness";
import { authRegistry } from "../support/auth-harness.js";
import {
  makeRegistryManagementContext,
  registryVersion,
  stepUpChallenge,
  stepUpRequestId,
  versionLifecycleResponse,
} from "../support/registry-management-harness.js";

export const specification = defineSpecification({
  requirement: "cli/unattended-verification-is-resumable",
  title: "Unattended verification returns the same resumable request",
  statement:
    "When a Registry write requires human verification in JSON or noninteractive mode, AXM shall return a pending-human action immediately unless a bounded wait was explicitly requested, identify its purpose, Registry, nonsecret request reference, verification URL, expiry, polling interval and resume instruction, and resume only that request through --step-up-request URL with the original inputs without creating a replacement or performing the write before verification; --wait-for-human SECONDS shall select the positive bounded wait, and the existing JSON error envelope shall report ok=false with exit 13 for pending verification or exit 16 when that wait elapses.",
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
  ],
});

const reference = `${authRegistry}/v1/auth/step-up/requests/${stepUpRequestId}`;
const expiry = "2099-01-01T00:00:00.000Z";

describe("Unattended step-up", () => {
  it.effect(
    "rejects a step-up resume flag on login instead of starting a different-purpose request",
    () =>
      Effect.gen(function* () {
        const error = yield* parserRejection(["login", "--step-up-request", reference]);
        expect(classifyError(error, "json").exitCode).toBe(2);
      }),
  );
  for (const waitForHuman of [0, -1]) {
    it.effect(`rejects invalid wait ${waitForHuman} before starting a write`, () => {
      const context = makeRegistryManagementContext(() => stepUpChallenge(), {
        flags: { waitForHuman },
      });
      return context.provide(
        Effect.gen(function* () {
          const error = getAppError(yield* handleUnyank(registryVersion).pipe(Effect.flip));
          expect(error.code).toBe("validation");
          expect(context.requests).toEqual([]);
        }),
      );
    });
  }

  for (const machine of [true, false]) {
    it.effect(`returns immediately without polling or opening a browser (JSON=${machine})`, () => {
      const context = makeRegistryManagementContext(() => stepUpChallenge(), {
        machine,
        auth: { waitForStepUpRequest: () => Effect.die("Must not poll") },
      });
      return context.provide(
        Effect.gen(function* () {
          const error = getAppError(yield* handleUnyank(registryVersion).pipe(Effect.flip));
          expect(error).toMatchObject({
            status: "pending-human",
            blockedOn: "human",
            retryable: true,
            action: {
              purpose: "step-up",
              registryUrl: authRegistry,
              requestRef: reference,
              url: `https://agentxm.ai/step-up/${stepUpRequestId}`,
              expiresAt: expiry,
              intervalSeconds: 2,
              resume: expect.stringContaining(`--step-up-request ${reference}`),
            },
          });
          const classified = classifyError(error, "json");
          expect(classified.exitCode).toBe(13);
          const document = Schema.decodeUnknownSync(JsonErrorEnvelopeSchema)(
            JSON.parse(classified.stdout ?? "null"),
          );
          expect(document).toMatchObject({
            ok: false,
            status: "pending-human",
            action: { purpose: "step-up", requestRef: reference },
          });
          expect(classified.stdout).not.toContain("fixture-stored-access");
          expect(context.requests).toHaveLength(1);
          expect(context.interactionState.openBrowserCalls).toEqual([]);
          expect(context.rendererState.results).toEqual([]);
        }),
      );
    });
  }

  for (const status of ["pending", "verified", "expired", "cancelled", "consumed"] as const) {
    it.effect(`resumes the existing ${status} request`, () => {
      const statusRequests: string[] = [];
      const context = makeRegistryManagementContext(() => versionLifecycleResponse(false), {
        flags: { stepUpRequest: reference },
        auth: {
          getStepUpRequest: (_token, requestId) =>
            Effect.sync(() => {
              statusRequests.push(requestId);
              return { status, expires_at: DateTime.makeUnsafe(expiry) };
            }),
          waitForStepUpRequest: () => Effect.die("Must not poll"),
        },
      });
      return context.provide(
        Effect.gen(function* () {
          const exit = yield* handleUnyank(registryVersion).pipe(Effect.exit);
          expect(exit._tag).toBe(status === "verified" ? "Success" : "Failure");
          expect(statusRequests).toEqual([stepUpRequestId]);
          expect(context.requests).toHaveLength(status === "verified" ? 1 : 0);
          if (status === "verified")
            expect(context.requests[0]?.stepUpRequest).toBe(stepUpRequestId);
          expect(context.interactionState.openBrowserCalls).toEqual([]);
        }),
      );
    });
  }

  for (const invalid of [
    `https://another.example.test/v1/auth/step-up/requests/${stepUpRequestId}`,
    `${authRegistry}/v1/auth/publish/requests/${stepUpRequestId}`,
    `${reference}?replacement=true`,
  ]) {
    it.effect(`rejects an unrelated reference ${invalid}`, () => {
      const context = makeRegistryManagementContext(() => stepUpChallenge(), {
        flags: { stepUpRequest: invalid },
        auth: { getStepUpRequest: () => Effect.die("Must not send credentials") },
      });
      return context.provide(
        Effect.gen(function* () {
          const error = getAppError(yield* handleUnyank(registryVersion).pipe(Effect.flip));
          expect(error.code).toBe("validation");
          expect(context.requests).toEqual([]);
        }),
      );
    });
  }

  it.effect("a bounded wait returns the same pending request without retrying the write", () => {
    const context = makeRegistryManagementContext(() => stepUpChallenge(), {
      flags: { waitForHuman: 5 },
      auth: { waitForStepUpRequest: () => Effect.never },
    });
    return context.provide(
      Effect.gen(function* () {
        const fiber = yield* handleUnyank(registryVersion).pipe(Effect.flip, Effect.forkChild);
        yield* TestClock.adjust("5 seconds");
        const error = getAppError(yield* Fiber.join(fiber));
        expect(error).toMatchObject({ status: "pending-human", action: { requestRef: reference } });
        expect(classifyError(error, "json").exitCode).toBe(16);
        expect(context.requests).toHaveLength(1);
        expect(context.interactionState.openBrowserCalls).toEqual([]);
      }),
    );
  });
});
