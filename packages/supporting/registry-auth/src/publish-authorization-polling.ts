import { DeviceLoginInteraction } from "./device-login.js";
import { AuthLoginPresenter } from "./login-presenter.js";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { publicationSetDigest } from "@agentxm/registry-protocol/unstable/registry/publication-set";
import { AuthClient, type PublishAuthorizationExchangeResponse } from "./auth-client.js";
import { PublishAuthorizationPending, RegistryAuthFailed } from "./errors.js";
import { makePkceChallenge, makePkceVerifier } from "./loopback-login.js";
import {
  PendingPublishAuthorizationStore,
  type PendingPublishAuthorization,
} from "./pending-publish-authorization-store.js";
import type { PublishAuthorizationInput } from "./publish-authorization.js";

const invalidResume = (detail: string) =>
  new RegistryAuthFailed({
    category: "validation",
    detail,
    recover:
      "Resume with the original publication inputs and requestRef. To request new consent, rerun publish without --authorization-request.",
  });

export const readPublishAuthorizationReference = (reference: string, registryUrl: string) =>
  Effect.try({
    try: () => {
      const url = new URL(reference);
      const registry = new URL(registryUrl);
      const match = /^\/v1\/auth\/publish-requests\/(pubreq_[a-z0-9]{26})$/.exec(url.pathname);
      if (
        url.origin !== registry.origin ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        match?.[1] === undefined
      )
        throw new Error("Invalid reference");
      return { requestId: match[1], requestRef: url.href };
    },
    catch: () =>
      invalidResume(
        "The authorization request URL must identify a publish request on the selected Registry.",
      ),
  });

const pendingHuman = (pending: PendingPublishAuthorization, timedOut = false) =>
  new PublishAuthorizationPending({
    timedOut,
    action: {
      kind: "open-url",
      purpose: "publish",
      registryUrl: pending.registryUrl,
      requestRef: pending.requestRef,
      url: pending.authorizationUrl,
      expiresAt: DateTime.formatIso(pending.expiresAt),
      intervalSeconds: pending.interval,
      resume: `Rerun the same publish command with unchanged inputs and --authorization-request ${pending.requestRef}. Add --wait-for-human SECONDS for a bounded wait.`,
    },
  });

export const runPollingPublishAuthorization = Effect.fn("Auth.runPollingPublishAuthorization")(
  function* (input: PublishAuthorizationInput) {
    const auth = yield* AuthClient;
    const store = yield* PendingPublishAuthorizationStore;
    const expectedDigest = publicationSetDigest(input.publicationSet.candidates);
    const pending = yield* Effect.gen(function* () {
      if (input.authorizationRequest !== undefined) {
        const reference = yield* readPublishAuthorizationReference(
          input.authorizationRequest,
          input.registryUrl,
        );
        const saved = yield* store.load(reference.requestRef);
        if (Option.isNone(saved))
          return yield* invalidResume(
            "The private proof for this publish request is unavailable on this machine. A public URL alone cannot resume it.",
          );
        if (
          saved.value.registryUrl !== input.registryUrl ||
          saved.value.requestId !== reference.requestId ||
          saved.value.publicationSetDigest !== expectedDigest
        )
          return yield* invalidResume(
            "The publication set, archive bytes, visibility inputs or Registry changed. This request cannot authorize the changed material; review a new request.",
          );
        return saved.value;
      }
      const initiatorProof = makePkceVerifier();
      const request = yield* auth.createPublishAuthorizationRequest({
        registryUrl: input.registryUrl,
        publicationSet: input.publicationSet,
        delivery: {
          kind: "polling",
          proof_challenge: makePkceChallenge(initiatorProof),
          proof_challenge_method: "S256",
        },
      });
      const reference = yield* readPublishAuthorizationReference(
        `${input.registryUrl.replace(/\/+$/, "")}/v1/auth/publish-requests/${request.requestId}`,
        input.registryUrl,
      );
      const value: PendingPublishAuthorization = {
        version: 1,
        purpose: "publish",
        registryUrl: input.registryUrl,
        ...reference,
        authorizationUrl: request.authorizationUrl,
        expiresAt: request.expiresAt,
        interval: request.interval,
        publicationSetDigest: expectedDigest,
        initiatorProof,
      };
      yield* store.save(value);
      return value;
    });
    const expired = () =>
      new RegistryAuthFailed({
        category: "auth_expired",
        detail:
          "This publish authorization expired. Review a new request; no capability was acquired.",
        recover: "Rerun publish without --authorization-request to request new consent.",
      });
    const now = yield* DateTime.now;
    const remaining = DateTime.toEpochMillis(pending.expiresAt) - DateTime.toEpochMillis(now);
    if (remaining <= 0) {
      yield* store.clear(pending.requestRef);
      return yield* expired();
    }
    if (
      input.authorizationRequest === undefined &&
      input.waitForHumanSeconds === undefined &&
      input.unattended === true
    )
      return yield* pendingHuman(pending);

    if (input.authorizationRequest === undefined && input.unattended !== true) {
      const interaction = yield* DeviceLoginInteraction;
      const presenter = yield* AuthLoginPresenter;
      const browserOpened = yield* interaction.openBrowser(pending.authorizationUrl);
      yield* presenter.notePublishReview({
        browserOpened,
        candidateCount: input.publicationSet.candidates.length,
        authorizationUrl: pending.authorizationUrl,
      });
    }
    const wait = Effect.gen(function* () {
      while (true) {
        const status = yield* auth.pollPublishAuthorization({
          registryUrl: pending.registryUrl,
          requestId: pending.requestId,
          initiatorProof: pending.initiatorProof,
        });
        if (
          status.purpose !== "publish" ||
          status.publication_set_digest !== expectedDigest ||
          DateTime.toEpochMillis(status.expires_at) !== DateTime.toEpochMillis(pending.expiresAt)
        )
          return yield* invalidResume(
            "The Registry returned a different publication binding or deadline. This request cannot be resumed.",
          );
        if (status.status === "expired") {
          yield* store.clear(pending.requestRef);
          return yield* expired();
        }
        if (status.status === "denied") {
          yield* store.clear(pending.requestRef);
          return yield* new RegistryAuthFailed({
            category: "auth_denied",
            detail: "Publish authorization was cancelled. No publication was authorized.",
            recover: "Request new consent by rerunning publish without --authorization-request.",
          });
        }
        if (status.status === "exchanged") {
          yield* store.clear(pending.requestRef);
          return yield* new RegistryAuthFailed({
            category: "conflict",
            detail:
              "This publish authorization was already exchanged. Verify the prior publication results before requesting new consent; the capabilities cannot be replayed.",
            recover:
              "Rerun publish with the original inputs to verify existing versions and request consent for any remaining material.",
          });
        }
        if (status.status === "approved") return;
        if (input.unattended === true && input.waitForHumanSeconds === undefined)
          return yield* pendingHuman(pending);
        const current = yield* DateTime.now;
        const left = DateTime.toEpochMillis(pending.expiresAt) - DateTime.toEpochMillis(current);
        if (left <= 0) return yield* expired();
        yield* Effect.sleep(Math.min(status.interval * 1000, left));
      }
    });
    const bound = Math.min(
      remaining,
      input.waitForHumanSeconds === undefined ? remaining : input.waitForHumanSeconds * 1000,
    );
    const result = yield* wait.pipe(Effect.timeoutOption(bound));
    if (Option.isSome(result)) {
      // A lost exchange response is not retried: a later resume observes the
      // retained request and takes explicit publication-outcome recovery.
      const exchange = yield* auth.exchangePublishAuthorization({
        registryUrl: pending.registryUrl,
        requestId: pending.requestId,
        initiatorProof: pending.initiatorProof,
      });
      if (
        exchange.preview.publicationSetDigest !== expectedDigest ||
        exchange.grants.some(
          (grant) =>
            grant.publishRequestId !== pending.requestId ||
            grant.publicationSetDigest !== expectedDigest,
        )
      )
        return yield* invalidResume(
          "The exchanged capabilities do not match the reviewed publication set.",
        );
      return exchange;
    }
    const afterWait = yield* DateTime.now;
    if (DateTime.toEpochMillis(pending.expiresAt) <= DateTime.toEpochMillis(afterWait)) {
      yield* store.clear(pending.requestRef);
      return yield* expired();
    }
    return yield* pendingHuman(pending, true);
  },
  Effect.satisfiesSuccessType<PublishAuthorizationExchangeResponse>(),
);
