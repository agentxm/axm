import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { makeCliReleaseCatalog } from "./index.js";
import { stableChannelDocument as channelDocument } from "../../testing.js";

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
  it.effect("resolves the promoted release in one bounded channel request", () =>
    Effect.gen(function* () {
      const visited: Array<string> = [];
      const result = yield* makeCliReleaseCatalog(
        makeMockHttpClient((url) => {
          visited.push(url);
          return new Response(JSON.stringify(channelDocument("2.0.0")), { status: 200 });
        }),
      ).stable("axm-linux-x64");

      expect(visited).toEqual(["https://releases.axm.sh/v1/channels/stable.json"]);
      expect(result.targetVersion).toBe("2.0.0");
      expect(result.release.tagName).toBe("cli-v2.0.0");
      expect(result.release.binaryAssetUrl).toContain("axm-linux-x64");
      expect(result.channel?.revision).toBe(3);
    }),
  );

  it.effect("rejects invalid channel documents and missing platform assets", () =>
    Effect.gen(function* () {
      const invalid = { ...channelDocument(), version: "1.0.0-beta.1" };
      const missing = channelDocument();
      const invalidError = yield* Effect.flip(
        makeCliReleaseCatalog(
          makeMockHttpClient(() => new Response(JSON.stringify(invalid), { status: 200 })),
        ).stable("axm-linux-x64"),
      );
      const missingError = yield* Effect.flip(
        makeCliReleaseCatalog(
          makeMockHttpClient(() => new Response(JSON.stringify(missing), { status: 200 })),
        ).stable("axm-plan9-x64"),
      );

      expect(invalidError.category).toBe("validation");
      expect(missingError.category).toBe("unavailable");
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
