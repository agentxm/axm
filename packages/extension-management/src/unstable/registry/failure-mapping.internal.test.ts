import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { captureRegistryErrorResponseBodies, mapRegistryFailure } from "./failure-mapping.js";

const context = {
  baseUrl: "https://registry.agentxm.ai",
  networkDetail: "Failed to connect to the Registry.",
  incompatibleDetail: "The Registry response does not match the expected contract.",
  requestConstructionDetail: "Could not construct the Registry request.",
  fallbackDetail: "The Registry request failed.",
};

const responseFor = (status: number) =>
  HttpClientResponse.fromWeb(
    HttpClientRequest.get("https://registry.agentxm.ai/test"),
    new Response("", { status }),
  );

describe("mapRegistryFailure", () => {
  it.effect("recovers and retains an undeclared JSON response", () =>
    Effect.gen(function* () {
      const body = {
        title: "Unavailable",
        detail: "Maintenance is in progress.",
        status: 400,
        code: "maintenance",
        requestId: "req_json",
      };
      const client = captureRegistryErrorResponseBodies(
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(JSON.stringify(body), { status: 503 }),
            ),
          ),
        ),
      );
      const response = yield* client.get("https://registry.agentxm.ai/test");
      const cause = new HttpClientError.HttpClientError({
        reason: new HttpClientError.StatusCodeError({
          request: response.request,
          response,
          description: JSON.stringify(body),
        }),
      });

      const error = mapRegistryFailure(cause, context);

      expect(error.code).toBe("unavailable");
      expect(error.detail).toBe("Maintenance is in progress.");
      expect(error.metadata?.response).toEqual({
        status: 503,
        requestId: "req_json",
        problemCode: "maintenance",
        body,
      });
      expect(error.cause).toBe(cause);
    }),
  );

  it.effect.each([
    ["text", "gateway unavailable", "gateway unavailable"],
    ["malformed JSON", '{"detail":', '{"detail":'],
    ["empty", "", ""],
  ])("retains an undeclared %s response", ([, responseBody, expectedBody]) =>
    Effect.gen(function* () {
      const client = captureRegistryErrorResponseBodies(
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(request, new Response(responseBody, { status: 502 })),
          ),
        ),
      );
      const response = yield* client.get("https://registry.agentxm.ai/test");
      const cause = new HttpClientError.HttpClientError({
        reason: new HttpClientError.StatusCodeError({
          request: response.request,
          response,
          description: "Unexpected status code",
        }),
      });

      const error = mapRegistryFailure(cause, context);

      expect(error.code).toBe("internal");
      expect(error.metadata?.response).toEqual({ status: 502, body: expectedBody });
      expect(error.cause).toBe(cause);
    }),
  );

  it("classifies response decoding separately from transport failure", () => {
    const response = responseFor(200);
    const decodeCause = new HttpClientError.HttpClientError({
      reason: new HttpClientError.DecodeError({
        request: response.request,
        response,
        cause: new SyntaxError("invalid JSON"),
      }),
    });
    const transportCause = new HttpClientError.HttpClientError({
      reason: new HttpClientError.TransportError({
        request: response.request,
        cause: new Error("ECONNRESET"),
      }),
    });

    const decoded = mapRegistryFailure(decodeCause, context);
    const transported = mapRegistryFailure(transportCause, context);

    expect(decoded.code).toBe("internal");
    expect(decoded.detail).toContain("does not match");
    expect(decoded.metadata?.response?.status).toBe(200);
    expect(decoded.cause).toBe(decodeCause);
    expect(transported.code).toBe("network");
    expect(transported.metadata?.response).toBeUndefined();
    expect(transported.cause).toBe(transportCause);
  });

  it.each(["EncodeError", "InvalidUrlError"] as const)(
    "classifies %s as request construction rather than network failure",
    (tag) => {
      const request = HttpClientRequest.get("https://registry.agentxm.ai/test");
      const reason =
        tag === "EncodeError"
          ? new HttpClientError.EncodeError({ request, cause: new Error("encode") })
          : new HttpClientError.InvalidUrlError({ request, cause: new Error("url") });
      const cause = new HttpClientError.HttpClientError({ reason });

      const error = mapRegistryFailure(cause, context);

      expect(error.code).toBe("internal");
      expect(error.detail).toBe("Could not construct the Registry request.");
      expect(error.cause).toBe(cause);
    },
  );
});
