/**
 * Shared error mapping helpers for registry and auth client implementations.
 *
 * Provides reusable predicates and mappers for converting generated client
 * errors (RegistryClientError, HttpClientError, SchemaError) to AppError.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as Predicate from "effect/Predicate";

import { type AppError, makeAppError } from "../app-error/index.js";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { isLoopbackAddress } from "../utils/index.js";
import type { RegistryClientError } from "./__generated__/registry-client.js";
import { registryClientErrorToAppError } from "./translate.js";

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
 * Type predicate matching HttpClientErrors that are reasonable to retry:
 * transport-level failures (ECONNREFUSED, DNS, etc.) and 5xx status codes.
 * Deterministic failures — encode errors, invalid URLs, decode errors,
 * 4xx statuses — are excluded so they fail fast.
 */
export const isTransientHttpClientError = (e: unknown): e is HttpClientError.HttpClientError => {
  if (!HttpClientError.isHttpClientError(e)) return false;
  const reason = e.reason;
  if (reason._tag === "TransportError") return true;
  if (reason._tag === "StatusCodeError" && reason.response.status >= 500) return true;
  return false;
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
 * Map an HttpClientError to an AppError with network error codes.
 */
export const mapNetworkError = (
  error: HttpClientError.HttpClientError,
  message: string,
  baseUrl: string,
): AppError =>
  makeAppError({
    code: "network",
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
 * Map an input Schema encode error to an AppError.
 */
export const mapInputSchemaError = (error: unknown, message: string): AppError =>
  makeAppError({
    code: "validation",
    detail: message,
    cause: error,
  });

/**
 * Map a response Schema decode error to an AppError.
 */
export const mapResponseSchemaError = (error: unknown, message: string): AppError =>
  makeAppError({
    code: "internal",
    detail: message,
    cause: error,
  });

export const mapSchemaError = mapResponseSchemaError;

// -----------------------------------------------------------------------------
// Generic Error Mapping
// -----------------------------------------------------------------------------

/**
 * Map a RegistryClientError to an AppError for unexpected status codes.
 */
export const mapUnexpectedStatusError = (
  error: RegistryClientError<string, unknown>,
  _message: string,
): AppError => registryClientErrorToAppError(error);
