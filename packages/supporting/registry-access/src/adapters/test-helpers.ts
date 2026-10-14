/**
 * Owner-local fixtures for the request-authorization specifications.
 *
 * Test support only — excluded from the package build and never part of the
 * public API.
 */

import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as Layer from "effect/Layer";
import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { RegistryRequestAuthorization, registryWire } from "@agentxm/registry-client";

import { RegistryRequestAuthorizationLive } from "./request-authorization.js";

/**
 * The transport a Registry client for `registry` travels on, as the factory
 * builds it: the invocation's request authorization applied to the Registry
 * wire — confined to the origin and refusing redirects — over the base
 * transport this layer is given.
 */
export const AuthorizedTransportAt = (registry: string) =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function* () {
      const authorization = yield* RegistryRequestAuthorization;
      const base = yield* HttpClient.HttpClient;
      const endpoint = decodeHttpRegistryEndpointSync(registry);
      return authorization.authorize(endpoint, registryWire(endpoint, base));
    }),
  ).pipe(Layer.provide(RegistryRequestAuthorizationLive));
