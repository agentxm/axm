import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { RegistryUrl } from "./registry-url.js";
import { getExtensionDeprecation } from "./admin-client.js";

const REGISTRY_URL = "https://registry.agentxm.ai";

const makeHttpClient = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) =>
  HttpClient.make((request) =>
    Effect.sync(() => HttpClientResponse.fromWeb(request, handler(request))),
  );

describe("Registry admin failure mapping", () => {
  it.effect("preserves an undeclared HTTP problem response", () => {
    const body = {
      title: "Registry overloaded",
      status: 503,
      detail: "Try the lifecycle operation again shortly.",
      code: "registry_overloaded",
      request_id: "req_admin_123",
    };
    const layer = Layer.mergeAll(
      Layer.succeed(
        HttpClient.HttpClient,
        makeHttpClient(() =>
          Response.json(body, {
            status: 418,
          }),
        ),
      ),
      Layer.succeed(RegistryUrl, REGISTRY_URL),
    );

    return Effect.gen(function* () {
      const error = yield* getExtensionDeprecation({
        owner: "@acme",
        type: "skill",
        name: "review",
      }).pipe(Effect.flip);

      expect(error.category).toBe("internal");
      expect(error._tag).toBe("RegistryProblem");
      if (error._tag !== "RegistryProblem") return;
      expect(error.title).toBe("Registry overloaded");
      expect(error.detail).toBe("Try the lifecycle operation again shortly.");
      expect(error.metadata?.response).toEqual({
        status: 418,
        problemCode: "registry_overloaded",
        requestId: "req_admin_123",
        body,
      });
      expect(error.cause).toMatchObject({ _tag: "HttpClientError" });
    }).pipe(Effect.provide(layer));
  });
});
