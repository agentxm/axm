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
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { type AppError, makeAppError } from "../app-error/index.js";
import { isLoopbackAddress } from "../utils/index.js";
import type { RegistryClientError } from "./__generated__/registry-client.js";

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

/**
 * Safely read a number field from an unknown object.
 */
const getNumber = (obj: unknown, field: string): number | undefined => {
  if (obj === null || obj === undefined || typeof obj !== "object") return undefined;
  const value: unknown = Reflect.get(obj, field);
  return typeof value === "number" ? value : undefined;
};

/**
 * Safely read an object field from an unknown object.
 */
const getObject = (obj: unknown, field: string): object | undefined => {
  if (obj === null || obj === undefined || typeof obj !== "object") return undefined;
  const value: unknown = Reflect.get(obj, field);
  return value !== null && value !== undefined && typeof value === "object" ? value : undefined;
};

/**
 * Safely read an array of strings from an unknown object field.
 */
const getStringArray = (obj: unknown, field: string): ReadonlyArray<string> | undefined => {
  if (obj === null || obj === undefined || typeof obj !== "object") return undefined;
  const value: unknown = Reflect.get(obj, field);
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : undefined;
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
 * Type predicate for SchemaError from effect/Schema.
 */
export const isSchemaError = (e: unknown): boolean =>
  e !== null && e !== undefined && typeof e === "object" && "_tag" in e && e._tag === "SchemaError";

// -----------------------------------------------------------------------------
// Network Diagnostics
// -----------------------------------------------------------------------------

/**
 * Build a user-facing howToFix message for network errors.
 * Detects localhost+HTTPS mismatches and provides targeted guidance.
 */
export const buildNetworkHowToFix = (baseUrl: string): string => {
  const fallback = "Check registry URL/network connectivity and retry.";

  try {
    const parsed = new URL(baseUrl);
    const isLocalAddr = isLoopbackAddress(parsed.hostname);

    if (isLocalAddr && parsed.protocol === "https:") {
      return "Ensure local registry is running with TLS, or switch the source URL to http://localhost:<port>.";
    }

    if (isLocalAddr) {
      return "Ensure local registry is running and reachable at the configured host/port.";
    }

    return fallback;
  } catch {
    return fallback;
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
// Auth Error Mapping
// -----------------------------------------------------------------------------

/**
 * Map a 401 RegistryClientError to an AUTH_UNAUTHENTICATED AppError.
 * Extracts details from the typed cause when available.
 */
export const mapAuthUnauthenticated = (
  error: RegistryClientError<string, unknown>,
  howToFix?: string,
): AppError => {
  const details: Array<string> = [];
  const detail = getString(error.cause, "detail");
  if (detail !== undefined) {
    details.push(detail);
  }
  return makeAppError({
    code: "AUTH_UNAUTHENTICATED",
    what: "Authentication required",
    details,
    howToFix: howToFix ?? "Run `axm login` to sign in.",
    cause: error,
  });
};

/**
 * Map a 403 RegistryClientError to an AUTH_UNAUTHORIZED AppError.
 * Extracts required_scope, token_scopes, required_role from typed cause details.
 */
export const mapAuthUnauthorized = (error: RegistryClientError<string, unknown>): AppError => {
  const details: Array<string> = [];
  const cause = error.cause;
  const detail = getString(cause, "detail");
  if (detail !== undefined) {
    details.push(detail);
  }
  const causeDetails = getObject(cause, "details");
  if (causeDetails !== undefined) {
    const requiredScope = getString(causeDetails, "requiredScope");
    if (requiredScope !== undefined) {
      details.push(`Required scope: ${requiredScope}`);
    }
    const tokenScopes = getStringArray(causeDetails, "tokenScopes");
    if (tokenScopes !== undefined) {
      details.push(`Token scopes: ${tokenScopes.join(", ")}`);
    }
    const grantedScopes = getStringArray(causeDetails, "grantedScopes");
    if (grantedScopes !== undefined) {
      details.push(`Granted scopes: ${grantedScopes.join(", ")}`);
    }
    const requiredRole = getString(causeDetails, "requiredRole");
    if (requiredRole !== undefined) {
      details.push(`Required role: ${requiredRole}`);
    }
  }

  return makeAppError({
    code: "AUTH_UNAUTHORIZED",
    what: "Insufficient permissions",
    details,
    howToFix: "You do not have permission for this operation. Check your account permissions.",
    cause: error,
  });
};

// -----------------------------------------------------------------------------
// Network Error Mapping
// -----------------------------------------------------------------------------

/**
 * Map an HttpClientError to an AppError with network error codes.
 */
export const mapNetworkError = (
  error: HttpClientError.HttpClientError,
  code: string,
  what: string,
  baseUrl: string,
): AppError =>
  makeAppError({
    code,
    what,
    details: [...buildNetworkDiagnosis(baseUrl), error.message],
    howToFix: buildNetworkHowToFix(baseUrl),
    cause: error,
  });

// -----------------------------------------------------------------------------
// Schema Error Mapping
// -----------------------------------------------------------------------------

/**
 * Map a Schema decode error to an AppError.
 */
export const mapSchemaError = (error: unknown, code: string, what: string): AppError =>
  makeAppError({
    code,
    what,
    details: (() => {
      const msg = getString(error, "message");
      return msg !== undefined ? [msg] : [];
    })(),
    cause: error,
  });

// -----------------------------------------------------------------------------
// Generic Error Mapping
// -----------------------------------------------------------------------------

/**
 * Map a RegistryClientError to an AppError for unexpected status codes.
 */
export const mapUnexpectedStatusError = (
  error: RegistryClientError<string, unknown>,
  code: string,
  what: string,
): AppError => {
  const details: Array<string> = [];
  const cause = error.cause;
  const detail = getString(cause, "detail");
  if (detail !== undefined) {
    details.push(detail);
  }
  const errorCode = getString(cause, "code");
  if (errorCode !== undefined) {
    details.push(`Error code: ${errorCode}`);
  }
  return makeAppError({
    code,
    what,
    details,
    cause: error,
  });
};

// -----------------------------------------------------------------------------
// Publish Error Mapping
// -----------------------------------------------------------------------------

/**
 * Extract the `code` field from a RegistryClientError cause.
 */
export const getErrorCode = (
  error: RegistryClientError<string, unknown>,
): Option.Option<string> => {
  const code = getString(error.cause, "code");
  return Option.fromUndefinedOr(code);
};

/**
 * Build details array from a RegistryClientError cause.
 */
export const buildErrorDetails = (
  error: RegistryClientError<string, unknown>,
): ReadonlyArray<string> => {
  const details: Array<string> = [];
  const cause = error.cause;
  const detail = getString(cause, "detail");
  if (detail !== undefined) {
    details.push(detail);
  }
  const requestId = getString(cause, "requestId");
  if (requestId !== undefined) {
    details.push(`Request ID: ${requestId}`);
  }
  return details;
};

/**
 * Extract retryAfterSeconds from a RegistryClientError cause details.
 */
export const getRetryAfterSeconds = (
  error: RegistryClientError<string, unknown>,
): Option.Option<number> => {
  const causeDetails = getObject(error.cause, "details");
  if (causeDetails !== undefined) {
    const retryAfter = getNumber(causeDetails, "retryAfterSeconds");
    if (retryAfter !== undefined) {
      return Option.some(retryAfter);
    }
  }
  return Option.none();
};
