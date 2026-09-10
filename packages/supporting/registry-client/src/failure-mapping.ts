import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  isAnyRegistryClientError,
  isHttpClientError,
  isSchemaError,
  mapNetworkError,
} from "./error-mapping.js";
import {
  RegistryRequestFailed,
  isRegistryClientFailure,
  type RegistryClientFailure,
} from "./errors.js";
import { recoverRegistryResponseBodyText, retainedRegistryResponseBody } from "./response-body.js";
import { registryClientErrorToProblem, registryErrorToProblem } from "./translate.js";

export { captureRegistryErrorResponseBodies } from "./response-body.js";

export interface RegistryFailureContext {
  readonly baseUrl: string;
  readonly networkDetail: string;
  readonly incompatibleDetail: string;
  readonly requestConstructionDetail: string;
  readonly fallbackDetail: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
}

const incompatibleResponse = (
  error: Parameters<typeof isHttpClientError>[0],
  context: RegistryFailureContext,
): RegistryRequestFailed => {
  if (!isHttpClientError(error)) {
    return new RegistryRequestFailed({
      category: "internal",
      detail: context.incompatibleDetail,
      ...(context.suggestions === undefined ? {} : { suggestions: context.suggestions }),
      cause: error,
    });
  }

  const response = error.response;
  return new RegistryRequestFailed({
    category: "internal",
    detail: context.incompatibleDetail,
    metadata: {
      request: {
        service: "registry",
        method: error.request.method,
        url: error.request.url,
      },
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
): RegistryRequestFailed => {
  if (!isHttpClientError(error)) {
    return new RegistryRequestFailed({
      category: "internal",
      detail: context.requestConstructionDetail,
      cause: error,
    });
  }

  return new RegistryRequestFailed({
    category: "internal",
    detail: context.requestConstructionDetail,
    metadata: {
      request: {
        service: "registry",
        method: error.request.method,
        url: error.request.url,
      },
    },
    cause: error,
  });
};

/** Translate one Registry boundary failure without discarding HTTP evidence. */
export const mapRegistryFailure = (
  error: unknown,
  context: RegistryFailureContext,
): RegistryClientFailure => {
  if (isRegistryClientFailure(error)) return error;

  if (isAnyRegistryClientError(error)) {
    return registryClientErrorToProblem(error, {
      ...(context.suggestions === undefined ? {} : { suggestions: context.suggestions }),
    });
  }

  if (isHttpClientError(error)) {
    switch (error.reason._tag) {
      case "StatusCodeError":
        return registryErrorToProblem(
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
    return new RegistryRequestFailed({
      category: "internal",
      detail: context.incompatibleDetail,
      ...(context.suggestions === undefined ? {} : { suggestions: context.suggestions }),
      cause: error,
    });
  }

  return new RegistryRequestFailed({
    category: "internal",
    detail: context.fallbackDetail,
    ...(context.suggestions === undefined ? {} : { suggestions: context.suggestions }),
    cause: error,
  });
};
