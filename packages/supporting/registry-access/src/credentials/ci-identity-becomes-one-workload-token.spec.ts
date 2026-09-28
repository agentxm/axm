import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import { RegistryUrl } from "@agentxm/registry-client";
import { defineSpecification } from "@agentxm/specification-metadata";

import { TokenExchangeLive } from "../authentication/auth-client.js";
import { WorkloadTokenUnavailable } from "../authentication/errors.js";
import { currentToken } from "../authentication/identity.js";
import { AuthEnvironment } from "../adapters/environment.js";
import { AuthMiddlewareLive } from "../adapters/auth-middleware.js";
import { CredentialStoreSessionLive, CredentialStoreTest } from "./credential-store.js";
import { SessionRefresherLive } from "./session-refresh.js";
import { WorkloadCredentialsLive } from "./workload-credentials.js";

export const specification = defineSpecification({
  requirement: "cli/trusted-publishing/ci-identity-becomes-one-workload-token",
  title: "A GitHub Actions identity becomes one workload token for the default Registry",
  statement:
    "When AXM runs in a GitHub Actions job that offers an ID token and no explicit token is supplied, AXM shall read anonymously until a command needs a credential for the default Registry; shall then request the ID token with that Registry's origin as its audience and exchange it at that Registry's token endpoint for a workload token with an RFC 8693 token-exchange grant; shall present the workload token only to the default Registry origin, for the rest of the invocation; shall exchange at most once per invocation; shall never renew a workload token the Registry rejects; and, when the identity cannot be exchanged, shall refuse as requiring authentication with guidance to grant the job the id-token permission and to register the workflow as a trusted publisher, keeping neither the job's request token nor its identity token in the refusal.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["apps/cli/help/topics/environment.md", "apps/cli/site-content/docs/quickstart.md"],
  supersedes: [],
  assumptions: [
    "GitHub Actions offers an ID token to a job through ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN, answering a request carrying the request token as a bearer and an `audience` query parameter with a JSON document whose `value` is the ID token.",
  ],
  openQuestions: [],
});

const registry = "https://registry.example.test";
const otherRegistry = "https://other.example.test";
const idTokenEndpoint = "https://actions.example.test/token";

const githubActions = ConfigProvider.fromEnvRecord({
  ACTIONS_ID_TOKEN_REQUEST_URL: `${idTokenEndpoint}?api-version=2.0`,
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture-request-token",
});

interface Observed {
  readonly idTokenRequests: Array<{ readonly url: string; readonly authorization?: string }>;
  readonly exchanges: Array<Readonly<Record<string, string>>>;
  readonly reads: Array<{ readonly url: string; readonly authorization?: string }>;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** The URL a request reaches, with the query parameters the client keeps apart. */
const fullUrl = (request: HttpClientRequest.HttpClientRequest): string => {
  const url = new URL(request.url);
  for (const [key, value] of request.urlParams) url.searchParams.append(key, value);
  return url.href;
};

const formOf = (request: HttpClientRequest.HttpClientRequest): Record<string, string> =>
  request.body._tag === "Uint8Array"
    ? Object.fromEntries(new URLSearchParams(new TextDecoder().decode(request.body.body)))
    : {};

/**
 * One transport for everything a job reaches: GitHub's ID-token endpoint, the
 * Registry's token endpoint, and the Registry's reads.
 */
const makeWorld = (options: {
  readonly idToken: "issued" | "refused";
  readonly exchange: "issued" | "refused";
  readonly readStatus: number;
}) => {
  const observed: Observed = { idTokenRequests: [], exchanges: [], reads: [] };
  const transport = HttpClient.make((request) =>
    Effect.sync(() => {
      const url = new URL(request.url);
      const authorization = request.headers["authorization"];
      const respond = (response: Response) => HttpClientResponse.fromWeb(request, response);
      if (url.origin + url.pathname === idTokenEndpoint) {
        observed.idTokenRequests.push({
          url: fullUrl(request),
          ...(authorization === undefined ? {} : { authorization }),
        });
        return respond(
          options.idToken === "issued"
            ? json(200, { value: "fixture-id-token" })
            : json(403, { message: "Unable to get ACTIONS_ID_TOKEN_REQUEST_URL env variable" }),
        );
      }
      if (url.pathname === "/v1/auth/token") {
        observed.exchanges.push(formOf(request));
        return respond(
          options.exchange === "issued"
            ? json(200, {
                access_token: "fixture-workload-token",
                issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
                token_type: "Bearer",
                expires_in: 900,
                expires_at: "2099-01-01T00:00:00.000Z",
                scope: "extensions:publish:version",
              })
            : json(400, {
                kind: "TokenOAuthError",
                error: "invalid_grant",
                error_description: "The subject token was not accepted.",
              }),
        );
      }
      observed.reads.push({
        url: request.url,
        ...(authorization === undefined ? {} : { authorization }),
      });
      return respond(new Response("{}", { status: options.readStatus }));
    }),
  );
  const transportLayer = Layer.succeed(HttpClient.HttpClient, transport);
  const store = Layer.provide(CredentialStoreSessionLive, CredentialStoreTest("restricted-file"));
  const exchange = Layer.provide(TokenExchangeLive, transportLayer);
  const workload = Layer.provide(WorkloadCredentialsLive, Layer.merge(transportLayer, exchange));
  const middleware = Layer.provide(
    AuthMiddlewareLive,
    Layer.mergeAll(
      transportLayer,
      store,
      workload,
      Layer.provide(SessionRefresherLive, Layer.merge(exchange, store)),
      Layer.succeed(RegistryUrl, registry),
    ),
  );
  return { observed, layer: Layer.mergeAll(middleware, store, workload) };
};

const read = (origin: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    return yield* client.execute(HttpClientRequest.get(`${origin}/v1/extensions/@alice`));
  });

describe("GitHub Actions identity", () => {
  it.effect(
    "is exchanged once, when a command needs a credential, for the default Registry only",
    () => {
      const world = makeWorld({ idToken: "issued", exchange: "issued", readStatus: 200 });
      return Effect.gen(function* () {
        // A read before any command needed a credential goes out anonymously
        // and asks nothing of GitHub.
        yield* read(registry);
        expect(world.observed.idTokenRequests).toEqual([]);
        expect(world.observed.exchanges).toEqual([]);

        expect(yield* currentToken(registry)).toBe("fixture-workload-token");
        yield* read(registry);
        yield* read(otherRegistry);
        expect(yield* currentToken(registry)).toBe("fixture-workload-token");

        expect(world.observed.idTokenRequests).toHaveLength(1);
        const idTokenRequest = new URL(world.observed.idTokenRequests[0]?.url ?? "");
        expect(idTokenRequest.searchParams.get("audience")).toBe(registry);
        expect(idTokenRequest.searchParams.get("api-version")).toBe("2.0");
        expect(world.observed.idTokenRequests[0]?.authorization).toBe(
          "Bearer fixture-request-token",
        );

        expect(world.observed.exchanges).toEqual([
          {
            grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
            subject_token: "fixture-id-token",
            subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
            audience: registry,
            requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
          },
        ]);
        expect(world.observed.reads.map((entry) => [entry.url, entry.authorization])).toEqual([
          [`${registry}/v1/extensions/@alice`, undefined],
          [`${registry}/v1/extensions/@alice`, "Bearer fixture-workload-token"],
          [`${otherRegistry}/v1/extensions/@alice`, undefined],
        ]);
      }).pipe(Effect.provide(world.layer), Effect.provideService(AuthEnvironment, githubActions));
    },
  );

  it.effect("keeps the Registry's rejection of a workload token rather than renewing it", () => {
    const world = makeWorld({ idToken: "issued", exchange: "issued", readStatus: 401 });
    return Effect.gen(function* () {
      yield* currentToken(registry);
      const response = yield* read(registry);
      expect(response.status).toBe(401);
      expect(world.observed.reads).toHaveLength(1);
      expect(world.observed.exchanges).toHaveLength(1);
    }).pipe(Effect.provide(world.layer), Effect.provideService(AuthEnvironment, githubActions));
  });

  for (const refused of ["idToken", "exchange"] as const) {
    it.effect(`asks for a person, once, when the ${refused} is refused`, () => {
      const world = makeWorld({
        idToken: refused === "idToken" ? "refused" : "issued",
        exchange: refused === "exchange" ? "refused" : "issued",
        readStatus: 200,
      });
      return Effect.gen(function* () {
        const first = yield* Effect.flip(currentToken(registry));
        const second = yield* Effect.flip(currentToken(registry));
        for (const failure of [first, second]) {
          expect(failure).toBeInstanceOf(WorkloadTokenUnavailable);
          expect(failure._tag === "WorkloadTokenUnavailable" ? failure.reason : undefined).toBe(
            refused === "idToken" ? "id_token_request_failed" : "exchange_refused",
          );
        }
        const guidance = JSON.stringify(
          first._tag === "WorkloadTokenUnavailable" ? first.suggestions : [],
        );
        expect(guidance).toContain("`id-token` with `write`");
        expect(guidance).toContain("trusted publisher");

        // The refusal keeps what was answered, never the request that carried
        // the job's request token or its identity token.
        const reported = JSON.stringify(first);
        expect(reported).not.toContain("fixture-request-token");
        expect(reported).not.toContain("subject_token");
        expect(reported).not.toContain("_body");

        // A read that needs no credential still goes out, anonymously.
        yield* read(registry);
        expect(world.observed.reads.map((entry) => entry.authorization)).toEqual([undefined]);
        expect(world.observed.idTokenRequests).toHaveLength(1);
        expect(world.observed.exchanges).toHaveLength(refused === "exchange" ? 1 : 0);
      }).pipe(Effect.provide(world.layer), Effect.provideService(AuthEnvironment, githubActions));
    });
  }
});
