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
    "When AXM_REGISTRY_LOCATION is unset, AXM shall direct default Registry service and authentication requests to a non-empty AXM_REGISTRY_URL, or to https://registry.agentxm.ai when AXM_REGISTRY_URL is unset or empty.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "extension-adoption"],
  boundary: "process",
  boundaryRationale:
    "A built CLI view retrieves distinct metadata from a local HTTP origin; separate runtime-layer cases retain production environment decoding and AuthClient request construction while controlling the HTTP transport to avoid real Registry access.",
  methods: ["example", "decision-table"],
  derivedFrom: ["packages/cli/help/topics/environment.md", "packages/cli/src/runtime.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "When AXM_REGISTRY_LOCATION and AXM_REGISTRY_URL name different origins, which origin should view and authentication use? Extension-source precedence alone does not settle this service-target policy.",
  ],
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
  }> = [
    { name: "unset", env: {}, expected: "https://registry.agentxm.ai" },
    { name: "empty", env: { AXM_REGISTRY_URL: "" }, expected: "https://registry.agentxm.ai" },
    {
      name: "explicit",
      env: { AXM_REGISTRY_URL: "https://selected.example.test" },
      expected: "https://selected.example.test",
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
});
