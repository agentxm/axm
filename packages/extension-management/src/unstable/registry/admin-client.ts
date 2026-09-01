// @effect-diagnostics anyUnknownInErrorContext:off — generated HTTP response errors are normalized by this registry adapter
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import { type AppError, makeAppError } from "../app-error/index.js";
import { RegistryUrl } from "./registry-url.js";
import { captureRegistryErrorResponseBodies, mapRegistryFailure } from "./failure-mapping.js";
import {
  executeRegistryRequest,
  type RegistryRequestPolicy,
  type RegistryRequestReplaySafety,
} from "./request-policy.js";
import * as GeneratedRegistryClient from "./__generated__/registry-client.js";
import type {
  DeprecationManagementView,
  DeprecationReplacementIntent,
  DeprecationTransition,
} from "@agentxm/registry-protocol/unstable/registry/schema";
import type { DeprecationView } from "@agentxm/extension-model/unstable/extensions/deprecation";

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
  readonly requestPolicy?: RegistryRequestPolicy;
}

export interface PutExtensionDeprecationInput {
  readonly revision: string;
  readonly message: string | null;
  readonly replacement: DeprecationReplacementIntent;
}

export const normalizeRegistryDeprecation = (
  value: GeneratedRegistryClient.DeprecationView | null,
): Effect.Effect<DeprecationView | null, AppError> => {
  if (value === null) return Effect.succeed(null);
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
    return Effect.succeed({
      deprecatedAt: value.deprecatedAt,
      message: value.message,
      ...(replacement === undefined ? {} : { replacement }),
    });
  }
  if (replacement !== undefined) {
    return Effect.succeed({ deprecatedAt: value.deprecatedAt, replacement });
  }
  return Effect.fail(
    makeAppError({
      code: "internal",
      detail: "Registry response did not contain required deprecation guidance.",
    }),
  );
};

const normalizeManagementView = (value: GeneratedRegistryClient.DeprecationManagementView) =>
  Effect.map(
    normalizeRegistryDeprecation(value.deprecation),
    (deprecation) =>
      ({
        deprecation,
        revision: value.revision,
      }) satisfies DeprecationManagementView,
  );

const normalizeTransition = (value: GeneratedRegistryClient.DeprecationTransition) =>
  Effect.all({
    before: normalizeRegistryDeprecation(value.before),
    after: normalizeRegistryDeprecation(value.after),
  }).pipe(
    Effect.map(
      ({ before, after }) =>
        ({
          target: value.target,
          before,
          after,
          disposition: value.disposition,
          revision: value.revision,
        }) satisfies DeprecationTransition,
    ),
  );

const mapAdminClientError =
  (registryUrl: string) =>
  (error: unknown): AppError =>
    mapRegistryFailure(error, {
      baseUrl: registryUrl,
      networkDetail: "Registry request failed.",
      incompatibleDetail: "Registry response did not match the expected schema.",
      requestConstructionDetail: "Could not construct the Registry request.",
      fallbackDetail: "Unexpected registry client failure.",
    });

const makeLifecycleClient = (options?: RegistryLifecycleCallOptions) =>
  Effect.gen(function* () {
    const registryUrl = yield* RegistryUrl;
    const httpClient = yield* HttpClient.HttpClient;
    const remoteHttpClient = captureRegistryErrorResponseBodies(
      httpClient.pipe(
        HttpClient.mapRequest((request) => {
          const withUrl = HttpClientRequest.prependUrl(request, registryUrl);
          return options?.stepUpRequestId === undefined
            ? withUrl
            : HttpClientRequest.setHeaders(withUrl, {
                "x-axm-step-up-request": options.stepUpRequestId,
              });
        }),
      ),
    );
    return {
      registryUrl,
      client: GeneratedRegistryClient.make(remoteHttpClient),
      requestPolicy: options?.requestPolicy,
    };
  });

const runAdminCall = <A, R>(
  registryUrl: string,
  effect: Effect.Effect<A, unknown, R>,
  args: {
    readonly operation: string;
    readonly method: string;
    readonly path: string;
    readonly replaySafety: RegistryRequestReplaySafety;
    readonly requestPolicy?: RegistryRequestPolicy;
  },
): Effect.Effect<A, AppError, R> =>
  executeRegistryRequest(effect, {
    operation: args.operation,
    request: {
      service: "registry",
      method: args.method,
      url: new URL(args.path, registryUrl).href,
    },
    replaySafety: args.replaySafety,
    mapError: mapAdminClientError(registryUrl),
    ...(args.requestPolicy === undefined ? {} : { policy: args.requestPolicy }),
  });

const safe = { kind: "safe" } as const;
const mutation = { kind: "mutation" } as const;

export const yankExtensionVersion = (
  ref: RegistryExtensionVersionReference,
  input: { readonly category?: YankCategory; readonly notice?: string },
  options?: RegistryLifecycleCallOptions,
) =>
  Effect.gen(function* () {
    const { client, registryUrl, requestPolicy } = yield* makeLifecycleClient(options);
    return yield* runAdminCall(
      registryUrl,
      client.ExtensionsYankVersion(ref.owner, ref.type, ref.name, ref.version, {
        payload: {
          ...(input.category === undefined ? {} : { category: input.category }),
          ...(input.notice === undefined ? {} : { notice: input.notice }),
        },
      }),
      {
        operation: "yank extension version",
        method: "POST",
        path: `/v1/extensions/${ref.owner}/${ref.type}/${ref.name}/${ref.version}/yank`,
        replaySafety: mutation,
        ...(requestPolicy === undefined ? {} : { requestPolicy }),
      },
    );
  });

export const yankAvailableExtensionVersions = (
  ref: RegistryExtensionReference,
  input: { readonly category?: YankCategory; readonly notice?: string },
  options?: RegistryLifecycleCallOptions,
) =>
  Effect.gen(function* () {
    const { client, registryUrl, requestPolicy } = yield* makeLifecycleClient(options);
    return yield* runAdminCall(
      registryUrl,
      client.ExtensionsYankAvailableVersions(ref.owner, ref.type, ref.name, {
        payload: {
          selection: "all-available",
          ...(input.category === undefined ? {} : { category: input.category }),
          ...(input.notice === undefined ? {} : { notice: input.notice }),
        },
      }),
      {
        operation: "yank available extension versions",
        method: "POST",
        path: `/v1/extensions/${ref.owner}/${ref.type}/${ref.name}/versions/yank`,
        replaySafety: mutation,
        ...(requestPolicy === undefined ? {} : { requestPolicy }),
      },
    );
  });

export const unyankExtensionVersion = (
  ref: RegistryExtensionVersionReference,
  options?: RegistryLifecycleCallOptions,
) =>
  Effect.gen(function* () {
    const { client, registryUrl, requestPolicy } = yield* makeLifecycleClient(options);
    return yield* runAdminCall(
      registryUrl,
      client.ExtensionsUnyankVersion(ref.owner, ref.type, ref.name, ref.version, undefined),
      {
        operation: "unyank extension version",
        method: "DELETE",
        path: `/v1/extensions/${ref.owner}/${ref.type}/${ref.name}/${ref.version}/yank`,
        replaySafety: mutation,
        ...(requestPolicy === undefined ? {} : { requestPolicy }),
      },
    );
  });

export const getExtensionDeprecation = (ref: RegistryExtensionReference) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeLifecycleClient();
    const result = yield* runAdminCall(
      registryUrl,
      client.ExtensionsGetDeprecation(ref.owner, ref.type, ref.name, undefined),
      {
        operation: "get extension deprecation",
        method: "GET",
        path: `/v1/extensions/${ref.owner}/${ref.type}/${ref.name}/deprecation`,
        replaySafety: safe,
      },
    );
    return yield* normalizeManagementView(result);
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
      {
        operation: "deprecate extension",
        method: "PUT",
        path: `/v1/extensions/${ref.owner}/${ref.type}/${ref.name}/deprecation`,
        replaySafety: mutation,
      },
    );
    return yield* normalizeTransition(result);
  });

export const undeprecateExtension = (ref: RegistryExtensionReference, revision: string) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeLifecycleClient();
    const result = yield* runAdminCall(
      registryUrl,
      client.ExtensionsDeleteDeprecation(ref.owner, ref.type, ref.name, {
        params: { "if-match": revision },
      }),
      {
        operation: "undeprecate extension",
        method: "DELETE",
        path: `/v1/extensions/${ref.owner}/${ref.type}/${ref.name}/deprecation`,
        replaySafety: mutation,
      },
    );
    return yield* normalizeTransition(result);
  });
