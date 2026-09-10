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
  PendingPublishAuthorizationStore,
  PublishAuthorizationPending,
  RegistryAuthFailed,
  runPublishAuthorization,
  type PendingPublishAuthorization,
  type AuthClientService,
  type PublishAuthorizationExchangeResponse,
  authFailureToAppError,
  classifyError,
} from "axm.sh/specification-harness";
import {
  AuthClientTest,
  AuthLoginPresenterTest,
  DeviceLoginInteractionTest,
  PendingPublishAuthorizationStoreTest,
} from "@agentxm/registry-auth/testing";

export const specification = defineSpecification({
  requirement: "cli/publish/authorization-resumes-the-exact-publication",
  title: "Publish authorization resumes the exact reviewed publication",
  statement:
    "For JSON or unattended publish without existing publication authority, AXM shall persist a private initiator proof and return the existing pending-human error envelope with purpose publish, Registry, public request reference, verification URL, expiry, interval and resume instruction, exiting 13 without waiting or uploading. --authorization-request URL shall resume only that same request with unchanged publication material and locally retained proof; --wait-for-human SECONDS shall select a positive bounded wait and exit 16 with the same handoff when the wait expires. Resume shall reject changed Registry, purpose, archives or visibility before exchange, exchange only an approved request, and require explicit recovery for denial, expiry or prior exchange without silently replacing requests or replaying uploads.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "privacy-and-consent", "safe-repetition"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "These cases control the Registry boundary and exercise the authorization adapter and error renderer; the server owns approval and atomic exchange enforcement, and full publish command evidence separately covers upload settlement.",
      retirementCondition:
        "Coordinated end-to-end evidence binds persisted CLI resume, server approval and publication outcome recovery.",
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
        const classified = classifyError(authFailureToAppError(failure), "json");
        expect(classified.exitCode).toBe(13);
        expect(JSON.parse(classified.stdout ?? "null")).toMatchObject({
          ok: false,
          status: "pending-human",
          blockedOn: "human",
          action: {
            purpose: "publish",
            requestRef,
            registryUrl,
            intervalSeconds: 2,
            resume: expect.stringContaining(`--authorization-request ${requestRef}`),
          },
        });
        const store = yield* PendingPublishAuthorizationStore;
        const saved = yield* store.load(requestRef);
        expect(Option.isSome(saved)).toBe(true);
        if (Option.isSome(saved)) {
          expect(saved.value.initiatorProof.length).toBeGreaterThanOrEqual(43);
          expect(classified.stdout).not.toContain(saved.value.initiatorProof);
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
        if (status === "approved")
          expect(result).toMatchObject({ _tag: "Success", success: approved });
        else {
          expect(result._tag).toBe("Failure");
          if (result._tag === "Failure") {
            const classified = classifyError(authFailureToAppError(result.failure), "json");
            expect(classified.exitCode).toBe(
              status === "pending" ? 13 : status === "expired" ? 14 : status === "denied" ? 15 : 6,
            );
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
          if (error instanceof RegistryAuthFailed) expect(error.category).toBe("validation");
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
        if (error instanceof RegistryAuthFailed) expect(error.detail).toContain("changed");
      }
    }).pipe(Effect.provide(layers({}))),
  );

  it.effect("a bounded wait returns the same handoff with timeout exit 16", () =>
    Effect.gen(function* () {
      const fiber = yield* run({ authorizationRequest: requestRef, waitForHumanSeconds: 1 }).pipe(
        Effect.flip,
        Effect.forkChild,
      );
      yield* TestClock.adjust("1 second");
      const failure = yield* Fiber.join(fiber);
      expect(failure).toBeInstanceOf(PublishAuthorizationPending);
      const classified = classifyError(authFailureToAppError(failure), "json");
      expect(classified.exitCode).toBe(16);
      expect(classified.stdout).toContain(requestRef);
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
