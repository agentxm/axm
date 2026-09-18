import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { RegistryAccessFailed } from "../errors.js";
import {
  authCredentialFile,
  authExpiry,
  authRegistry,
  makeAuthPorts,
  makeStepUpRequest,
  type AuthPortsOptions,
  stepUpChallenge,
  stepUpRequestId,
  stepUpStatusUrl,
  stepUpVerificationUrl,
} from "../test-support/test-helpers.js";
import { createToken } from "../tokens.js";
import { runWithStepUp } from "../step-up.js";

export const specification = defineSpecification({
  requirement: "cli/registry-writes-complete-required-verification",
  title: "Challenged Registry writes complete the required verification before retrying",
  statement:
    "When a Registry write that a person is guiding, or one explicitly requesting a bounded wait, receives a human-verification challenge, AXM shall present the action, target and verification URL, wait once for that challenge's completion within its lifetime and the requested wait bound, retry the identical write at most once with its verification identifier while preserving every input it carried, and report no success if verification or the retry fails.",
  class: "functional",
  role: "experience",
  goals: ["privacy-and-consent", "safe-repetition"],
  methods: ["decision-table", "example"],
  derivedFrom: [
    "AgentXM Registry API 0.1.0",
    "packages/supporting/registry-access/src/authentication/step-up.ts",
    "cli/token/completes-required-human-verification",
  ],
  supersedes: ["cli/token/completes-required-human-verification"],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Token creation is exercised through its own use case; the visibility writes are exercised as parameterized mutation ports, so that visibility set and visibility reconcile each compose this capability is not established here.",
      retirementCondition:
        "Workspace publishing carries a test proving each visibility command composes runWithStepUp with its observed revision.",
    },
  ],
});

/** One challenged write, as the capability sees it: a request it may retry. */
interface RecordedWrite {
  readonly method: string;
  readonly url: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly ifMatch: string | undefined;
  readonly verification: string | undefined;
}

const observedRevision = "observed-revision";
const registryTarget = "@alice/skills/review";

/**
 * The visibility writes, as mutation ports. Only the operations that may ask a
 * signed-in person for more are challenged: creating a token, broadening
 * visibility, and deleting an extension.
 */
const mutations = [
  {
    name: "visibility set",
    target: registryTarget,
    method: "PUT",
    url: `${authRegistry}/v1/extensions/${registryTarget}/visibility`,
    body: { target: registryTarget, visibility: "private", revision: observedRevision },
    ifMatch: observedRevision,
  },
  {
    name: "visibility reconcile",
    target: registryTarget,
    method: "PUT",
    url: `${authRegistry}/v1/extensions/${registryTarget}/visibility`,
    body: {
      target: registryTarget,
      visibility: "private",
      revision: observedRevision,
      authority: "repository",
    },
    ifMatch: observedRevision,
  },
] as const;

const behaviors = ["approved", "denied", "challenged-again"] as const;

/** The ports every row shares: a saved session and a recorded bounded wait. */
const makePorts = (
  behavior: (typeof behaviors)[number],
  overrides: AuthPortsOptions["auth"] = {},
) => {
  const waits: Array<{ url: string; interval: number }> = [];
  const ports = makeAuthPorts({
    credentials: authCredentialFile,
    auth: {
      waitForStepUpRequest: (url, interval) =>
        Effect.gen(function* () {
          waits.push({ url, interval });
          if (behavior === "denied")
            return yield* new RegistryAccessFailed({
              category: "auth_denied",
              detail: "Verification denied",
            });
        }),
      ...overrides,
    },
  });
  return { ...ports, waits };
};

const expectedWait = [{ url: stepUpStatusUrl, interval: 2 }] as const;

describe("Registry mutation verification", () => {
  for (const mutation of mutations) {
    for (const behavior of behaviors) {
      it.effect(`${mutation.name}: ${behavior}`, () => {
        const stepUp = makeStepUpRequest(mutation.name, mutation.target);
        const writes: Array<RecordedWrite> = [];
        const ports = makePorts(behavior);

        const write = (verification?: string) =>
          Effect.gen(function* () {
            writes.push({
              method: mutation.method,
              url: mutation.url,
              body: { ...mutation.body, ...(verification === undefined ? {} : { verification }) },
              ifMatch: mutation.ifMatch,
              verification,
            });
            if (writes.length === 1 || behavior === "challenged-again")
              return yield* stepUpChallenge(stepUp);
            return { result: "changed" } as const;
          });

        return Effect.gen(function* () {
          const exit = yield* runWithStepUp(
            write,
            { operationLabel: mutation.name, waitingLabel: `verification to ${mutation.name}` },
            { unattended: true, waitForHumanSeconds: 60 },
            authRegistry,
          ).pipe(Effect.exit);

          expect(exit._tag).toBe(behavior === "approved" ? "Success" : "Failure");
          expect(ports.waits).toEqual(expectedWait);
          expect(ports.interactionState.openBrowserCalls).toEqual([]);
          expect(ports.presenterState.stepUpChallenges).toEqual([
            {
              action: mutation.name,
              target: mutation.target,
              verificationUrl: stepUpVerificationUrl,
              expiresAt: stepUp.expiresAt,
              browserOpened: false,
            },
          ]);

          expect(writes).toHaveLength(behavior === "denied" ? 1 : 2);
          expect(writes[0]?.verification).toBeUndefined();
          if (behavior !== "denied") {
            expect(writes[1]?.verification).toBe(stepUpRequestId);
            expect(writes[1]?.url).toBe(writes[0]?.url);
            expect(writes[1]?.method).toBe(writes[0]?.method);
            expect(writes[1]?.ifMatch).toBe(mutation.ifMatch);
            expect(writes[1]?.body).toEqual({
              ...writes[0]?.body,
              verification: stepUpRequestId,
            });
          }
        }).pipe(Effect.provide(ports.layer));
      });
    }
  }
});

describe("Token creation verification", () => {
  for (const behavior of behaviors) {
    it.effect(`token create: ${behavior}`, () => {
      const label = 'Create registry token "automation"';
      const stepUp = makeStepUpRequest(label, label);
      const requests: Array<{
        intent: unknown;
        verification: string | undefined;
      }> = [];

      const ports = makePorts(behavior, {
        createToken: (params, options) =>
          Effect.gen(function* () {
            requests.push({ intent: params, verification: options?.stepUpRequestId });
            if (requests.length === 1 || behavior === "challenged-again")
              return yield* stepUpChallenge(stepUp);
            return {
              id: "fixture-created",
              token: "fixture-issued-secret",
              name: "automation",
              permissions: null,
              createdAt: authExpiry,
              expiresAt: authExpiry,
            };
          }),
      });

      return Effect.gen(function* () {
        const exit = yield* createToken(
          {
            name: "automation",
            expires: "7d",
            owners: [],
            extensions: [],
            permission: "admin",
            verification: { unattended: true, waitForHumanSeconds: 60 },
          },
          authRegistry,
        ).pipe(Effect.exit);
        if (behavior === "approved") {
          expect(exit._tag).toBe("Success");
          if (exit._tag === "Success") expect(exit.value.stepUpCompleted).toBe(true);
        } else {
          expect(exit._tag).toBe("Failure");
        }

        if (behavior === "denied") {
          expect(requests).toHaveLength(1);
        } else {
          expect(requests).toHaveLength(2);
          expect(requests[1]).toEqual({ ...requests[0], verification: stepUpRequestId });
        }
        expect(ports.waits).toEqual(expectedWait);
        expect(ports.interactionState.openBrowserCalls).toEqual([]);
        expect(ports.presenterState.stepUpChallenges).toEqual([
          {
            action: label,
            target: label,
            verificationUrl: stepUpVerificationUrl,
            expiresAt: stepUp.expiresAt,
            browserOpened: false,
          },
        ]);
      }).pipe(Effect.provide(ports.layer));
    });
  }
});
