/**
 * Trusted publishing: the credential a GitHub Actions job presents without a
 * stored secret.
 *
 * A job granted `permissions: id-token: write` can ask GitHub for an OpenID
 * Connect ID token naming its repository, workflow, and run. The Registry
 * exchanges that token for a short-lived workload token when a trusted
 * publisher matches it. Both calls travel on the plain transport: the ID-token
 * request authenticates with the job's own request token, and the exchange
 * with the ID token in its body, so neither may carry the credential the
 * authenticated transport is still deciding on.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Cache from "effect/Cache";
import * as ServiceMap from "effect/Context";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import { envOption } from "../adapters/environment.js";
import { TokenExchange } from "../authentication/auth-client.js";
import {
  workloadTokenUnavailable,
  type RegistryAccessFailed,
  type WorkloadTokenUnavailable,
} from "../authentication/errors.js";
import { WorkloadTokenSource } from "./schema.js";

/** Where this job asks GitHub for its ID token, and the token it asks with. */
export class GitHubActionsIdentity extends Data.Class<{
  readonly requestUrl: string;
  readonly requestToken: string;
}> {}

const nonEmpty = (value: Option.Option<string>): Option.Option<string> =>
  Option.filter(value, (text) => text.length > 0);

/**
 * The GitHub Actions identity this invocation may exchange, read offline.
 *
 * GitHub sets both request variables only for a job granted
 * `permissions: id-token: write`. `AXM_TRUSTED_PUBLISHING=0` opts a job that
 * holds them for another purpose out of trusted publishing.
 */
export const githubActionsIdentity: Effect.Effect<
  Option.Option<GitHubActionsIdentity>,
  RegistryAccessFailed
> = Effect.gen(function* () {
  const optOut = yield* envOption("AXM_TRUSTED_PUBLISHING");
  if (Option.contains(optOut, "0")) return Option.none();
  const requestUrl = nonEmpty(yield* envOption("ACTIONS_ID_TOKEN_REQUEST_URL"));
  const requestToken = nonEmpty(yield* envOption("ACTIONS_ID_TOKEN_REQUEST_TOKEN"));
  return Option.isSome(requestUrl) && Option.isSome(requestToken)
    ? Option.some(
        new GitHubActionsIdentity({
          requestUrl: requestUrl.value,
          requestToken: requestToken.value,
        }),
      )
    : Option.none();
});

export interface WorkloadCredentialsService {
  /**
   * The workload token `identity` is exchanged for at `registryOrigin`. One
   * invocation exchanges an identity at most once per origin, and again only
   * when the token it holds is about to lapse; a refusal is the answer for
   * the rest of the invocation.
   */
  readonly tokenFor: (
    identity: GitHubActionsIdentity,
    registryOrigin: string,
  ) => Effect.Effect<WorkloadTokenSource, WorkloadTokenUnavailable>;
  /**
   * The workload token this invocation already holds for `registryOrigin`,
   * without exchanging anything. A request that does not need a credential
   * carries it once a command has needed one, and goes out anonymously
   * before then.
   */
  readonly held: (registryOrigin: string) => Effect.Effect<Option.Option<WorkloadTokenSource>>;
}

export class WorkloadCredentials extends ServiceMap.Service<
  WorkloadCredentials,
  WorkloadCredentialsService
>()("@agentxm/registry-access/credentials/WorkloadCredentials") {}

/** A workload token this close to expiry is exchanged again rather than presented. */
const WORKLOAD_TOKEN_EXPIRY_SKEW = Duration.seconds(60);

/** How long GitHub may take to issue an ID token before the request counts as failed. */
const ID_TOKEN_REQUEST_DEADLINE = Duration.seconds(30);

const IdTokenResponseSchema = Schema.Struct({ value: Schema.String });

class ExchangeKey extends Data.Class<{
  readonly registryOrigin: string;
  readonly requestUrl: string;
  readonly requestToken: string;
}> {}

/**
 * Why GitHub issued no ID token, kept without the request: it carried the
 * job's request token, and nothing that can mint an identity for the job
 * belongs in a log.
 */
class IdTokenRequestFailed extends Data.TaggedError("IdTokenRequestFailed")<{
  readonly message: string;
}> {}

const idTokenRequestFailed = (key: ExchangeKey, cause: unknown): WorkloadTokenUnavailable =>
  workloadTokenUnavailable(
    "id_token_request_failed",
    key.registryOrigin,
    new IdTokenRequestFailed({
      message: !HttpClientError.isHttpClientError(cause)
        ? "GitHub Actions answered the ID-token request without an ID token."
        : cause.response === undefined
          ? "The GitHub Actions ID-token endpoint could not be reached."
          : `GitHub Actions answered the ID-token request with HTTP ${String(cause.response.status)}.`,
    }),
  );

const idTokenRequest = (key: ExchangeKey) =>
  Effect.try({
    try: () => {
      const url = new URL(key.requestUrl);
      url.searchParams.set("audience", key.registryOrigin);
      return HttpClientRequest.get(url).pipe(
        HttpClientRequest.bearerToken(key.requestToken),
        HttpClientRequest.acceptJson,
      );
    },
    catch: () =>
      workloadTokenUnavailable(
        "id_token_request_failed",
        key.registryOrigin,
        new IdTokenRequestFailed({ message: "ACTIONS_ID_TOKEN_REQUEST_URL is not a URL." }),
      ),
  });

/**
 * Ask GitHub for an ID token whose audience is the Registry origin, so the
 * token proves nothing to any other service it might reach.
 */
const requestIdToken = (httpClient: HttpClient.HttpClient, key: ExchangeKey) =>
  Effect.gen(function* () {
    const request = yield* idTokenRequest(key);
    const response = yield* HttpClient.filterStatusOk(httpClient).execute(request);
    const body = yield* HttpClientResponse.schemaBodyJson(IdTokenResponseSchema)(response);
    return body.value;
  }).pipe(
    Effect.mapError((cause) =>
      cause._tag === "WorkloadTokenUnavailable" ? cause : idTokenRequestFailed(key, cause),
    ),
    Effect.timeoutOrElse({
      duration: ID_TOKEN_REQUEST_DEADLINE,
      orElse: () =>
        Effect.fail(workloadTokenUnavailable("id_token_request_failed", key.registryOrigin)),
    }),
  );

/**
 * Exchanges through a per-layer cache keyed by Registry origin and identity.
 *
 * Capacity is unbounded because the key space is the identities one process
 * holds (one per job) times the origins it treats as its default Registry
 * (one); the bound that matters is lifetime, and the cache lives exactly as
 * long as this layer, which the application builds once per invocation.
 * Every outcome is kept: a refusal does not become an acceptance by asking
 * again, and a Registry that could not be reached is not asked once per
 * request. An interrupted exchange is dropped so a later request may start
 * one. Each token an exchange yields is also held by origin, so the transport
 * can present it without ever starting an exchange itself.
 */
export const WorkloadCredentialsLive = Layer.effect(
  WorkloadCredentials,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const exchange = yield* TokenExchange;
    const cache = yield* Cache.makeWith(
      (key: ExchangeKey) =>
        Effect.gen(function* () {
          const idToken = yield* requestIdToken(httpClient, key);
          const grant = yield* exchange.exchangeWorkloadToken(idToken, key.registryOrigin);
          return new WorkloadTokenSource({
            token: grant.access_token,
            expires_at: grant.expires_at,
            registryUrl: key.registryOrigin,
          });
        }),
      { capacity: Number.POSITIVE_INFINITY, timeToLive: () => Duration.infinity },
    );

    const holdings = yield* Ref.make<ReadonlyMap<string, WorkloadTokenSource>>(new Map());

    const lookup = (key: ExchangeKey) =>
      Cache.get(cache, key).pipe(
        Effect.onInterrupt(() => Cache.invalidate(cache, key)),
        Effect.tap((token) =>
          Ref.update(holdings, (current) => new Map([...current, [key.registryOrigin, token]])),
        ),
      );

    const tokenFor: WorkloadCredentialsService["tokenFor"] = Effect.fn(
      "WorkloadCredentials.tokenFor",
    )(function* (identity, registryOrigin) {
      const key = new ExchangeKey({
        registryOrigin,
        requestUrl: identity.requestUrl,
        requestToken: identity.requestToken,
      });
      const held = yield* lookup(key);
      const now = yield* DateTime.now;
      if (
        DateTime.isGreaterThan(
          held.expires_at,
          DateTime.addDuration(now, WORKLOAD_TOKEN_EXPIRY_SKEW),
        )
      ) {
        return held;
      }
      yield* Cache.invalidate(cache, key);
      return yield* lookup(key);
    });

    const held: WorkloadCredentialsService["held"] = (registryOrigin) =>
      Effect.map(Ref.get(holdings), (current) =>
        Option.fromUndefinedOr(current.get(registryOrigin)),
      );

    return { tokenFor, held } satisfies WorkloadCredentialsService;
  }),
);

/**
 * A workload credential source with no CI identity behind it: every exchange
 * is undecided unless the test supplies an answer.
 */
export const WorkloadCredentialsTest = (overrides?: Partial<WorkloadCredentialsService>) =>
  Layer.succeed(WorkloadCredentials, {
    tokenFor: (_identity, registryOrigin) =>
      Effect.fail(workloadTokenUnavailable("exchange_unavailable", registryOrigin)),
    held: () => Effect.succeed(Option.none()),
    ...overrides,
  } satisfies WorkloadCredentialsService);
