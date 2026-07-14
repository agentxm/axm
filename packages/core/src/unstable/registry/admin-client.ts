import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import { type AppError, makeAppError } from "../app-error/index.js";
import { RegistryUrl } from "../auth/index.js";
import {
  isAnyRegistryClientError,
  isHttpClientError,
  isSchemaError,
  mapNetworkError,
  mapSchemaError,
} from "./error-mapping.js";
import { registryClientErrorToAppError } from "./translate.js";
import * as GeneratedRegistryClient from "./__generated__/registry-client.js";

export type ExtensionMaintainer = GeneratedRegistryClient.Maintainer;
export type ExtensionMaintainerTarget = GeneratedRegistryClient.MaintainerTarget;

export interface RegistryExtensionReference {
  readonly owner: string;
  readonly type: string;
  readonly name: string;
}

export interface RegistryExtensionVersionReference extends RegistryExtensionReference {
  readonly version: string;
}

export type YankCategory = "broken" | "security" | "accidental" | "other";

export interface RegistryLifecycleCallOptions {
  readonly stepUpToken?: string;
}

const mapAdminClientError =
  (registryUrl: string) =>
  (error: unknown): AppError => {
    if (isAnyRegistryClientError(error)) {
      return registryClientErrorToAppError(error);
    }

    if (isHttpClientError(error)) {
      return mapNetworkError(error, "Registry request failed.", registryUrl);
    }

    if (isSchemaError(error)) {
      return mapSchemaError(error, "Registry response did not match the expected schema.");
    }

    return makeAppError({
      code: "internal",
      detail: "Unexpected registry client failure.",
      cause: error,
    });
  };

const makeAdminClient = Effect.gen(function* () {
  const registryUrl = yield* RegistryUrl;
  const httpClient = yield* HttpClient.HttpClient;
  const remoteHttpClient = httpClient.pipe(
    HttpClient.mapRequest(HttpClientRequest.prependUrl(registryUrl)),
  );
  return {
    registryUrl,
    client: GeneratedRegistryClient.make(remoteHttpClient),
  };
});

const makeLifecycleClient = (options?: RegistryLifecycleCallOptions) =>
  Effect.gen(function* () {
    const registryUrl = yield* RegistryUrl;
    const httpClient = yield* HttpClient.HttpClient;
    const remoteHttpClient = httpClient.pipe(
      HttpClient.mapRequest((request) => {
        const withUrl = HttpClientRequest.prependUrl(request, registryUrl);
        return options?.stepUpToken === undefined
          ? withUrl
          : HttpClientRequest.setHeaders(withUrl, {
              "x-axm-step-up": options.stepUpToken,
            });
      }),
    );
    return {
      registryUrl,
      client: GeneratedRegistryClient.make(remoteHttpClient),
    };
  });

const runAdminCall = <A, R>(
  registryUrl: string,
  effect: Effect.Effect<A, unknown, R>,
): Effect.Effect<A, AppError, R> => effect.pipe(Effect.mapError(mapAdminClientError(registryUrl)));

export const getExtensionMaintainer = (
  ref: RegistryExtensionReference,
): Effect.Effect<ExtensionMaintainer, AppError, HttpClient.HttpClient | RegistryUrl> =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeAdminClient;
    return yield* runAdminCall(
      registryUrl,
      client.MaintainerGetMaintainer(ref.owner, ref.type, ref.name, undefined),
    );
  });

export const setExtensionMaintainer = (
  ref: RegistryExtensionReference,
  target: ExtensionMaintainerTarget,
) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeAdminClient;
    return yield* runAdminCall(
      registryUrl,
      client.MaintainerSetMaintainer(ref.owner, ref.type, ref.name, { payload: target }),
    );
  });

export const clearExtensionMaintainer = (ref: RegistryExtensionReference) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeAdminClient;
    return yield* runAdminCall(
      registryUrl,
      client.MaintainerClearMaintainer(ref.owner, ref.type, ref.name, undefined),
    );
  });

export const yankExtensionVersion = (
  ref: RegistryExtensionVersionReference,
  input: { readonly category?: YankCategory; readonly notice?: string },
  options?: RegistryLifecycleCallOptions,
) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeLifecycleClient(options);
    return yield* runAdminCall(
      registryUrl,
      client.ExtensionsYankVersion(ref.owner, ref.type, ref.name, ref.version, {
        payload: {
          ...(input.category === undefined ? {} : { category: input.category }),
          ...(input.notice === undefined ? {} : { notice: input.notice }),
        },
      }),
    );
  });

export const yankAvailableExtensionVersions = (
  ref: RegistryExtensionReference,
  input: { readonly category?: YankCategory; readonly notice?: string },
  options?: RegistryLifecycleCallOptions,
) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeLifecycleClient(options);
    return yield* runAdminCall(
      registryUrl,
      client.ExtensionsYankAvailableVersions(ref.owner, ref.type, ref.name, {
        payload: {
          selection: "all-available",
          ...(input.category === undefined ? {} : { category: input.category }),
          ...(input.notice === undefined ? {} : { notice: input.notice }),
        },
      }),
    );
  });

export const unyankExtensionVersion = (
  ref: RegistryExtensionVersionReference,
  options?: RegistryLifecycleCallOptions,
) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeLifecycleClient(options);
    return yield* runAdminCall(
      registryUrl,
      client.ExtensionsUnyankVersion(ref.owner, ref.type, ref.name, ref.version, undefined),
    );
  });

export const deprecateExtension = (ref: RegistryExtensionReference, notice: string | null) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeLifecycleClient();
    return yield* runAdminCall(
      registryUrl,
      client.ExtensionsDeprecate(ref.owner, ref.type, ref.name, { payload: { notice } }),
    );
  });

export const undeprecateExtension = (ref: RegistryExtensionReference) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeLifecycleClient();
    return yield* runAdminCall(
      registryUrl,
      client.ExtensionsUndeprecate(ref.owner, ref.type, ref.name, undefined),
    );
  });
