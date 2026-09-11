import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ConfigProvider from "effect/ConfigProvider";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { AuthClient } from "@agentxm/registry-auth";
import { AuthClientLive } from "@agentxm/registry-auth/live";
import { RegistryUrl } from "@agentxm/registry-client";
import { runtimeBaseLayer } from "./runtime.js";

export const specification = defineSpecification({
  requirement: "cli/environment-selects-registry-services",
  title: "Registry services use the selected environment origin",
  statement:
    "AXM shall use an HTTP(S) AXM_REGISTRY_LOCATION as its Registry service and authentication target, retain file-source selection independently, and reject an explicitly different AXM_REGISTRY_URL origin before a Registry request.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "extension-adoption"],
  boundary: "memory",
  boundaryRationale:
    "The composition root decodes the environment and builds the Registry and authentication targets; composing it over a controlled HTTP transport shows the selected origin reaching the request without contacting a real Registry. The built-CLI rows are bound evidence at apps/cli-e2e/src/registry-service-origin.e2e.test.ts.",
  methods: ["example", "decision-table"],
  derivedFrom: [
    "apps/cli/help/topics/environment.md",
    "apps/cli/src/runtime.ts",
    "apps/cli-e2e/src/registry-service-origin.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const deviceResponse = {
  device_code: "fixture-device-code",
  user_code: "CODE-1234",
  verification_uri: "https://identity.example.test/device",
  verification_uri_complete: "https://identity.example.test/device?code=CODE-1234",
  interval: 5,
  expires_in: 60,
};

describe("Environment Registry service origin", () => {
  const scenarios: ReadonlyArray<{
    readonly name: string;
    readonly env: Readonly<Record<string, string>>;
    readonly expected: string;
    readonly expectedAuthorizationOrigin: string;
  }> = [
    {
      name: "unset",
      env: {},
      expected: "https://registry.agentxm.ai",
      expectedAuthorizationOrigin: "https://agentxm.ai",
    },
    {
      name: "empty",
      env: { AXM_REGISTRY_URL: "" },
      expected: "https://registry.agentxm.ai",
      expectedAuthorizationOrigin: "https://agentxm.ai",
    },
    {
      name: "custom service URL",
      env: { AXM_REGISTRY_URL: "https://selected.example.test" },
      expected: "https://selected.example.test",
      expectedAuthorizationOrigin: "https://selected.example.test",
    },
    {
      name: "custom HTTP source",
      env: { AXM_REGISTRY_LOCATION: "https://source.example.test" },
      expected: "https://source.example.test",
      expectedAuthorizationOrigin: "https://source.example.test",
    },
    {
      name: "hosted development",
      env: { AXM_REGISTRY_URL: "https://registry-dev.agentxm.ai" },
      expected: "https://registry-dev.agentxm.ai",
      expectedAuthorizationOrigin: "https://web-dev.agentxm.ai",
    },
    {
      name: "local development",
      env: { AXM_REGISTRY_URL: "http://127.0.0.1:4300" },
      expected: "http://127.0.0.1:4300",
      expectedAuthorizationOrigin: "http://127.0.0.1:4200",
    },
  ];
  for (const scenario of scenarios)
    it.effect(`${scenario.name} value reaches the authentication HTTP boundary`, () => {
      const requests: string[] = [];
      const http = HttpClient.make((request) =>
        Effect.sync(() => {
          requests.push(request.url);
          return HttpClientResponse.fromWeb(
            request,
            new Response(JSON.stringify(deviceResponse), {
              headers: { "content-type": "application/json" },
            }),
          );
        }),
      );
      const runtime = runtimeBaseLayer.pipe(
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: scenario.env }))),
      );
      const services = Layer.mergeAll(
        runtime,
        AuthClientLive.pipe(
          Layer.provide(Layer.mergeAll(runtime, Layer.succeed(HttpClient.HttpClient, http))),
        ),
      );
      return Effect.gen(function* () {
        expect(yield* RegistryUrl).toBe(scenario.expected);
        const client = yield* AuthClient;
        expect(client.getAuthorizationIssuer()).toBe(scenario.expectedAuthorizationOrigin);
        expect((yield* client.initiateDeviceFlow()).user_code).toBe(deviceResponse.user_code);
        expect(requests).toHaveLength(1);
        expect(new URL(requests[0] ?? "").origin).toBe(scenario.expected);
      }).pipe(Effect.provide(services));
    });

  // The two built-CLI rows — a `view --json` reading from the explicit service
  // origin, and the refusal of conflicting HTTP selectors before any request —
  // need a real process and a real HTTP origin. They run in
  // `apps/cli-e2e/src/registry-service-origin.e2e.test.ts`, bound to this
  // requirement through that file's `executionBinding`.
});
