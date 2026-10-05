import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import {
  LATEST_RELEASE_URL,
  resolveLatestReleaseVersion,
  parseLatestReleaseVersion,
} from "./index.js";

const makeClient = (respond: (request: HttpClientRequest.HttpClientRequest) => Response) =>
  HttpClient.make((request) =>
    Effect.sync(() => HttpClientResponse.fromWeb(request, respond(request))),
  );

describe("Production latest release", () => {
  it.effect("resolves one stable version from one bounded request", () =>
    Effect.gen(function* () {
      const requests: string[] = [];
      const version = yield* resolveLatestReleaseVersion(
        makeClient((request) => {
          requests.push(request.url);
          return new Response("2.0.0\n");
        }),
      );
      expect(version).toBe("2.0.0");
      expect(requests).toEqual([LATEST_RELEASE_URL]);
    }),
  );

  it("rejects malformed and non-stable version pointers", () => {
    for (const location of [
      "https://example.com/2.0.0",
      "../../2.0.0",
      "2.0.0-beta.1",
      "v2.0.0",
      "2.0.0\n3.0.0",
    ]) {
      expect(parseLatestReleaseVersion(location)).toBeNull();
    }
  });

  it.effect(
    "distinguishes rate limits, unavailable responses, invalid versions, and offline use",
    () =>
      Effect.gen(function* () {
        const cases = [
          {
            response: new Response(null, { status: 429, headers: { "Retry-After": "60" } }),
            reason: "rate-limit",
          },
          { response: new Response(null, { status: 503 }), reason: "unavailable" },
          { response: new Response(null, { status: 302 }), reason: "unexpected-status" },
          {
            response: new Response("invalid"),
            reason: "invalid-version",
          },
        ] as const;
        for (const testCase of cases) {
          const error = yield* Effect.flip(
            resolveLatestReleaseVersion(makeClient(() => testCase.response)),
          );
          expect(error.reason).toBe(testCase.reason);
        }

        const offline = HttpClient.make((request) =>
          Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({
                request,
                cause: new Error("offline"),
              }),
            }),
          ),
        );
        expect((yield* Effect.flip(resolveLatestReleaseVersion(offline))).reason).toBe("transport");
      }),
  );
});
