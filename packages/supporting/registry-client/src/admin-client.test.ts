import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

import { makeRegistryLifecycleClient } from "./admin-client.js";

const REGISTRY = decodeHttpRegistryEndpointSync("https://registry.agentxm.ai");

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
      requestId: "req_admin_123",
    };
    const lifecycle = makeRegistryLifecycleClient(
      REGISTRY,
      makeHttpClient(() =>
        Response.json(body, {
          status: 418,
        }),
      ),
    );

    return Effect.gen(function* () {
      const error = yield* lifecycle
        .getExtensionDeprecation({
          owner: "@acme",
          type: "skill",
          name: "review",
        })
        .pipe(Effect.flip);

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
    });
  });
});
