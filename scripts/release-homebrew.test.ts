import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Redacted from "effect/Redacted";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { loadHomebrewPublicationToken, readHomebrewFormula } from "./release-homebrew.js";
import { PublicationHttpError } from "./release-publication.js";

const fixtureToken = "homebrew-publication-fixture";

describe("Homebrew publication reads", () => {
  for (const environment of [{}, { HOMEBREW_TAP_TOKEN: "" }]) {
    it.effect(
      `rejects an absent or empty publication credential: ${JSON.stringify(environment)}`,
      () =>
        Effect.gen(function* () {
          const failure = yield* Effect.flip(
            loadHomebrewPublicationToken(ConfigProvider.fromEnvRecord(environment)),
          );
          expect(failure._tag).toBe("ConfigError");
          expect(String(failure)).toContain("HOMEBREW_TAP_TOKEN");
        }),
    );
  }

  it.effect("reads an authenticated formula while keeping configuration redacted", () =>
    Effect.gen(function* () {
      const token = yield* loadHomebrewPublicationToken(
        ConfigProvider.fromEnvRecord({ HOMEBREW_TAP_TOKEN: fixtureToken }),
      );
      expect(JSON.stringify(token)).not.toContain(fixtureToken);
      const formula = 'class Axm < Formula\n  version "0.41.0"\nend\n';
      const client = HttpClient.make((request) =>
        Effect.sync(() => {
          expect(request.url).toBe(
            "https://api.github.com/repos/agentxm/homebrew-tap/contents/Formula/axm.rb?ref=main",
          );
          expect(request.headers["authorization"]).toBe(`Bearer ${fixtureToken}`);
          expect(request.headers["cache-control"]).toBe("no-cache");
          return HttpClientResponse.fromWeb(request, new Response(formula));
        }),
      );
      expect(
        yield* readHomebrewFormula(token).pipe(
          Effect.provideService(HttpClient.HttpClient, client),
        ),
      ).toBe(formula);
    }),
  );

  it.effect("preserves retry metadata without exposing credentials or response bodies", () =>
    Effect.gen(function* () {
      const client = HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(fixtureToken, { status: 429, headers: { "retry-after": "2" } }),
          ),
        ),
      );
      const failure = yield* Effect.flip(
        readHomebrewFormula(Redacted.make(fixtureToken)).pipe(
          Effect.provideService(HttpClient.HttpClient, client),
        ),
      );
      expect(failure).toEqual(
        new PublicationHttpError("Homebrew formula query failed: HTTP 429.", 429, 2000),
      );
      expect(JSON.stringify(failure)).not.toContain(fixtureToken);
    }),
  );

  it.effect("propagates cancellation to an in-flight client request", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const interrupted = yield* Deferred.make<void>();
      const client = HttpClient.make(() =>
        Effect.andThen(Deferred.succeed(started, undefined), Effect.never).pipe(
          Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
        ),
      );
      const fiber = yield* Effect.forkChild(
        readHomebrewFormula(Redacted.make(fixtureToken)).pipe(
          Effect.provideService(HttpClient.HttpClient, client),
        ),
      );
      yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      expect(yield* Deferred.isDone(interrupted)).toBe(true);
    }),
  );
});
