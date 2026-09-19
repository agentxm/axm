import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import type * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import {
  GITHUB_LATEST_RELEASE_URL,
  resolveGithubLatestVersion,
  versionFromLatestReleaseLocation,
} from "./index.js";

const makeClient = (respond: (request: HttpClientRequest.HttpClientRequest) => Response) =>
  HttpClient.make((request) =>
    Effect.sync(() => HttpClientResponse.fromWeb(request, respond(request))),
  );

describe("GitHub latest release", () => {
  it.effect("resolves one normalized release tag from one web redirect", () =>
    Effect.gen(function* () {
      const requests: string[] = [];
      const version = yield* resolveGithubLatestVersion(
        makeClient((request) => {
          requests.push(request.url);
          return new Response(null, {
            status: 302,
            headers: { Location: "/agentxm/axm/releases/tag/cli-v2.0.0" },
          });
        }),
      );
      expect(version).toBe("2.0.0");
      expect(requests).toEqual([GITHUB_LATEST_RELEASE_URL]);
    }),
  );

  it("rejects foreign, malformed, and non-stable redirect locations", () => {
    for (const location of [
      "https://example.com/agentxm/axm/releases/tag/cli-v2.0.0",
      "https://github.com/agentxm/other/releases/tag/cli-v2.0.0",
      "https://github.com/agentxm/axm/releases/tag/cli-v2.0.0-beta.1",
      "https://github.com/agentxm/axm/releases/tag/v2.0.0",
      "not a URL",
    ]) {
      expect(versionFromLatestReleaseLocation(location)).toBeNull();
    }
  });

  it.effect(
    "distinguishes rate limits, unavailable responses, invalid redirects, and offline use",
    () =>
      Effect.gen(function* () {
        const cases = [
          {
            response: new Response(null, { status: 429, headers: { "Retry-After": "60" } }),
            reason: "rate-limit",
          },
          { response: new Response(null, { status: 503 }), reason: "unavailable" },
          { response: new Response(null, { status: 200 }), reason: "unexpected-status" },
          {
            response: new Response(null, { status: 302, headers: { Location: "/invalid" } }),
            reason: "invalid-location",
          },
        ] as const;
        for (const testCase of cases) {
          const error = yield* Effect.flip(
            resolveGithubLatestVersion(makeClient(() => testCase.response)),
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
        expect((yield* Effect.flip(resolveGithubLatestVersion(offline))).reason).toBe("transport");
      }),
  );
});
