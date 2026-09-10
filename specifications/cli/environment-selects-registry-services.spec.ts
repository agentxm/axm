import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ConfigProvider from "effect/ConfigProvider";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  AuthClient,
  AuthClientLive,
  RegistryUrl,
  runtimeBaseLayer,
} from "axm.sh/specification-harness";
import {
  makeEnvironmentProcessFixture,
  withEnvironmentRegistry,
} from "../support/environment-process-fixture.js";
import { readExtensionIndex } from "../support/read-harness.js";

export const specification = defineSpecification({
  requirement: "cli/environment-selects-registry-services",
  title: "Registry services use the selected environment origin",
  statement:
    "AXM shall use an HTTP(S) AXM_REGISTRY_LOCATION as its Registry service and authentication target, retain file-source selection independently, and reject an explicitly different AXM_REGISTRY_URL origin before a Registry request.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "extension-adoption"],
  boundary: "process",
  boundaryRationale:
    "A built CLI view retrieves distinct metadata from a local HTTP origin; separate runtime-layer cases retain production environment decoding and AuthClient request construction while controlling the HTTP transport to avoid real Registry access.",
  methods: ["example", "decision-table"],
  derivedFrom: ["apps/cli/help/topics/environment.md", "apps/cli/src/runtime.ts"],
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

  it("the registered view command reads from the explicit service origin", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      await withEnvironmentRegistry(
        () => ({
          body: JSON.stringify({
            ...readExtensionIndex,
            description: "Selected environment service",
          }),
        }),
        async (origin, requests) => {
          const result = await fixture.run(["view", "@acme/skills/review", "--json"], {
            AXM_REGISTRY_URL: origin,
          });
          expect(result.exitCode, result.stdout + result.stderr).toBe(0);
          const document: unknown = JSON.parse(result.stdout);
          expect(document).toMatchObject({
            result: { description: "Selected environment service" },
          });
          expect(requests).toEqual(["/v1/extensions/@acme/skills/review"]);
        },
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects conflicting HTTP selectors before contacting either Registry", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      await withEnvironmentRegistry(
        () => ({ body: JSON.stringify(readExtensionIndex) }),
        async (origin, requests) => {
          const result = await fixture.run(["view", "@acme/skills/review", "--json"], {
            AXM_REGISTRY_LOCATION: origin,
            AXM_REGISTRY_URL: "https://different.example.test/private",
          });
          expect(result.exitCode).not.toBe(0);
          expect(result.stderr).toContain("AXM_REGISTRY_LOCATION");
          expect(result.stderr).toContain("AXM_REGISTRY_URL");
          expect(result.stderr).not.toContain("/private");
          expect(requests).toEqual([]);
        },
      );
    } finally {
      fixture.cleanup();
    }
  });
});
