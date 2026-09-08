import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { AuthClient, AuthClientLive, RegistryUrl } from "axm.sh/specification-harness";

export const specification = defineSpecification({
  requirement: "cli/login/browser-sign-in-uses-the-local-web-surface",
  title: "Browser sign-in uses the paired local web surface",
  statement:
    "When AXM signs in through a loopback flow against a supported local registry port, it shall open the authorization request on the paired local web surface and validate the callback issuer against that same origin.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  boundary: "memory",
  methods: ["example"],
  derivedFrom: ["packages/registry-auth/src/auth-client.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The examples establish local origin selection but do not establish browser launch, callback exchange, or credential persistence.",
      retirementCondition:
        "Combine these examples with live loopback journey evidence and the browser-completion specification.",
    },
  ],
});

const unusedHttpClient = HttpClient.make((request) =>
  Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }))),
);

describe("Local loopback authorization surface", () => {
  for (const [registryUrl, webOrigin] of [
    ["http://localhost:4300", "http://localhost:4200"],
    ["http://localhost:4310", "http://localhost:4210"],
    ["http://127.0.0.1:4320", "http://127.0.0.1:4220"],
  ] as const) {
    it.effect(`pairs ${registryUrl} with ${webOrigin}`, () =>
      Effect.gen(function* () {
        const client = yield* AuthClient;
        const authorizeUrl = new URL(
          client.buildAuthorizeUrl({
            challenge: "challenge",
            state: "state",
            redirectUri: "http://127.0.0.1:49152/callback",
          }),
        );
        expect(authorizeUrl.origin).toBe(webOrigin);
        expect(client.getAuthorizationIssuer()).toBe(webOrigin);
      }).pipe(
        Effect.provide(
          AuthClientLive.pipe(
            Layer.provide(
              Layer.mergeAll(
                Layer.succeed(RegistryUrl, registryUrl),
                Layer.succeed(HttpClient.HttpClient, unusedHttpClient),
              ),
            ),
          ),
        ),
      ),
    );
  }
});
