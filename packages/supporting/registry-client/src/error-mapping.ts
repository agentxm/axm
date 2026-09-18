/**
 * Shared error mapping helpers for registry and auth client implementations.
 *
 * Provides reusable predicates and mappers for converting generated client
 * errors (RegistryClientError, HttpClientError, SchemaError) to the typed
 * registry failure vocabulary.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as Predicate from "effect/Predicate";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { isLoopbackAddress } from "./network.js";
import type { RegistryClientError } from "./__generated__/registry-client.js";
import {
  isRegistryClientFailure,
  RegistryRequestFailed,
  type RegistryClientFailure,
  type RegistryProblem,
} from "./errors.js";
import { registryClientErrorToProblem } from "./translate.js";

// -----------------------------------------------------------------------------
// Safe Field Access
// -----------------------------------------------------------------------------

/**
 * Safely read a string field from an unknown object.
 */
export const getString = (obj: unknown, field: string): string | undefined => {
  if (obj === null || obj === undefined || typeof obj !== "object") return undefined;
  const value: unknown = Reflect.get(obj, field);
  return typeof value === "string" ? value : undefined;
};

// -----------------------------------------------------------------------------
// RegistryClientError Predicate
// -----------------------------------------------------------------------------

/**
 * Create a type predicate that matches a specific RegistryClientError tag.
 *
 * Usage:
 * ```ts
 * Effect.catchIf(isRegistryClientError("ExtensionsGet404"), ...)
 * ```
 */
export const isRegistryClientError =
  <Tag extends string>(tag: Tag) =>
  (e: unknown): e is RegistryClientError<Tag, unknown> =>
    Predicate.isTagged(e, tag);

// -----------------------------------------------------------------------------
// HttpClientError Predicate
// -----------------------------------------------------------------------------

/**
 * Type predicate for HttpClientError.
 */
export const isHttpClientError = (e: unknown): e is HttpClientError.HttpClientError =>
  HttpClientError.isHttpClientError(e);

/**
 * The typed failure a transport layer settled on before the request left.
 *
 * A layer in front of the client — the one that presents a credential, above
 * all — can know why a request cannot be sent in terms no status code carries.
 * It fails the transport with that failure as the cause, and it arrives at the
 * caller as itself rather than as a guess about the network.
 */
export const carriedRegistryFailure = (
  error: HttpClientError.HttpClientError,
): RegistryClientFailure | undefined =>
  error.reason._tag === "TransportError" && isRegistryClientFailure(error.reason.cause)
    ? error.reason.cause
    : undefined;

/**
 * Whether a transport failure is worth another attempt: one that carries a
 * typed failure is only as transient as that failure says it is.
 */
export const isTransientTransportError = (error: HttpClientError.HttpClientError): boolean => {
  const carried = carriedRegistryFailure(error);
  return carried === undefined || carried.category === "network";
};

/**
 * Classify transient Registry boundary failures: transport failures and valid
 * 5xx responses, including errors decoded by the generated client.
 * Deterministic failures — encode errors, invalid URLs, decode errors,
 * 4xx statuses — are excluded so they fail fast.
 */
export const isTransientRegistryError = (e: unknown): boolean => {
  if (isAnyRegistryClientError(e)) return e.response.status >= 500;
  if (!HttpClientError.isHttpClientError(e)) return false;
  if (e.reason._tag === "TransportError") return isTransientTransportError(e);
  // A 5xx the client could not decode is still a 5xx: the failure is the
  // server's, whatever shape its body arrived in.
  return (e.response?.status ?? 0) >= 500;
};

/**
 * Type predicate for SchemaError from effect/Schema.
 */
export const isSchemaError = (e: unknown): boolean =>
  e !== null && e !== undefined && typeof e === "object" && "_tag" in e && e._tag === "SchemaError";

// -----------------------------------------------------------------------------
// Network Diagnostics
// -----------------------------------------------------------------------------

/**
 * Build user-facing suggestions for network errors.
 * Detects localhost+HTTPS mismatches and provides targeted guidance.
 */
export const buildNetworkSuggestions = (baseUrl: string): ReadonlyArray<SuggestedAction> => {
  const fallback = "Check registry URL/network connectivity and retry.";

  try {
    const parsed = new URL(baseUrl);
    const isLocalAddr = isLoopbackAddress(parsed.hostname);

    if (isLocalAddr && parsed.protocol === "https:") {
      return [
        {
          description:
            "Ensure local registry is running with TLS, or switch the source URL to http://localhost:<port>.",
        },
      ];
    }

    if (isLocalAddr) {
      return [
        {
          description:
            "Ensure local registry is running and reachable at the configured host/port.",
        },
      ];
    }

    return [{ description: fallback }];
  } catch {
    return [{ description: fallback }];
  }
};

/**
 * Build diagnostic details array for network errors.
 * Detects localhost+HTTPS protocol mismatch.
 */
export const buildNetworkDiagnosis = (baseUrl: string): ReadonlyArray<string> => {
  try {
    const parsed = new URL(baseUrl);
    const isLocalAddr = isLoopbackAddress(parsed.hostname);

    if (isLocalAddr && parsed.protocol === "https:") {
      return ["Diagnosis: Local registry appears HTTP-only while source uses HTTPS."];
    }

    return [];
  } catch {
    return [];
  }
};

// -----------------------------------------------------------------------------
// Tag Utilities
// -----------------------------------------------------------------------------

/**
 * Safely read the _tag from an unknown value.
 */
export const getTag = (e: unknown): string | undefined => getString(e, "_tag");

/**
 * Check if an unknown value is a RegistryClientError (has _tag, request, response fields).
 */
export const isAnyRegistryClientError = (e: unknown): e is RegistryClientError<string, unknown> =>
  e !== null &&
  e !== undefined &&
  typeof e === "object" &&
  !HttpClientError.isHttpClientError(e) &&
  "_tag" in e &&
  "response" in e &&
  "request" in e;

/**
 * Check if an unknown value has a _tag ending with the given suffix.
 */
export const hasTagSuffix = (e: unknown, suffix: string): boolean => {
  const tag = getTag(e);
  return tag !== undefined && tag.endsWith(suffix);
};

// -----------------------------------------------------------------------------
// Network Error Mapping
// -----------------------------------------------------------------------------

/**
 * Map an HttpClientError to a typed registry failure with the network category.
 */
export const mapNetworkError = (
  error: HttpClientError.HttpClientError,
  message: string,
  baseUrl: string,
): RegistryRequestFailed =>
  new RegistryRequestFailed({
    category: "network",
    detail: message,
    metadata: {
      request: {
        service: "registry",
        method: error.request.method,
        url: error.request.url,
      },
    },
    suggestions: buildNetworkSuggestions(baseUrl),
    cause: error,
  });

// -----------------------------------------------------------------------------
// Schema Error Mapping
// -----------------------------------------------------------------------------

/**
 * Map an input Schema encode error to a typed registry failure.
 */
export const mapInputSchemaError = (error: unknown, message: string): RegistryRequestFailed =>
  new RegistryRequestFailed({
    category: "validation",
    detail: message,
    cause: error,
  });

/**
 * Map a response Schema decode error to a typed registry failure.
 */
export const mapResponseSchemaError = (error: unknown, message: string): RegistryRequestFailed =>
  new RegistryRequestFailed({
    category: "internal",
    detail: message,
    cause: error,
  });

export const mapSchemaError = mapResponseSchemaError;

// -----------------------------------------------------------------------------
// Generic Error Mapping
// -----------------------------------------------------------------------------

/**
 * Map a RegistryClientError to a typed registry failure for unexpected status codes.
 */
export const mapUnexpectedStatusError = (
  error: RegistryClientError<string, unknown>,
  _message: string,
): RegistryProblem => registryClientErrorToProblem(error);
