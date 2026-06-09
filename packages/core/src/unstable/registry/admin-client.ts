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

export type ExtensionGrantEntry = GeneratedRegistryClient.ExtensionGrantEntry;
export type ExtensionGrantRole = ExtensionGrantEntry["role"];
export type ExtensionGrantsResponse = GeneratedRegistryClient.ExtensionGrantsResponse;
export type ExtensionMaintainer = GeneratedRegistryClient.Maintainer;
export type ExtensionMaintainerTarget = GeneratedRegistryClient.MaintainerTarget;

export interface RegistryExtensionReference {
  readonly owner: string;
  readonly type: string;
  readonly name: string;
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

const runAdminCall = <A, R>(
  registryUrl: string,
  effect: Effect.Effect<A, unknown, R>,
): Effect.Effect<A, AppError, R> => effect.pipe(Effect.mapError(mapAdminClientError(registryUrl)));

export const listExtensionGrants = (
  ref: RegistryExtensionReference,
): Effect.Effect<ExtensionGrantsResponse, AppError, HttpClient.HttpClient | RegistryUrl> =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeAdminClient;
    return yield* runAdminCall(
      registryUrl,
      client.TeamGrantsListExtensionGrants(ref.owner, ref.type, ref.name, undefined),
    );
  });

export const upsertUserExtensionGrant = (
  ref: RegistryExtensionReference,
  input: {
    readonly userId: string;
    readonly role: ExtensionGrantRole;
  },
) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeAdminClient;
    return yield* runAdminCall(
      registryUrl,
      client.TeamGrantsUpsertUserExtensionGrant(ref.owner, ref.type, ref.name, input.userId, {
        payload: { role: input.role },
      }),
    );
  });

export const deleteUserExtensionGrant = (
  ref: RegistryExtensionReference,
  input: {
    readonly userId: string;
  },
) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeAdminClient;
    return yield* runAdminCall(
      registryUrl,
      client.TeamGrantsDeleteUserExtensionGrant(
        ref.owner,
        ref.type,
        ref.name,
        input.userId,
        undefined,
      ),
    );
  });

export const upsertTeamExtensionGrant = (
  ref: RegistryExtensionReference,
  input: {
    readonly teamId: string;
    readonly role: ExtensionGrantRole;
  },
) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeAdminClient;
    return yield* runAdminCall(
      registryUrl,
      client.TeamGrantsUpsertTeamExtensionGrantById(ref.owner, ref.type, ref.name, input.teamId, {
        payload: { role: input.role },
      }),
    );
  });

export const deleteTeamExtensionGrant = (
  ref: RegistryExtensionReference,
  input: {
    readonly teamId: string;
  },
) =>
  Effect.gen(function* () {
    const { client, registryUrl } = yield* makeAdminClient;
    return yield* runAdminCall(
      registryUrl,
      client.TeamGrantsDeleteTeamExtensionGrantById(
        ref.owner,
        ref.type,
        ref.name,
        input.teamId,
        undefined,
      ),
    );
  });

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
