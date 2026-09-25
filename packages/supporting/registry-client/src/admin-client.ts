// @effect-diagnostics anyUnknownInErrorContext:off — generated HTTP response errors are normalized by this registry adapter
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import { RegistryRequestFailed, type RegistryClientFailure } from "./errors.js";
import { RegistryUrl } from "./registry-url.js";
import { captureRegistryErrorResponseBodies, mapRegistryFailure } from "./failure-mapping.js";
import { executeRegistryRequest, type RegistryRequestReplaySafety } from "./request-policy.js";
import * as GeneratedRegistryClient from "./__generated__/registry-client.js";
import type {
  ArchivalManagementView,
  ArchivalTransition,
  DeprecationManagementView,
  DeprecationReplacementIntent,
  DeprecationTransition,
} from "@agentxm/registry-protocol/unstable/registry/schema";
import type {
  DeprecationReason,
  DeprecationView,
} from "@agentxm/extension-model/unstable/extensions/deprecation";
import type { ArchivalView } from "@agentxm/extension-model/unstable/extensions/archival";

export interface RegistryExtensionReference {
  readonly owner: string;
  readonly type: string;
  readonly name: string;
}

export interface RegistryExtensionVersionReference extends RegistryExtensionReference {
  readonly version: string;
}

export type YankCategory = "broken" | "security" | "accidental" | "other";

export interface PutExtensionDeprecationInput {
  readonly revision: string;
  readonly reason: DeprecationReason;
  readonly message: string | null;
  readonly replacement: DeprecationReplacementIntent;
}

export interface PutExtensionArchivalInput {
  readonly revision: string;
  readonly reason: string | null;
}

const normalizeRegistryArchival = (
  value: GeneratedRegistryClient.ArchivalManagementView["archival"],
): ArchivalView | null =>
  value === null
    ? null
    : {
        archivedAt: value.archivedAt,
        ...(value.reason === undefined || value.reason === null ? {} : { reason: value.reason }),
      };

const normalizeArchivalManagementView = (
  value: GeneratedRegistryClient.ArchivalManagementView,
): ArchivalManagementView => ({
  archival: normalizeRegistryArchival(value.archival),
  revision: value.revision,
});

const normalizeArchivalTransition = (
  value: GeneratedRegistryClient.ArchivalTransition,
): ArchivalTransition => ({
  target: value.target,
  before: normalizeRegistryArchival(value.before),
  after: normalizeRegistryArchival(value.after),
  disposition: value.disposition,
  revision: value.revision,
});

export const normalizeRegistryDeprecation = (
  value: GeneratedRegistryClient.DeprecationView | null,
): Effect.Effect<DeprecationView | null, RegistryClientFailure> => {
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
  if (value.reason === "superseded" && replacement !== undefined)
    return Effect.succeed({
      deprecatedAt: value.deprecatedAt,
      reason: value.reason,
      replacement,
      ...(value.message === undefined || value.message === null ? {} : { message: value.message }),
    });
  if (value.reason === "obsolete" && value.message !== null)
    return Effect.succeed({
      deprecatedAt: value.deprecatedAt,
      reason: value.reason,
      message: value.message,
    });
  if (value.reason === "unmaintained")
    return Effect.succeed({
      deprecatedAt: value.deprecatedAt,
      reason: value.reason,
      ...(value.message === undefined || value.message === null ? {} : { message: value.message }),
      ...(replacement === undefined ? {} : { replacement }),
    });
  if (value.reason === "other" && value.message !== null)
    return Effect.succeed({
      deprecatedAt: value.deprecatedAt,
      reason: value.reason,
      message: value.message,
      ...(replacement === undefined ? {} : { replacement }),
    });
  return Effect.fail(
    new RegistryRequestFailed({
      category: "internal",
      detail: "Registry response did not contain valid reason-specific deprecation guidance.",
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
  (error: unknown, nowMillis: number): RegistryClientFailure =>
    mapRegistryFailure(error, {
      baseUrl: registryUrl,
      nowMillis,
      networkDetail: "Registry request failed.",
      incompatibleDetail: "Registry response did not match the expected schema.",
      requestConstructionDetail: "Could not construct the Registry request.",
      fallbackDetail: "Unexpected registry client failure.",
    });

const makeLifecycleClient = () =>
  Effect.gen(function* () {
    const registryUrl = yield* RegistryUrl;
    const httpClient = yield* HttpClient.HttpClient;
    const remoteHttpClient = captureRegistryErrorResponseBodies(
      httpClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(registryUrl))),
    );
    return { registryUrl, client: GeneratedRegistryClient.make(remoteHttpClient) };
  });

const runAdminCall = <A, R>(
  registryUrl: string,
  effect: Effect.Effect<A, unknown, R>,
  args: {
    readonly operation: string;
    readonly method: string;
    readonly path: string;
    readonly replaySafety: RegistryRequestReplaySafety;
  },
): Effect.Effect<A, RegistryClientFailure, R> =>
  executeRegistryRequest(effect, {
    operation: args.operation,
    request: {
      service: "registry",
      method: args.method,
      url: new URL(args.path, registryUrl).href,
    },
    replaySafety: args.replaySafety,
    mapError: mapAdminClientError(registryUrl),
  });

const safe = { kind: "safe" } as const;
const mutation = { kind: "mutation" } as const;

export const yankExtensionVersion = (
  ref: RegistryExtensionVersionReference,
  input: { readonly category?: YankCategory; readonly notice?: string },
) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeLifecycleClient();
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
      },
    );
  });

export const yankAvailableExtensionVersions = (
  ref: RegistryExtensionReference,
  input: { readonly category?: YankCategory; readonly notice?: string },
) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeLifecycleClient();
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
      },
    );
  });

export const unyankExtensionVersion = (ref: RegistryExtensionVersionReference) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeLifecycleClient();
    return yield* runAdminCall(
      registryUrl,
      client.ExtensionsUnyankVersion(ref.owner, ref.type, ref.name, ref.version, undefined),
      {
        operation: "unyank extension version",
        method: "DELETE",
        path: `/v1/extensions/${ref.owner}/${ref.type}/${ref.name}/${ref.version}/yank`,
        replaySafety: mutation,
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

export const getExtensionArchival = (ref: RegistryExtensionReference) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeLifecycleClient();
    const result = yield* runAdminCall(
      registryUrl,
      client.ExtensionsGetArchival(ref.owner, ref.type, ref.name, undefined),
      {
        operation: "get extension archival",
        method: "GET",
        path: `/v1/extensions/${ref.owner}/${ref.type}/${ref.name}/archival`,
        replaySafety: safe,
      },
    );
    return normalizeArchivalManagementView(result);
  });

export const archiveExtension = (
  ref: RegistryExtensionReference,
  input: PutExtensionArchivalInput,
) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeLifecycleClient();
    const result = yield* runAdminCall(
      registryUrl,
      client.ExtensionsPutArchival(ref.owner, ref.type, ref.name, {
        params: { "if-match": input.revision },
        payload: { reason: input.reason },
      }),
      {
        operation: "archive extension",
        method: "PUT",
        path: `/v1/extensions/${ref.owner}/${ref.type}/${ref.name}/archival`,
        replaySafety: mutation,
      },
    );
    return normalizeArchivalTransition(result);
  });

export const unarchiveExtension = (ref: RegistryExtensionReference, revision: string) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeLifecycleClient();
    const result = yield* runAdminCall(
      registryUrl,
      client.ExtensionsDeleteArchival(ref.owner, ref.type, ref.name, {
        params: { "if-match": revision },
      }),
      {
        operation: "unarchive extension",
        method: "DELETE",
        path: `/v1/extensions/${ref.owner}/${ref.type}/${ref.name}/archival`,
        replaySafety: mutation,
      },
    );
    return normalizeArchivalTransition(result);
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
        payload: { reason: input.reason, message: input.message, replacement: input.replacement },
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
