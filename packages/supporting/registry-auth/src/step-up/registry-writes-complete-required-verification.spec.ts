import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";

import { RegistryAuthFailed } from "../errors.js";
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
} from "../spec-support/test-helpers.js";
import { createToken, revokeToken } from "../tokens.js";
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
    "packages/supporting/registry-auth/src/step-up.ts",
    "cli/token/completes-required-human-verification",
  ],
  supersedes: ["cli/token/completes-required-human-verification"],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Token creation and revocation are exercised through their own use cases; the version-lifecycle and visibility writes are exercised as parameterized mutation ports, so that yank, unyank, visibility set and visibility reconcile each compose this capability is not established here.",
      retirementCondition:
        "extension-publish carries a test proving each lifecycle and visibility command composes runWithStepUp with its observed revision.",
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
const registryVersion = "@alice/skills/review@1.0.0";
const registryTarget = "@alice/skills/review";

/** The four version-lifecycle and visibility writes, as mutation ports. */
const mutations = [
  {
    name: "yank",
    target: registryVersion,
    method: "POST",
    url: `${authRegistry}/v1/extensions/${registryVersion}/yank`,
    body: { category: "security", notice: "Unsafe release." },
    ifMatch: undefined,
  },
  {
    name: "unyank",
    target: registryVersion,
    method: "DELETE",
    url: `${authRegistry}/v1/extensions/${registryVersion}/yank`,
    body: {},
    ifMatch: undefined,
  },
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
  const waits: Array<{ token: string; url: string; interval: number }> = [];
  const ports = makeAuthPorts({
    credentials: authCredentialFile,
    auth: {
      waitForStepUpRequest: (token, url, interval) =>
        Effect.gen(function* () {
          waits.push({ token, url, interval });
          if (behavior === "denied")
            return yield* new RegistryAuthFailed({
              category: "auth_denied",
              detail: "Verification denied",
            });
        }),
      ...overrides,
    },
  });
  return { ...ports, waits };
};

const expectedWait = [
  { token: "fixture-stored-access", url: stepUpStatusUrl, interval: 2 },
] as const;

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

describe("Token administration verification", () => {
  for (const command of ["token create", "token revoke"] as const) {
    for (const behavior of behaviors) {
      it.effect(`${command}: ${behavior}`, () => {
        const label =
          command === "token create"
            ? 'Create registry token "automation"'
            : "Revoke registry token automation";
        const stepUp = makeStepUpRequest(label, label);
        const requests: Array<{
          token: string;
          intent: unknown;
          verification: string | undefined;
        }> = [];

        const challengedWrite = (token: string, intent: unknown, verification?: string) =>
          Effect.gen(function* () {
            requests.push({ token, intent, verification });
            if (requests.length === 1 || behavior === "challenged-again")
              return yield* stepUpChallenge(stepUp);
          });

        const ports = makePorts(behavior, {
          createToken: (token, params, options) =>
            challengedWrite(token, params, options?.stepUpRequestId).pipe(
              Effect.as({
                id: "fixture-created",
                token: "fixture-issued-secret",
                name: "automation",
                scopes: ["extensions:admin"],
                permissions: null,
                createdAt: authExpiry,
                expiresAt: authExpiry,
              }),
            ),
          deleteToken: (token, id, options) => challengedWrite(token, id, options?.stepUpRequestId),
        });

        const verification = { unattended: true, waitForHumanSeconds: 60 } as const;
        return Effect.gen(function* () {
          if (command === "token create") {
            const exit = yield* createToken(
              {
                name: "automation",
                expires: "7d",
                owners: [],
                extensions: [],
                permission: Option.some("admin"),
                orgPermission: Option.none(),
                cidr: [],
                bypassMfa: false,
                verification,
              },
              authRegistry,
            ).pipe(Effect.exit);
            if (behavior === "approved") {
              expect(exit._tag).toBe("Success");
              if (exit._tag === "Success") expect(exit.value.stepUpCompleted).toBe(true);
            } else {
              expect(exit._tag).toBe("Failure");
            }
          } else {
            const exit = yield* revokeToken("automation", verification, authRegistry).pipe(
              Effect.exit,
            );
            if (behavior === "approved") {
              expect(exit._tag).toBe("Success");
              if (exit._tag === "Success")
                expect(exit.value).toEqual({ tokenId: "automation", stepUpCompleted: true });
            } else {
              expect(exit._tag).toBe("Failure");
            }
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
  }
});
