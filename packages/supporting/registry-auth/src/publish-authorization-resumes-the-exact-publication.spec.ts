import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  decodeHandleSync,
  decodeExtensionNameSync,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import {
  publicationSetDigest,
  publicationDescriptorDigest,
  type PreviewPublicationSetRequest,
} from "@agentxm/registry-protocol/unstable/registry/publication-set";

import {
  AuthClientTest,
  type AuthClientService,
  type PublishAuthorizationExchangeResponse,
} from "./auth-client.js";
import { DeviceLoginInteractionTest } from "./device-login.js";
import { PublishAuthorizationPending, RegistryAuthFailed } from "./errors.js";
import { AuthLoginPresenterTest } from "./login-presenter.js";
import {
  PendingPublishAuthorizationStore,
  PendingPublishAuthorizationStoreTest,
  type PendingPublishAuthorization,
} from "./pending-publish-authorization-store.js";
import { runPublishAuthorization } from "./publish-authorization.js";
import { authFailureCategory, authFailureDetail } from "./spec-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/authorization-resumes-the-exact-publication",
  title: "Publish authorization resumes the exact reviewed publication",
  statement:
    "When unattended publish has no publication authority, AXM shall persist a private initiator proof, return a human handoff carrying the registry-protocol publish action and no proof, and neither wait nor upload; a resume reference shall resume only that same request with unchanged publication material, a bounded wait shall return the same handoff when it elapses, and resume shall refuse a foreign, different-purpose or query-bearing reference and changed archives or visibility before exchange, exchange only an approved request, and require explicit recovery for denial, expiry or a prior exchange without replacing the request or replaying uploads.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "privacy-and-consent", "safe-repetition"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Which specification owns the generic human-handoff protocol (an immediate pending handoff unless a bounded wait was requested, resume only the referenced request, never a silent replacement) that this identity, cli/unattended-verification-is-resumable and cli/login/starts-resumable-device-sign-in each restate for their own purpose?",
  ],
  limitations: [
    {
      limitation:
        "These cases control the Registry boundary and observe typed outcomes; the server owns approval and atomic exchange enforcement, and full publish command evidence separately covers upload settlement.",
      retirementCondition:
        "Coordinated end-to-end evidence binds persisted CLI resume, server approval and publication outcome recovery.",
    },
    {
      limitation:
        "The exit codes and rendered JSON envelope these outcomes produce (13 pending, 14 expired, 15 denied, 16 wait elapsed, 6 already exchanged) are a boundary mapping this capability cannot observe; they are pinned by apps/cli/src/auth-pending-envelopes.test.ts.",
      retirementCondition:
        "cli/exit-codes-match-published-reference adopts the publish-authorization exit codes as decisive rows.",
    },
  ],
});

const registryUrl = "https://registry.example.test";
const requestId = "pubreq_01h455vb4pexka56gq5w2r7cpc";
const requestRef = `${registryUrl}/v1/auth/publish-requests/${requestId}`;
const expiresAt = DateTime.makeUnsafe("2099-01-01T00:00:00.000Z");
const descriptor = {
  target: {
    owner: decodeHandleSync("@alice"),
    type: "skill" as const,
    name: decodeExtensionNameSync("review"),
    version: decodeVersionSync("1.0.0"),
  },
  participation: "publish" as const,
  archiveSha256Hex: "b".repeat(64),
  visibility: { intent: null, request: "private" as const },
};
const publicationSet: PreviewPublicationSetRequest = {
  contract: "publication-set-v2",
  candidates: [descriptor],
};
const digest = publicationSetDigest(publicationSet.candidates);
const pending: PendingPublishAuthorization = {
  version: 1,
  purpose: "publish",
  registryUrl,
  requestId,
  requestRef,
  authorizationUrl: `https://auth.example.test/publish/authorize/${requestId}`,
  expiresAt,
  interval: 2,
  publicationSetDigest: digest,
  initiatorProof: "private-proof-".repeat(5),
};
const approved: PublishAuthorizationExchangeResponse = {
  status: "admitted",
  preview: {
    contract: "publication-set-v2",
    publicationSetDigest: digest,
    status: "admitted",
    candidates: [],
    packs: [],
  },
  grants: [
    {
      accessToken: "SYNTHETIC_PUBLICATION_CAPABILITY",
      expiresAt,
      scope: "extensions:publish:new",
      publishRequestId: requestId,
      visibilityContract: "v2",
      visibility: { value: "private", disposition: "establish", source: "explicit" },
      condition: '"reviewed"',
      publicationSetDigest: digest,
      publicationDescriptorDigest: publicationDescriptorDigest(descriptor),
    },
  ],
};
const layers = (
  overrides: Partial<AuthClientService>,
  records: ReadonlyArray<PendingPublishAuthorization> = [pending],
) =>
  Layer.mergeAll(
    AuthClientTest({
      createPublishAuthorizationRequest: () => Effect.die("Must not replace an existing request"),
      ...overrides,
    }),
    PendingPublishAuthorizationStoreTest(records),
    AuthLoginPresenterTest().layer,
    DeviceLoginInteractionTest({
      openBrowser: () => Effect.die("Unattended publish must not open a browser"),
    }).layer,
  );
const run = (
  extra: { readonly authorizationRequest?: string; readonly waitForHumanSeconds?: number } = {
    authorizationRequest: requestRef,
  },
) => runPublishAuthorization({ registryUrl, publicationSet, unattended: true, ...extra });

describe("Resumable exact publication authorization", () => {
  it.effect(
    "returns and persists a fresh handoff without polling, exchange or secret disclosure",
    () =>
      Effect.gen(function* () {
        const failure = yield* run({}).pipe(Effect.flip);
        expect(failure).toBeInstanceOf(PublishAuthorizationPending);
        expect(failure).toMatchObject({
          timedOut: false,
          action: {
            kind: "open-url",
            purpose: "publish",
            requestRef,
            registryUrl,
            intervalSeconds: 2,
            resume: expect.stringContaining(requestRef),
          },
        });

        const store = yield* PendingPublishAuthorizationStore;
        const saved = yield* store.load(requestRef);
        expect(Option.isSome(saved)).toBe(true);
        if (Option.isSome(saved)) {
          // The proof lives only in the store; the handoff a caller may render
          // carries the public reference and nothing else.
          expect(saved.value.initiatorProof.length).toBeGreaterThanOrEqual(43);
          expect(JSON.stringify(failure)).not.toContain(saved.value.initiatorProof);
        }
      }).pipe(
        Effect.provide(
          layers(
            {
              createPublishAuthorizationRequest: (input) => {
                expect(input.delivery.kind).toBe("polling");
                return Effect.succeed({
                  requestId,
                  authorizationUrl: pending.authorizationUrl,
                  expiresAt,
                  interval: 2,
                });
              },
            },
            [],
          ),
        ),
      ),
  );

  for (const status of ["pending", "approved", "denied", "expired", "exchanged"] as const) {
    it.effect(`resumes the same ${status} request`, () =>
      Effect.gen(function* () {
        let exchanges = 0;
        const result = yield* run().pipe(
          Effect.result,
          Effect.provide(
            layers({
              pollPublishAuthorization: (input) => {
                expect(input).toEqual({
                  registryUrl,
                  requestId,
                  initiatorProof: pending.initiatorProof,
                });
                return Effect.succeed({
                  purpose: "publish",
                  status,
                  expires_at: expiresAt,
                  interval: 2,
                  publication_set_digest: digest,
                });
              },
              exchangePublishAuthorization: () =>
                Effect.sync(() => {
                  exchanges++;
                  return approved;
                }),
            }),
          ),
        );
        expect(exchanges).toBe(status === "approved" ? 1 : 0);
        if (status === "approved") {
          expect(result).toMatchObject({ _tag: "Success", success: approved });
        } else {
          expect(result._tag).toBe("Failure");
          if (result._tag === "Failure") {
            if (status === "pending") {
              expect(result.failure).toBeInstanceOf(PublishAuthorizationPending);
              expect(result.failure).toMatchObject({ timedOut: false, action: { requestRef } });
            } else {
              expect(result.failure).toBeInstanceOf(RegistryAuthFailed);
              expect(authFailureCategory(result.failure)).toBe(
                status === "expired"
                  ? "auth_expired"
                  : status === "denied"
                    ? "auth_denied"
                    : "conflict",
              );
            }
          }
        }
      }),
    );
  }

  for (const authorizationRequest of [
    requestRef.replace("registry.example.test", "other.example.test"),
    requestRef.replace("publish-requests", "step-up/requests"),
    `${requestRef}?proof=unsafe`,
  ]) {
    it.effect(
      `rejects invalid reference ${authorizationRequest} before accessing the Registry`,
      () =>
        Effect.gen(function* () {
          const error = yield* run({ authorizationRequest }).pipe(Effect.flip);
          expect(error).toBeInstanceOf(RegistryAuthFailed);
          expect(authFailureCategory(error)).toBe("validation");
        }).pipe(Effect.provide(layers({}))),
    );
  }

  it.effect("rejects changed archive or visibility before polling or exchange", () =>
    Effect.gen(function* () {
      for (const changed of [
        { ...descriptor, archiveSha256Hex: "c".repeat(64) },
        { ...descriptor, visibility: { intent: null, request: "public" as const } },
      ]) {
        const error = yield* runPublishAuthorization({
          registryUrl,
          publicationSet: { ...publicationSet, candidates: [changed] },
          unattended: true,
          authorizationRequest: requestRef,
        }).pipe(Effect.flip);
        expect(error).toBeInstanceOf(RegistryAuthFailed);
        expect(authFailureDetail(error)).toContain("changed");
      }
    }).pipe(Effect.provide(layers({}))),
  );

  it.effect("a bounded wait returns the same handoff once it elapses", () =>
    Effect.gen(function* () {
      const fiber = yield* run({ authorizationRequest: requestRef, waitForHumanSeconds: 1 }).pipe(
        Effect.flip,
        Effect.forkChild,
      );
      yield* TestClock.adjust("1 second");
      const failure = yield* Fiber.join(fiber);
      expect(failure).toBeInstanceOf(PublishAuthorizationPending);
      expect(failure).toMatchObject({ timedOut: true, action: { requestRef } });
    }).pipe(
      Effect.provide(
        layers({
          pollPublishAuthorization: () =>
            Effect.succeed({
              purpose: "publish",
              status: "pending",
              expires_at: expiresAt,
              interval: 2,
              publication_set_digest: digest,
            }),
        }),
      ),
    ),
  );
});
