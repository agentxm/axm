import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
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

  it.effect(
    "reads the formula when the API requires authentication, keeping configuration redacted",
    () =>
      Effect.gen(function* () {
        const token = yield* loadHomebrewPublicationToken(
          ConfigProvider.fromEnvRecord({ HOMEBREW_TAP_TOKEN: fixtureToken }),
        );
        expect(JSON.stringify(token)).not.toContain(fixtureToken);
        const formula = 'class Axm < Formula\n  version "0.41.0"\nend\n';
        const observed = yield* Effect.promise(() =>
          readHomebrewFormula(token, undefined, async (url, init) => {
            const request = new Request(url, init);
            expect(request.url).toBe(
              "https://api.github.com/repos/agentxm/homebrew-tap/contents/Formula/axm.rb?ref=main",
            );
            expect(request.redirect).toBe("error");
            return request.headers.get("Authorization") === `Bearer ${fixtureToken}`
              ? new Response(formula)
              : new Response("authentication required", { status: 403 });
          }),
        );
        expect(observed).toBe(formula);
      }),
  );

  it("preserves HTTP retry semantics without exposing the credential or response body", async () => {
    await expect(
      readHomebrewFormula(
        Redacted.make(fixtureToken),
        undefined,
        async () => new Response(fixtureToken, { status: 429, headers: { "retry-after": "2" } }),
      ),
    ).rejects.toEqual(
      new PublicationHttpError("Homebrew formula query failed: HTTP 429.", 429, 2000),
    );
  });

  it("propagates cancellation to the API request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      readHomebrewFormula(Redacted.make(fixtureToken), controller.signal, async (_url, init) => {
        init?.signal?.throwIfAborted();
        return new Response("must not be read");
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
