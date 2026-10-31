import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { RegistryRequestAuthorization, makeRegistryClientFactory } from "@agentxm/registry-client";
import { RegistryContextTest } from "@agentxm/registry-client/testing";
import { defineSpecification } from "@agentxm/specification-metadata";

import { resolvePresentedToken, resolveRequestToken } from "./token-resolution.js";
import { SessionRefresherLive } from "./session-refresh.js";
import { TokenExchangeTest } from "../authentication/auth-client.js";
import { RegistryRequestAuthorizationLive } from "../adapters/request-authorization.js";
import {
  authCredentialFile,
  authEndpoint,
  authRegistry,
  makeAuthPorts,
  otherAuthEndpoint,
} from "../authentication/test-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/credentials-stay-with-their-registry",
  title: "Credentials stay within their Registry origin",
  statement:
    "When authenticating a Registry request, AXM shall present ambient tokens only to the Registry the settings select as the default and otherwise a credential saved under the request's Registry origin or none, shall treat equivalent spellings of one origin as one Registry and any other scheme, host, or port as another, shall make the same decision for request authorization and publication preflight, and shall refuse a Registry redirect rather than send the request on.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  methods: ["example"],
  derivedFrom: [
    "packages/supporting/registry-access/src/credentials/token-resolution.ts",
    "packages/supporting/registry-access/src/credentials/credential-key.ts",
    "packages/supporting/registry-access/src/adapters/request-authorization.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const tokenOf = (resolved: Option.Option<{ readonly token: string }>) =>
  Option.getOrUndefined(Option.map(resolved, (source) => source.token));

/** Preflight and request authorization, which must answer alike for every Registry. */
const bothDecisions = (
  operation: typeof authEndpoint,
  defaultEndpoint: typeof authEndpoint = authEndpoint,
) =>
  Effect.gen(function* () {
    const preflight = tokenOf(yield* resolveRequestToken(operation, defaultEndpoint));
    const presented = tokenOf(yield* resolvePresentedToken(operation, defaultEndpoint));
    return { preflight, presented };
  });

describe("Registry credential isolation", () => {
  it.effect("presents ambient tokens only to the default Registry", () => {
    const { layer } = makeAuthPorts({
      credentials: authCredentialFile,
      environment: { AXM_TOKEN: "fixture-environment-token" },
    });
    return Effect.gen(function* () {
      expect(yield* bothDecisions(authEndpoint)).toEqual({
        preflight: "fixture-environment-token",
        presented: "fixture-environment-token",
      });
      // An explicit selection of another Registry uses that Registry's own
      // saved session, never the ambient token.
      expect(yield* bothDecisions(otherAuthEndpoint)).toEqual({
        preflight: "fixture-other-access",
        presented: "fixture-other-access",
      });
      // The same selection when the other Registry is the default.
      expect(yield* bothDecisions(otherAuthEndpoint, otherAuthEndpoint)).toEqual({
        preflight: "fixture-environment-token",
        presented: "fixture-environment-token",
      });
    }).pipe(Effect.provide(layer));
  });

  it.effect("keys saved credentials by origin across equivalent spellings", () => {
    const { layer } = makeAuthPorts({ credentials: authCredentialFile });
    return Effect.gen(function* () {
      for (const spelling of [
        authRegistry,
        `${authRegistry}/`,
        "https://REGISTRY.example.test",
        "https://registry.example.test:443",
      ]) {
        expect(yield* bothDecisions(decodeHttpRegistryEndpointSync(spelling))).toEqual({
          preflight: "fixture-stored-access",
          presented: "fixture-stored-access",
        });
      }
      for (const origin of [
        "https://unconfigured.example.test",
        "http://registry.example.test",
        "https://registry.example.test:444",
      ]) {
        expect(yield* bothDecisions(decodeHttpRegistryEndpointSync(origin))).toEqual({
          preflight: undefined,
          presented: undefined,
        });
      }
    }).pipe(Effect.provide(layer));
  });

  it.effect("refuses a Registry redirect without sending the credential on", () => {
    const requests: Array<{ readonly url: string; readonly authorization?: string }> = [];
    const transport = HttpClient.make((request) =>
      Effect.sync(() => {
        const authorization = request.headers["authorization"];
        requests.push({
          url: request.url,
          ...(authorization === undefined ? {} : { authorization }),
        });
        return HttpClientResponse.fromWeb(
          request,
          new Response(null, {
            status: 307,
            headers: { location: "https://elsewhere.example.test/v1/me" },
          }),
        );
      }),
    );
    const { layer: ports } = makeAuthPorts({ credentials: authCredentialFile });
    const authorization = Layer.provide(
      RegistryRequestAuthorizationLive,
      Layer.mergeAll(
        Layer.provide(SessionRefresherLive, Layer.merge(TokenExchangeTest(), ports)),
        ports,
        RegistryContextTest(authRegistry),
      ),
    );
    return Effect.gen(function* () {
      const factory = yield* makeRegistryClientFactory({
        httpClient: transport,
        fileSystem: FileSystem.makeNoop({}),
        path: yield* Path.Path,
        authorization: yield* RegistryRequestAuthorization,
      });
      const { httpClient } = yield* factory.wire(authEndpoint, {
        operation: "Reading the signed-in identity",
      });
      const refused = yield* httpClient.get(`${authRegistry}/v1/me`).pipe(Effect.flip);
      expect(refused.reason._tag).toBe("TransportError");
      expect(requests).toEqual([
        { url: `${authRegistry}/v1/me`, authorization: "Bearer fixture-stored-access" },
      ]);
    }).pipe(Effect.provide(Layer.mergeAll(authorization, Path.layer)));
  });
});
