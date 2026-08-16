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
import type {
  DeprecationManagementView,
  DeprecationReplacementIntent,
  DeprecationTransition,
  DeprecationView,
} from "./schema.js";

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
  readonly stepUpRequestId?: string;
}

export interface PutExtensionDeprecationInput {
  readonly revision: string;
  readonly message: string | null;
  readonly replacement: DeprecationReplacementIntent;
}

const normalizeDeprecation = (
  value: GeneratedRegistryClient.DeprecationView | null,
): DeprecationView | null => {
  if (value === null) return null;
  const replacement =
    value.replacement === undefined || value.replacement === null
      ? undefined
      : value.replacement.status === "available"
        ? value.replacement
        : {
            status: "unavailable" as const,
            ...(value.replacement.fqn === undefined || value.replacement.fqn === null
              ? {}
              : { fqn: value.replacement.fqn }),
          };
  if (value.message !== undefined && value.message !== null) {
    return {
      deprecatedAt: value.deprecatedAt,
      message: value.message,
      ...(replacement === undefined ? {} : { replacement }),
    };
  }
  if (replacement !== undefined) {
    return { deprecatedAt: value.deprecatedAt, replacement };
  }
  throw new Error("Registry returned deprecation without guidance.");
};

const normalizeManagementView = (
  value: GeneratedRegistryClient.DeprecationManagementView,
): DeprecationManagementView => ({
  deprecation: normalizeDeprecation(value.deprecation),
  revision: value.revision,
});

const normalizeTransition = (
  value: GeneratedRegistryClient.DeprecationTransition,
): DeprecationTransition => ({
  target: value.target,
  before: normalizeDeprecation(value.before),
  after: normalizeDeprecation(value.after),
  disposition: value.disposition,
  revision: value.revision,
});

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

const makeLifecycleClient = (options?: RegistryLifecycleCallOptions) =>
  Effect.gen(function* () {
    const registryUrl = yield* RegistryUrl;
    const httpClient = yield* HttpClient.HttpClient;
    const remoteHttpClient = httpClient.pipe(
      HttpClient.mapRequest((request) => {
        const withUrl = HttpClientRequest.prependUrl(request, registryUrl);
        return options?.stepUpRequestId === undefined
          ? withUrl
          : HttpClientRequest.setHeaders(withUrl, {
              "x-axm-step-up-request": options.stepUpRequestId,
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

export const getExtensionDeprecation = (ref: RegistryExtensionReference) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeLifecycleClient();
    const result = yield* runAdminCall(
      registryUrl,
      client.ExtensionsGetDeprecation(ref.owner, ref.type, ref.name, undefined),
    );
    return normalizeManagementView(result);
  });

export const deprecateExtension = (
  ref: RegistryExtensionReference,
  input: PutExtensionDeprecationInput,
) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeLifecycleClient();
    const result = yield* runAdminCall(
      registryUrl,
      client.ExtensionsPutDeprecation(ref.owner, ref.type, ref.name, {
        params: { "if-match": input.revision },
        payload: { message: input.message, replacement: input.replacement },
      }),
    );
    return normalizeTransition(result);
  });

export const undeprecateExtension = (ref: RegistryExtensionReference, revision: string) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeLifecycleClient();
    const result = yield* runAdminCall(
      registryUrl,
      client.ExtensionsDeleteDeprecation(ref.owner, ref.type, ref.name, {
        params: { "if-match": revision },
      }),
    );
    return normalizeTransition(result);
  });
