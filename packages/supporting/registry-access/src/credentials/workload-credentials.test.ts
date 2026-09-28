import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { TokenExchangeTest } from "../authentication/auth-client.js";
import {
  GitHubActionsIdentity,
  WorkloadCredentials,
  WorkloadCredentialsLive,
} from "./workload-credentials.js";

const registry = "https://registry.example.test";
const identity = new GitHubActionsIdentity({
  requestUrl: "https://actions.example.test/token?api-version=2.0",
  requestToken: "fixture-request-token",
});

const makeLayer = (expiresIn: (exchange: number) => { readonly seconds: number }) => {
  const counts = { idTokens: 0, exchanges: 0 };
  const transport = HttpClient.make((request) =>
    Effect.sync(() => {
      counts.idTokens += 1;
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify({ value: `fixture-id-token-${String(counts.idTokens)}` }), {
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );
  const exchange = TokenExchangeTest({
    exchangeWorkloadToken: (subjectToken) =>
      Effect.gen(function* () {
        counts.exchanges += 1;
        const now = yield* DateTime.now;
        return {
          access_token: `workload-for-${subjectToken}`,
          expires_at: DateTime.add(now, expiresIn(counts.exchanges)),
        };
      }),
  });
  return {
    counts,
    layer: Layer.provide(
      WorkloadCredentialsLive,
      Layer.merge(Layer.succeed(HttpClient.HttpClient, transport), exchange),
    ),
  };
};

describe("WorkloadCredentialsLive", () => {
  it.effect("keeps a workload token with time left for the rest of the invocation", () => {
    const { counts, layer } = makeLayer(() => ({ seconds: 900 }));
    return Effect.gen(function* () {
      const workload = yield* WorkloadCredentials;
      const first = yield* workload.tokenFor(identity, registry);
      const second = yield* workload.tokenFor(identity, registry);
      expect(second.token).toBe(first.token);
      expect(counts).toEqual({ idTokens: 1, exchanges: 1 });
    }).pipe(Effect.provide(layer));
  });

  it.effect("exchanges a fresh identity token when the held workload token is lapsing", () => {
    // The first exchange answers with a token already inside the expiry skew.
    const { counts, layer } = makeLayer((exchange) => ({ seconds: exchange === 1 ? 30 : 900 }));
    return Effect.gen(function* () {
      const workload = yield* WorkloadCredentials;
      const token = yield* workload.tokenFor(identity, registry);
      expect(token.token).toBe("workload-for-fixture-id-token-2");
      expect(counts).toEqual({ idTokens: 2, exchanges: 2 });
      // The renewed token is kept.
      yield* workload.tokenFor(identity, registry);
      expect(counts).toEqual({ idTokens: 2, exchanges: 2 });
    }).pipe(Effect.provide(layer));
  });

  it.effect("holds a token only once a command has exchanged for it", () => {
    const { counts, layer } = makeLayer(() => ({ seconds: 900 }));
    return Effect.gen(function* () {
      const workload = yield* WorkloadCredentials;
      expect(Option.isNone(yield* workload.held(registry))).toBe(true);
      expect(counts).toEqual({ idTokens: 0, exchanges: 0 });
      const token = yield* workload.tokenFor(identity, registry);
      expect(yield* workload.held(registry)).toEqual(Option.some(token));
      expect(Option.isNone(yield* workload.held("https://other.example.test"))).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("exchanges separately for each Registry origin", () => {
    const { counts, layer } = makeLayer(() => ({ seconds: 900 }));
    return Effect.gen(function* () {
      const workload = yield* WorkloadCredentials;
      yield* workload.tokenFor(identity, registry);
      const other = yield* workload.tokenFor(identity, "https://other.example.test");
      expect(other.registryUrl).toBe("https://other.example.test");
      expect(counts).toEqual({ idTokens: 2, exchanges: 2 });
    }).pipe(Effect.provide(layer));
  });
});
