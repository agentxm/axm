import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { RegistryHttpClient } from "@agentxm/registry-client";
import { CurrentWorkObserver, type WorkFact } from "@agentxm/host-primitives/work-observation";

import { TokenExchangeTest } from "../authentication/auth-client.js";
import { recordTrace } from "../test-support/test-helpers.js";
import {
  GitHubActionsIdentity,
  WorkloadCredentials,
  WorkloadCredentialsLive,
} from "./workload-credentials.js";

const registry = decodeHttpRegistryEndpointSync("https://registry.example.test");
const other = decodeHttpRegistryEndpointSync("https://other.example.test");
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
      Layer.merge(Layer.succeed(RegistryHttpClient, transport), exchange),
    ),
  };
};

describe("WorkloadCredentialsLive", () => {
  it.effect("keeps a workload token with time left for the rest of the invocation", () => {
    const { counts, layer } = makeLayer(() => ({ seconds: 900 }));
    const trace = recordTrace();
    const facts: WorkFact[] = [];
    const owners: Array<string | undefined> = [];
    return Effect.gen(function* () {
      const workload = yield* WorkloadCredentials;
      const first = yield* workload.tokenFor(identity, registry);
      const second = yield* workload.tokenFor(identity, registry);
      expect(second.token).toBe(first.token);
      expect(counts).toEqual({ idTokens: 1, exchanges: 1 });
      const caches = facts.filter((fact) => fact.kind === "axm.auth.cache");
      expect(caches).toHaveLength(2);
      expect(caches.map((fact) => fact.attributes["axm.cache.outcome"])).toEqual(["miss", "hit"]);
      expect(caches.map((fact) => fact.attributes["axm.work.executed"])).toEqual([1, 0]);
      expect(caches.map((fact) => fact.attributes["axm.work.reused-count"])).toEqual([0, 1]);
      expect(
        caches.every(
          (fact) =>
            fact.outcome === "success" && fact.attributes["axm.auth.cache-kind"] === "workload",
        ),
      ).toBe(true);
      const calls = trace.spans.filter((span) => span.name === "WorkloadCredentials.tokenFor");
      expect(calls).toHaveLength(2);
      expect(owners).toEqual(calls.map((span) => span.spanId));
      expect(trace.spans.filter((span) => span.name === "axm.auth.cache")).toHaveLength(0);
      expect(
        trace.spans.filter((span) => span.attributes.get("axm.auth.purpose") === "id-token"),
      ).toHaveLength(counts.idTokens);
    }).pipe(
      Effect.provide(layer),
      Effect.provideService(CurrentWorkObserver, {
        record: (fact, parent) => {
          facts.push(fact);
          owners.push(parent?.spanId);
        },
        detailSelected: () => false,
      }),
      Effect.withTracer(trace.tracer),
      Effect.withTracerEnabled(true),
    );
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
      expect(Option.isNone(yield* workload.held(other))).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("exchanges separately for each Registry origin", () => {
    const { counts, layer } = makeLayer(() => ({ seconds: 900 }));
    return Effect.gen(function* () {
      const workload = yield* WorkloadCredentials;
      yield* workload.tokenFor(identity, registry);
      const otherToken = yield* workload.tokenFor(identity, other);
      expect(otherToken.endpoint).toEqual(other);
      expect(counts).toEqual({ idTokens: 2, exchanges: 2 });
    }).pipe(Effect.provide(layer));
  });
});
