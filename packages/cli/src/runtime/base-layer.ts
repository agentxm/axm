import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Effect from "effect/Effect";

import { AuthClientLive } from "../auth/auth-client.js";
import { AuthMiddlewareLive, RegistryUrl } from "../auth/auth-middleware.js";
import { CredentialStoreLive } from "../auth/credential-store.js";
import { CliEnvConfig, CliEnvConfigLive } from "../config/index.js";

export const CliEnvConfigOrDie: Layer.Layer<CliEnvConfig> = Layer.orDie(CliEnvConfigLive);

const RegistryUrlLayer = Layer.effect(
  RegistryUrl,
  Effect.map(CliEnvConfig.asEffect(), (cfg) => cfg.registryUrl),
);

const PlatformLayer = Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer);

const AuthServicesLayer = Layer.provide(
  Layer.mergeAll(CredentialStoreLive, AuthClientLive, RegistryUrlLayer),
  Layer.mergeAll(PlatformLayer, CliEnvConfigOrDie),
);

const AuthMiddlewareWrappedLayer = Layer.provide(
  AuthMiddlewareLive,
  Layer.mergeAll(AuthServicesLayer, PlatformLayer, CliEnvConfigOrDie),
);

const AuthLayer = Layer.mergeAll(NodeServices.layer, AuthServicesLayer, AuthMiddlewareWrappedLayer);

export const baseLayer = Layer.mergeAll(
  AuthLayer,
  CliEnvConfigOrDie,
  Logger.layer([], { mergeWithExisting: false }),
);
