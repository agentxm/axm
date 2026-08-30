import {
  AppError,
  type AppErrorCode,
  type AppErrorMetadata,
  makeAppError,
} from "../app-error/index.js";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  isAnyRegistryClientError,
  isHttpClientError,
  isSchemaError,
  mapNetworkError,
} from "./error-mapping.js";
import { recoverRegistryResponseBodyText, retainedRegistryResponseBody } from "./response-body.js";
import { registryClientErrorToAppError, registryErrorToAppError } from "./translate.js";

export { captureRegistryErrorResponseBodies } from "./response-body.js";

export interface RegistryFailureContext {
  readonly baseUrl: string;
  readonly networkDetail: string;
  readonly incompatibleDetail: string;
  readonly requestConstructionDetail: string;
  readonly fallbackDetail: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
}

const requestMetadata = (
  method: string,
  url: string,
): NonNullable<AppErrorMetadata["request"]> => ({
  service: "registry",
  method,
  url,
});

const incompatibleResponse = (
  error: Parameters<typeof isHttpClientError>[0],
  context: RegistryFailureContext,
): AppError => {
  if (!isHttpClientError(error)) {
    return makeAppError({
      code: "internal",
      detail: context.incompatibleDetail,
      ...(context.suggestions === undefined ? {} : { suggestions: context.suggestions }),
      cause: error,
    });
  }

  const response = error.response;
  return makeAppError({
    code: "internal",
    detail: context.incompatibleDetail,
    metadata: {
      request: requestMetadata(error.request.method, error.request.url),
      ...(response === undefined
        ? {}
        : {
            response: {
              status: response.status,
              body: retainedRegistryResponseBody(response, ""),
            },
          }),
    },
    ...(context.suggestions === undefined ? {} : { suggestions: context.suggestions }),
    cause: error,
  });
};

const requestConstructionError = (
  error: Parameters<typeof isHttpClientError>[0],
  context: RegistryFailureContext,
): AppError => {
  if (!isHttpClientError(error)) {
    return makeAppError({
      code: "internal",
      detail: context.requestConstructionDetail,
      cause: error,
    });
  }

  return makeAppError({
    code: "internal",
    detail: context.requestConstructionDetail,
    metadata: {
      request: requestMetadata(error.request.method, error.request.url),
    },
    cause: error,
  });
};

/** Translate one Registry boundary failure without discarding HTTP evidence. */
export const mapRegistryFailure = (error: unknown, context: RegistryFailureContext): AppError => {
  if (error instanceof AppError) return error;

  if (isAnyRegistryClientError(error)) {
    return registryClientErrorToAppError(error, {
      ...(context.suggestions === undefined ? {} : { suggestions: context.suggestions }),
    });
  }

  if (isHttpClientError(error)) {
    switch (error.reason._tag) {
      case "StatusCodeError":
        return registryErrorToAppError(
          retainedRegistryResponseBody(
            error.reason.response,
            recoverRegistryResponseBodyText(error.reason.description ?? ""),
          ),
          error.reason.response,
          {
            ...(context.suggestions === undefined ? {} : { suggestions: context.suggestions }),
            cause: error,
          },
        );
      case "DecodeError":
      case "EmptyBodyError":
        return incompatibleResponse(error, context);
      case "TransportError":
        return mapNetworkError(error, context.networkDetail, context.baseUrl);
      case "EncodeError":
      case "InvalidUrlError":
        return requestConstructionError(error, context);
    }
  }

  if (isSchemaError(error)) {
    return makeAppError({
      code: "internal",
      detail: context.incompatibleDetail,
      ...(context.suggestions === undefined ? {} : { suggestions: context.suggestions }),
      cause: error,
    });
  }

  return makeAppError({
    code: "internal",
    detail: context.fallbackDetail,
    ...(context.suggestions === undefined ? {} : { suggestions: context.suggestions }),
    cause: error,
  });
};

/** Change endpoint semantics while preserving failure evidence and recovery. */
export const withAppErrorSemantics = (
  error: AppError,
  semantics: {
    readonly code?: AppErrorCode;
    readonly title?: string;
    readonly detail?: string;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
  },
): AppError =>
  makeAppError({
    code: semantics.code ?? error.code,
    title: semantics.title ?? error.title,
    detail: semantics.detail ?? error.detail,
    ...(error.metadata === undefined ? {} : { metadata: error.metadata }),
    ...(error.blockedOn === undefined ? {} : { blockedOn: error.blockedOn }),
    ...(error.action === undefined ? {} : { action: error.action }),
    ...(semantics.suggestions === undefined
      ? error.suggestions === undefined
        ? {}
        : { suggestions: error.suggestions }
      : { suggestions: semantics.suggestions }),
    cause: error.cause,
  });
