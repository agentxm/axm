import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { RegistryUrl } from "@agentxm/registry-client";
import { defineSpecification } from "@agentxm/specification-metadata";

import { AuthClient, AuthClientLive } from "./auth-client.js";

export const specification = defineSpecification({
  requirement: "cli/login/uses-matching-hosted-authorization-origin",
  title: "Browser sign-in uses the selected Registry's paired web origin",
  statement:
    "When browser sign-in targets a Registry, AXM shall derive the authorization request origin and the expected callback issuer from that Registry's own origin, for the hosted Registries and for the paired local development surface.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption"],
  boundary: "memory",
  methods: ["example"],
  derivedFrom: ["cli/login/browser-sign-in-uses-the-local-web-surface"],
  supersedes: ["cli/login/browser-sign-in-uses-the-local-web-surface"],
  assumptions: [
    "The hosted Registry and web origins are configured as the environment pairs exercised here.",
  ],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "In-memory evidence verifies request routing and issuer selection but does not establish availability of the deployed authorization endpoint, browser launch, callback exchange, or credential persistence.",
      retirementCondition:
        "Released CLI browser sign-in is verified against each deployed environment, and these examples are combined with live loopback journey evidence and cli/login/browser-completion-follows-credential-persistence.",
    },
  ],
});

/** Constructing an authorization URL is a pure derivation; no request is sent. */
const refusesHttp = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make(() => Effect.die("Authorization URL construction must not send HTTP requests")),
);

describe("Browser sign-in authorization origin", () => {
  for (const { registry, web } of [
    { registry: "https://registry.agentxm.ai", web: "https://agentxm.ai" },
    { registry: "https://registry-dev.agentxm.ai", web: "https://web-dev.agentxm.ai" },
    { registry: "http://localhost:4300", web: "http://localhost:4200" },
    { registry: "http://localhost:4310", web: "http://localhost:4210" },
    { registry: "http://127.0.0.1:4320", web: "http://127.0.0.1:4220" },
  ]) {
    it.effect(`pairs ${registry} with ${web}`, () =>
      Effect.gen(function* () {
        const client = yield* AuthClient;
        const url = new URL(
          client.buildAuthorizeUrl({
            challenge: "fixture-challenge",
            state: "fixture-state",
            redirectUri: "http://127.0.0.1:49152/callback",
          }),
        );
        expect(url.origin).toBe(web);
        expect(client.getAuthorizationIssuer()).toBe(web);
      }).pipe(
        Effect.provide(
          AuthClientLive.pipe(
            Layer.provide(Layer.mergeAll(Layer.succeed(RegistryUrl, registry), refusesHttp)),
          ),
        ),
      ),
    );
  }
});
