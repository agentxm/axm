import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { stableChannelDocument } from "../../testing.js";
import { makeStableChannelCheck } from "./index.js";

const makeCheck = (respond: (request: HttpClientRequest.HttpClientRequest) => Response) =>
  makeStableChannelCheck(
    HttpClient.make((request) =>
      Effect.sync(() => HttpClientResponse.fromWeb(request, respond(request))),
    ),
  );

describe("stable-channel check adapter", () => {
  it.effect("decodes a promoted document and preserves its validator", () =>
    Effect.gen(function* () {
      const result = yield* makeCheck((request) => {
        expect(request.url).toBe("https://releases.axm.sh/v1/channels/stable.json");
        expect(request.headers["if-none-match"]).toBeUndefined();
        return new Response(JSON.stringify(stableChannelDocument()), {
          headers: { ETag: '"revision-3"' },
        });
      }).check(null);
      expect(result).toMatchObject({
        _tag: "Modified",
        etag: '"revision-3"',
        document: { version: "2.0.0" },
      });
    }),
  );

  it.effect("uses the supplied validator for conditional revalidation", () =>
    Effect.gen(function* () {
      const result = yield* makeCheck((request) => {
        expect(request.headers["if-none-match"]).toBe('"revision-3"');
        return new Response(null, { status: 304 });
      }).check('"revision-3"');
      expect(result).toEqual({ _tag: "NotModified" });
    }),
  );

  it.effect("rejects unsolicited not-modified and refused responses", () =>
    Effect.gen(function* () {
      for (const status of [304, 404, 429, 503]) {
        const error = yield* Effect.flip(
          makeCheck(() => new Response(null, { status })).check(null),
        );
        expect(error._tag).toBe("UpdateCheckUnavailable");
        expect(error.operation).toBe("channel-query");
      }
    }),
  );

  it.effect("rejects malformed and invalid release documents at the HTTP boundary", () =>
    Effect.gen(function* () {
      for (const body of [
        "not json",
        JSON.stringify({ ...stableChannelDocument(), version: "2.0.0-beta.1" }),
      ]) {
        const error = yield* Effect.flip(makeCheck(() => new Response(body)).check(null));
        expect(error._tag).toBe("UpdateCheckUnavailable");
        expect(error.operation).toBe("channel-decode");
      }
    }),
  );
});
