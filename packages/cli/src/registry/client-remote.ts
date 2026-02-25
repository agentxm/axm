/**
 * Remote HTTPS registry client.
 *
 * Implements `publishExtension` via multipart PUT to the remote registry API.
 * All read operations fail with "remote registry not yet supported" error.
 * Includes RFC 7807 problem detail error mapping for publish responses.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientError from "@effect/platform/HttpClientError";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { type CliError, makeCliError } from "../cli-error/index.js";
import type { PublishExtensionArgs, RegistryClient } from "./client.js";

// -----------------------------------------------------------------------------
// RFC 7807 Problem Detail → CliError Mapping
// -----------------------------------------------------------------------------

/**
 * Maps an HTTP status code and parsed RFC 7807 problem detail JSON to a `CliError`.
 *
 * Handles all backend error codes from the remote registry publish API.
 * When the problem detail is null/undefined (non-JSON response), falls back
 * to a generic `REGISTRY_PUBLISH_FAILED` error.
 */
export const mapProblemDetailToCliError = (status: number, problem: unknown): CliError => {
  const detail = getStringField(problem, "detail");
  const requestId = getStringField(problem, "requestId");
  const code = getStringField(problem, "code");
  const details = buildDetails(detail, requestId);

  if (code !== undefined) {
    // 409 publish_conflict
    if (status === 409 && code === "publish_conflict") {
      return makeCliError({
        code: "REGISTRY_PUBLISH_CONFLICT",
        what: "Version already exists with different content",
        details,
        howToFix:
          "This version already exists with different content. Bump the version in your manifest.",
      });
    }

    // 400 malformed_archive / empty_archive
    if (status === 400 && (code === "malformed_archive" || code === "empty_archive")) {
      return makeCliError({
        code: "REGISTRY_PUBLISH_INVALID_ARCHIVE",
        what: "Invalid extension archive",
        details,
        howToFix: "Check the extension directory and rebuild",
      });
    }

    // 413 ingest_*_too_large
    if (status === 413 && code.startsWith("ingest_") && code.endsWith("_too_large")) {
      return makeCliError({
        code: "REGISTRY_PUBLISH_TOO_LARGE",
        what: "Extension archive exceeds size limit",
        details,
        howToFix: "Reduce archive size or remove unnecessary files",
      });
    }

    // 415 ingest_unsupported_content_type
    if (status === 415 && code === "ingest_unsupported_content_type") {
      return makeCliError({
        code: "REGISTRY_PUBLISH_INVALID_ARCHIVE",
        what: "Unsupported archive content type",
        details,
      });
    }

    // 422 integrity_mismatch (check before manifest_* since both are 422)
    if (status === 422 && code === "integrity_mismatch") {
      return makeCliError({
        code: "REGISTRY_PUBLISH_INTEGRITY_MISMATCH",
        what: "Archive integrity does not match",
        details,
      });
    }

    // 422 manifest_*
    if (status === 422 && code.startsWith("manifest_")) {
      return makeCliError({
        code: "REGISTRY_PUBLISH_MANIFEST_INVALID",
        what: "Extension manifest validation failed",
        details,
        howToFix: "Check your extension manifest",
      });
    }

    // 429 throttled
    if (status === 429 && code === "throttled") {
      const retryAfter = getNumberField(problem, "retryAfterSeconds");
      const retryMsg =
        retryAfter !== undefined
          ? `Rate limited. Retry after ${retryAfter} seconds.`
          : "Rate limited. Try again later.";
      return makeCliError({
        code: "REGISTRY_PUBLISH_THROTTLED",
        what: "Publish request was rate limited",
        details,
        howToFix: retryMsg,
      });
    }

    // 403 quota_exceeded
    if (status === 403 && code === "quota_exceeded") {
      return makeCliError({
        code: "REGISTRY_PUBLISH_QUOTA_EXCEEDED",
        what: "Storage quota exceeded",
        details,
        howToFix: "Storage quota exceeded for this extension",
      });
    }

    // 501 publish_type_not_implemented
    if (status === 501 && code === "publish_type_not_implemented") {
      return makeCliError({
        code: "REGISTRY_PUBLISH_TYPE_NOT_SUPPORTED",
        what: "Extension type is not supported for publishing",
        details,
      });
    }

    // 503 publish_disabled
    if (status === 503 && code === "publish_disabled") {
      return makeCliError({
        code: "REGISTRY_PUBLISH_DISABLED",
        what: "Publishing is temporarily disabled",
        details,
        howToFix: "Publishing is temporarily disabled. Try again later.",
      });
    }
  }

  // Fallback: unexpected status or unrecognized code
  return makeCliError({
    code: "REGISTRY_PUBLISH_FAILED",
    what: `Publish failed with status ${String(status)}`,
    details,
  });
};

// -----------------------------------------------------------------------------
// Internal Helpers
// -----------------------------------------------------------------------------

const getStringField = (obj: unknown, field: string): string | undefined => {
  if (obj !== null && obj !== undefined && typeof obj === "object" && field in obj) {
    const value = (obj as Record<string, unknown>)[field];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
};

const getNumberField = (obj: unknown, field: string): number | undefined => {
  if (obj !== null && obj !== undefined && typeof obj === "object" && field in obj) {
    const value = (obj as Record<string, unknown>)[field];
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
};

const buildDetails = (
  detail: string | undefined,
  requestId: string | undefined,
): ReadonlyArray<string> => {
  const result: Array<string> = [];
  if (detail !== undefined) result.push(detail);
  if (requestId !== undefined) result.push(`Request ID: ${requestId}`);
  return result;
};

const withRequestContext = (
  error: CliError,
  request: string,
  status: number | undefined,
): CliError => {
  const howToFix = Option.match(error.howToFix, {
    onNone: () => Option.none<string>(),
    onSome: (value) => Option.some(value),
  });

  return makeCliError({
    code: error.code,
    what: error.what,
    details: [
      `Request: ${request}`,
      ...(status === undefined ? [] : [`HTTP status: ${String(status)}`]),
      ...error.details,
    ],
    ...(Option.isSome(howToFix) && { howToFix: howToFix.value }),
    cause: error.cause,
  });
};

// -----------------------------------------------------------------------------
// Remote Registry Client
// -----------------------------------------------------------------------------

const remoteNotSupported = () =>
  Effect.fail(
    makeCliError({
      code: "REGISTRY_REMOTE_NOT_SUPPORTED",
      what: "remote registry not yet supported",
    }),
  );

/**
 * Build the publish URL for an extension version.
 */
const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, "");

const buildNetworkHowToFix = (baseUrl: string): string => {
  const fallback = "Check registry URL/network connectivity and retry.";

  try {
    const parsed = new URL(baseUrl);
    const isLocalhost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1";

    if (isLocalhost && parsed.protocol === "https:") {
      return "Ensure local registry is running with TLS, or switch the source URL to http://localhost:<port>.";
    }

    if (isLocalhost) {
      return "Ensure local registry is running and reachable at the configured host/port.";
    }

    return fallback;
  } catch {
    return fallback;
  }
};

const buildNetworkDiagnosis = (baseUrl: string): Option.Option<string> => {
  try {
    const parsed = new URL(baseUrl);
    const isLocalhost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1";

    if (isLocalhost && parsed.protocol === "https:") {
      return Option.some("Diagnosis: Local registry appears HTTP-only while source uses HTTPS.");
    }

    return Option.none();
  } catch {
    return Option.none();
  }
};

const buildPublishUrl = (baseUrl: string, args: PublishExtensionArgs): string =>
  `${normalizeBaseUrl(baseUrl)}/v1/extensions/${args.namespace}/${args.type}/${args.name}/${args.version}`;

/**
 * Publish an extension version to the remote registry via multipart PUT.
 */
const publishExtension = (
  baseUrl: string,
  httpClient: HttpClient.HttpClient,
  args: PublishExtensionArgs,
) =>
  Effect.gen(function* () {
    const url = buildPublishUrl(baseUrl, args);
    const requestSummary = `PUT ${url}`;
    const networkHowToFix = buildNetworkHowToFix(baseUrl);
    const networkDiagnosis = buildNetworkDiagnosis(baseUrl);

    // Build multipart FormData
    const formData = new FormData();
    formData.append(
      "archive",
      new Blob([args.archive], { type: "application/zip" }),
      "archive.zip",
    );
    formData.append("integrity", args.metadata.integrity);

    // Build request
    const request = HttpClientRequest.put(url).pipe(HttpClientRequest.bodyFormData(formData));

    // Execute request
    const response = yield* httpClient.execute(request).pipe(
      Effect.catchAll((error) =>
        HttpClientError.isHttpClientError(error) && error._tag === "RequestError"
          ? Effect.fail(
              makeCliError({
                code: "REGISTRY_PUBLISH_NETWORK_ERROR",
                what: "Failed to connect to the remote registry",
                details: [
                  `Request: ${requestSummary}`,
                  ...(Option.isSome(networkDiagnosis) ? [networkDiagnosis.value] : []),
                  error.message,
                ],
                howToFix: networkHowToFix,
                cause: error,
              }),
            )
          : Effect.fail(
              makeCliError({
                code: "REGISTRY_PUBLISH_NETWORK_ERROR",
                what: "Failed to connect to the remote registry",
                details: [
                  `Request: ${requestSummary}`,
                  ...(Option.isSome(networkDiagnosis) ? [networkDiagnosis.value] : []),
                ],
                howToFix: networkHowToFix,
                cause: error,
              }),
            ),
      ),
    );

    // Handle success (200, 201)
    if (response.status === 200 || response.status === 201) {
      return { published: true as const };
    }

    // Handle error: read body and try to parse as problem detail
    const bodyText = yield* response.text.pipe(Effect.catchAll(() => Effect.succeed("")));

    const problem = yield* Effect.try({
      try: () => JSON.parse(bodyText) as unknown,
      catch: () => null,
    }).pipe(Effect.catchAll(() => Effect.succeed<unknown>(null)));

    if (problem === null) {
      // Non-JSON error response
      return yield* Effect.fail(
        makeCliError({
          code: "REGISTRY_PUBLISH_FAILED",
          what: `Publish failed with status ${String(response.status)}`,
          details: [`Request: ${requestSummary}`, ...(bodyText.length > 0 ? [bodyText] : [])],
        }),
      );
    }

    return yield* Effect.fail(
      withRequestContext(
        mapProblemDetailToCliError(response.status, problem),
        requestSummary,
        response.status,
      ),
    );
  });

/**
 * Creates a remote HTTPS registry client.
 *
 * Implements `publishExtension` via multipart PUT. All read operations
 * fail with "remote registry not yet supported" error.
 *
 * @param baseUrl - Base URL of the remote registry (e.g. `https://registry.example.com`)
 * @param httpClient - Effect HttpClient instance for making HTTP requests
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createRemoteRegistryClient = (
  baseUrl: string,
  httpClient: HttpClient.HttpClient,
): RegistryClient => ({
  getExtensionsByScope: () => remoteNotSupported(),
  namespaceExists: () => remoteNotSupported(),
  getExtensionPackage: () => remoteNotSupported(),
  publishExtension: (args) => publishExtension(baseUrl, httpClient, args),
  extensionExists: () => remoteNotSupported(),
});
