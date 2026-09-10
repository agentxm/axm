import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { AuthClient, AuthClientLive, RegistryUrl } from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/specification-metadata";

export const specification = defineSpecification({
  requirement: "cli/login/uses-matching-hosted-authorization-origin",
  title: "Hosted browser sign-in uses the selected Registry's web origin",
  statement:
    "When browser sign-in targets an AgentXM-hosted Registry, AXM shall use the corresponding web origin for the authorization request and expected callback issuer.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "The hosted Registry and web origins are configured as the environment pairs exercised here.",
  ],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "In-memory evidence verifies request routing and issuer selection but does not establish availability of the deployed authorization endpoint.",
      retirementCondition:
        "Released CLI browser sign-in is verified against each deployed environment.",
    },
  ],
});

describe("Hosted browser sign-in routing", () => {
  for (const { registry, web } of [
    { registry: "https://registry.agentxm.ai", web: "https://agentxm.ai" },
    { registry: "https://registry-dev.agentxm.ai", web: "https://web-dev.agentxm.ai" },
  ]) {
    it.effect(`uses the matching web origin for ${registry}`, () => {
      const layer = AuthClientLive.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(RegistryUrl, registry),
            Layer.succeed(
              HttpClient.HttpClient,
              HttpClient.make(() =>
                Effect.die("Authorization URL construction must not send HTTP requests"),
              ),
            ),
          ),
        ),
      );
      return Effect.gen(function* () {
        const client = yield* AuthClient;
        const url = new URL(
          client.buildAuthorizeUrl({
            challenge: "fixture-challenge",
            state: "fixture-state",
            redirectUri: "http://127.0.0.1:49152/callback",
          }),
        );
        expect(url.origin).toBe(web);
        expect(url.pathname).toBe("/oauth/authorize");
        expect(client.getAuthorizationIssuer()).toBe(web);
        expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:49152/callback");
        expect(url.searchParams.get("code_challenge_method")).toBe("S256");
        expect(url.searchParams.get("code_challenge")).toBe("fixture-challenge");
        expect(url.searchParams.get("state")).toBe("fixture-state");
      }).pipe(Effect.provide(layer));
    });
  }
});
