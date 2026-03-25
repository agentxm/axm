import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as Config from "effect/Config";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Effect from "effect/Effect";

import { AuthClientLive } from "../auth/auth-client.js";
import { AuthMiddlewareLive, RegistryUrl } from "../auth/auth-middleware.js";
import { CredentialStoreLive } from "../auth/credential-store.js";

const RegistryUrlLayer = Layer.orDie(
  Layer.effect(
    RegistryUrl,
    Effect.gen(function* () {
      return yield* Config.string("AXM_REGISTRY_URL").pipe(
        Config.withDefault("https://registry.agentxm.ai"),
      );
    }),
  ),
);

const PlatformLayer = Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer);

const AuthServicesLayer = Layer.provide(
  Layer.mergeAll(CredentialStoreLive, AuthClientLive, RegistryUrlLayer),
  PlatformLayer,
);

const AuthMiddlewareWrappedLayer = Layer.provide(
  AuthMiddlewareLive,
  Layer.mergeAll(AuthServicesLayer, PlatformLayer),
);

const AuthLayer = Layer.mergeAll(NodeServices.layer, AuthServicesLayer, AuthMiddlewareWrappedLayer);

export const baseLayer = Layer.mergeAll(AuthLayer, Logger.layer([], { mergeWithExisting: false }));
