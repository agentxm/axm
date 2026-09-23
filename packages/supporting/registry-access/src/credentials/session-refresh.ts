/**
 * The one authority that renews a stored session.
 *
 * Every invocation that carries a credential this workspace stores asks the
 * refresher for a usable token: before a request when the access token is
 * about to expire, and again when the Registry rejects one. Nothing else
 * spends a refresh token, so there is exactly one place where rotation,
 * mutual exclusion, and the difference between an ended session and an
 * unreachable Registry are decided.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as RcMap from "effect/RcMap";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";

import { REFRESH_SKEW_SECONDS, TokenExchange } from "../authentication/auth-client.js";
import {
  RefreshUnavailable,
  SessionEnded,
  type AuthTokenPolicyRequired,
  type RegistryAccessFailed,
} from "../authentication/errors.js";
import { CredentialStore } from "./credential-store.js";
import { CredentialStoreTokenSource, type StoredCredentials } from "./schema.js";

/**
 * Every way asking for a usable session can fail: the session is over, the
 * Registry could not be reached, the renewal could not be kept, or local
 * credential storage refused.
 */
export type SessionRefreshError =
  SessionEnded | RefreshUnavailable | RegistryAccessFailed | AuthTokenPolicyRequired;

export interface SessionRefresherService {
  /**
   * The token to present on the next request. Renews only when the stored
   * access token is inside the expiry skew; otherwise answers with what the
   * caller already holds.
   */
  readonly fresh: (
    credential: CredentialStoreTokenSource,
  ) => Effect.Effect<CredentialStoreTokenSource, SessionRefreshError>;
  /**
   * The token to present after the Registry rejected `credential`. Always
   * renews, unless another process in this credential home already did.
   */
  readonly renew: (
    credential: CredentialStoreTokenSource,
  ) => Effect.Effect<CredentialStoreTokenSource, SessionRefreshError>;
}

export class SessionRefresher extends ServiceMap.Service<
  SessionRefresher,
  SessionRefresherService
>()("@agentxm/registry-access/credentials/SessionRefresher") {}

const asTokenSource = (
  registryUrl: string,
  credentials: Pick<StoredCredentials, "access_token" | "refresh_token" | "expires_at">,
): CredentialStoreTokenSource =>
  new CredentialStoreTokenSource({
    token: credentials.access_token,
    refresh_token: credentials.refresh_token,
    expires_at: credentials.expires_at,
    registryUrl,
  });

/**
 * What a completed renewal attempt for one access token settled on.
 *
 * Remembering the ended case matters as much as remembering the renewed one: a
 * session the Registry has ended stays ended, and without this an invocation
 * that renews proactively, gets refused, is answered 401, and then asks again
 * would spend two round trips to learn the same thing twice.
 */
type RefreshOutcome =
  | { readonly _tag: "Renewed"; readonly credential: CredentialStoreTokenSource }
  | { readonly _tag: "Ended" };

export const SessionRefresherLive = Layer.effect(
  SessionRefresher,
  Effect.gen(function* () {
    const store = yield* CredentialStore;
    const exchange = yield* TokenExchange;
    // Borrow each origin while renewing or waiting; idle lock keys disappear.
    const locks = yield* RcMap.make({ lookup: (_registryUrl: string) => Semaphore.make(1) });
    const outcomes = yield* Ref.make(
      new Map<string, { readonly spentToken: string; readonly outcome: RefreshOutcome }>(),
    );

    const recall = (credential: CredentialStoreTokenSource) =>
      Effect.map(Ref.get(outcomes), (current) => {
        const previous = current.get(credential.registryUrl);
        return previous === undefined || previous.spentToken !== credential.token
          ? Option.none<RefreshOutcome>()
          : Option.some(previous.outcome);
      });

    const remember = (credential: CredentialStoreTokenSource, outcome: RefreshOutcome) =>
      Ref.update(outcomes, (current) => {
        const updated = new Map(current);
        updated.set(credential.registryUrl, { spentToken: credential.token, outcome });
        return updated;
      });

    const settle = (outcome: RefreshOutcome, registryUrl: string) =>
      outcome._tag === "Renewed"
        ? Effect.succeed(outcome.credential)
        : Effect.fail(new SessionEnded({ registryUrl }));

    /**
     * A session the Registry ended is erased, still under the lock. The memo
     * only tells this invocation; every other one sharing the credential home
     * learns it from the store, finds no session, and never presents the
     * refused refresh token again. Failing to erase changes nothing about the
     * answer, which is still that the session ended.
     */
    const forget = (registryUrl: string) =>
      store.clear(registryUrl).pipe(
        Effect.catch((error) =>
          Effect.logWarning("An ended session could not be erased from credential storage.", {
            error,
          }),
        ),
      );

    /**
     * Spend the refresh token and keep what it bought. The round trip can be
     * interrupted; once it has answered, the write cannot, because a rotated
     * token that is never written leaves the store holding a spent one. Only a
     * Registry that decided nothing leaves the session worth asking about
     * again: every other failure, a refused write included, is remembered as
     * the end of it.
     */
    const exchangeAndSave = (credential: CredentialStoreTokenSource, stored: StoredCredentials) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const renewed = yield* restore(
            exchange.refreshToken(stored.refresh_token, credential.registryUrl),
          );
          yield* store.save(credential.registryUrl, stored.handle, {
            access_token: renewed.access_token,
            refresh_token: renewed.refresh_token,
            expires_at: renewed.expires_at,
          });
          return renewed;
        }),
      ).pipe(
        Effect.tapError((error) =>
          error._tag === "RefreshUnavailable"
            ? Effect.void
            : remember(credential, { _tag: "Ended" }).pipe(
                Effect.andThen(
                  error._tag === "SessionEnded" ? forget(credential.registryUrl) : Effect.void,
                ),
              ),
        ),
      );

    /**
     * Renew under both locks. The in-process permit keeps this invocation's own
     * fibers to one attempt; the store's lock does the same across every
     * process sharing the credential home. Inside, the store is read past the
     * session memo: if the token on disk is no longer the one being replaced,
     * some other holder of the lock has already rotated it and that result is
     * the answer.
     */
    const renewUnderLock = (credential: CredentialStoreTokenSource) =>
      Effect.gen(function* () {
        const memoized = yield* recall(credential);
        if (Option.isSome(memoized)) return yield* settle(memoized.value, credential.registryUrl);

        const stored = yield* store.reload(credential.registryUrl);
        if (Option.isNone(stored)) {
          yield* remember(credential, { _tag: "Ended" });
          return yield* new SessionEnded({ registryUrl: credential.registryUrl });
        }
        if (stored.value.access_token !== credential.token) {
          return asTokenSource(credential.registryUrl, stored.value);
        }

        const renewed = yield* exchangeAndSave(credential, stored.value);
        const result = asTokenSource(credential.registryUrl, renewed);
        yield* remember(credential, { _tag: "Renewed", credential: result });
        return result;
      });

    const renew: SessionRefresherService["renew"] = Effect.fn("SessionRefresher.renew")(
      function* (credential) {
        const memoized = yield* recall(credential);
        if (Option.isSome(memoized)) return yield* settle(memoized.value, credential.registryUrl);

        return yield* Effect.scoped(
          Effect.flatMap(RcMap.get(locks, credential.registryUrl), (lock) =>
            lock.withPermits(1)(store.withRefreshLock(renewUnderLock(credential))),
          ),
        );
      },
    );

    const fresh: SessionRefresherService["fresh"] = Effect.fn("SessionRefresher.fresh")(
      function* (credential) {
        const now = yield* DateTime.now;
        const secondsLeft =
          (DateTime.toEpochMillis(credential.expires_at) - DateTime.toEpochMillis(now)) / 1000;
        return secondsLeft > REFRESH_SKEW_SECONDS ? credential : yield* renew(credential);
      },
    );

    return { fresh, renew } satisfies SessionRefresherService;
  }),
);
