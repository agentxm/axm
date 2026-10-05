import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import { makeCliReleaseCatalog } from "./index.js";

const makeMockHttpClient = (handler: (url: string) => Response): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.sync(() => HttpClientResponse.fromWeb(request, handler(request.url))),
  );

const makeNetworkErrorClient = (): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request,
          cause: new Error("ECONNREFUSED"),
          description: "Connection refused",
        }),
      }),
    ),
  );

describe("resolveLatestVersion", () => {
  it.effect("resolves the latest stable production release in one bounded request", () =>
    Effect.gen(function* () {
      const visited: Array<string> = [];
      const result = yield* makeCliReleaseCatalog(
        makeMockHttpClient((url) => {
          visited.push(url);
          return new Response("2.0.0\n");
        }),
      ).stable("axm-linux-x64");

      expect(visited).toEqual(["https://releases.axm.sh/latest.txt"]);
      expect(result).toMatchObject({
        targetVersion: "2.0.0",
        source: "distribution-latest",
        release: {
          tagName: "cli-v2.0.0",
          binaryAssetUrl: "https://releases.axm.sh/cli-v2.0.0/axm-linux-x64",
          checksumAssetUrl: "https://releases.axm.sh/cli-v2.0.0/SHA256SUMS",
        },
      });
    }),
  );

  it.effect("rejects malformed or non-stable version pointers", () =>
    Effect.gen(function* () {
      for (const location of [
        "https://example.test/agentxm/axm/releases/tag/cli-v2.0.0",
        "2.0.0-beta.1",
      ]) {
        const error = yield* Effect.flip(
          makeCliReleaseCatalog(makeMockHttpClient(() => new Response(location))).stable(
            "axm-linux-x64",
          ),
        );
        expect(error.category).toBe("validation");
      }
    }),
  );

  it.effect("maps rate limits, upstream failures, and transport failures", () =>
    Effect.gen(function* () {
      const rateLimited = makeMockHttpClient(
        () => new Response("rate limited", { status: 429, headers: { "Retry-After": "60" } }),
      );
      const unavailable = makeMockHttpClient(
        () => new Response("upstream failure", { status: 503 }),
      );

      const rateLimitError = yield* Effect.flip(
        makeCliReleaseCatalog(rateLimited).stable("axm-linux-x64"),
      );
      expect(rateLimitError.category).toBe("rate_limit");
      expect(rateLimitError.detail).toContain("60");
      expect(
        (yield* Effect.flip(makeCliReleaseCatalog(unavailable).stable("axm-linux-x64"))).category,
      ).toBe("unavailable");
      expect(
        (yield* Effect.flip(
          makeCliReleaseCatalog(makeNetworkErrorClient()).stable("axm-linux-x64"),
        )).category,
      ).toBe("network");
    }),
  );
});
