/**
 * Tests for RemoteRegistryClient.
 *
 * Phase 1: RFC 7807 error mapping (mapProblemDetailToCliError).
 * Phase 2: createRemoteRegistryClient — publish, network errors, stubs.
 */

import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientError from "@effect/platform/HttpClientError";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as HttpClientResponse from "@effect/platform/HttpClientResponse";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";

import { createRemoteRegistryClient, mapProblemDetailToCliError } from "./client-remote.js";
import type { PublishExtensionArgs } from "./client.js";
import type { VersionEntry } from "./local-schema.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

interface ProblemDetail {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly code?: string;
  readonly requestId?: string;
  readonly retryable?: boolean;
  readonly retryAfterSeconds?: number;
  readonly details?: ReadonlyArray<unknown>;
}

const makeProblem = (overrides: ProblemDetail = {}): ProblemDetail => ({
  type: "about:blank",
  title: "Error",
  status: 500,
  detail: "Something went wrong",
  code: "unknown",
  requestId: "req-123",
  retryable: false,
  ...overrides,
});

const makeVersionEntry = (overrides: Partial<VersionEntry> = {}): VersionEntry => ({
  version: "1.0.0",
  published: "2026-01-01T00:00:00Z",
  integrity: "sha512-abc123def456",
  ...overrides,
});

const makePublishArgs = (overrides: Partial<PublishExtensionArgs> = {}): PublishExtensionArgs => ({
  namespace: "@acme",
  type: "skill",
  name: "code-review",
  version: "1.0.0",
  archive: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
  metadata: makeVersionEntry(),
  ...overrides,
});

/**
 * Create a mock HttpClient that captures the request and returns a controlled response.
 */
const makeMockHttpClient = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) =>
  HttpClient.make((request) =>
    Effect.sync(() => HttpClientResponse.fromWeb(request, handler(request))),
  );

// -----------------------------------------------------------------------------
// mapProblemDetailToCliError
// -----------------------------------------------------------------------------

describe("mapProblemDetailToCliError", () => {
  // ---------------------------------------------------------------------------
  // 409 publish_conflict
  // ---------------------------------------------------------------------------

  it("maps 409 publish_conflict to REGISTRY_PUBLISH_CONFLICT", () => {
    const error = mapProblemDetailToCliError(
      409,
      makeProblem({ code: "publish_conflict", detail: "Version 1.0.0 already exists" }),
    );
    expect(error.code).toBe("REGISTRY_PUBLISH_CONFLICT");
    expect(Option.isSome(error.howToFix)).toBe(true);
    expect(Option.getOrThrow(error.howToFix)).toContain("Bump the version");
  });

  // ---------------------------------------------------------------------------
  // 400 malformed_archive / empty_archive
  // ---------------------------------------------------------------------------

  it("maps 400 malformed_archive to REGISTRY_PUBLISH_INVALID_ARCHIVE", () => {
    const error = mapProblemDetailToCliError(
      400,
      makeProblem({ code: "malformed_archive", detail: "Archive is corrupted" }),
    );
    expect(error.code).toBe("REGISTRY_PUBLISH_INVALID_ARCHIVE");
  });

  it("maps 400 empty_archive to REGISTRY_PUBLISH_INVALID_ARCHIVE", () => {
    const error = mapProblemDetailToCliError(
      400,
      makeProblem({ code: "empty_archive", detail: "Archive is empty" }),
    );
    expect(error.code).toBe("REGISTRY_PUBLISH_INVALID_ARCHIVE");
  });

  // ---------------------------------------------------------------------------
  // 413 ingest_*_too_large
  // ---------------------------------------------------------------------------

  it("maps 413 ingest_archive_too_large to REGISTRY_PUBLISH_TOO_LARGE", () => {
    const error = mapProblemDetailToCliError(
      413,
      makeProblem({ code: "ingest_archive_too_large", detail: "Archive exceeds 10MB limit" }),
    );
    expect(error.code).toBe("REGISTRY_PUBLISH_TOO_LARGE");
    expect(Option.isSome(error.howToFix)).toBe(true);
    expect(Option.getOrThrow(error.howToFix)).toContain("Reduce archive size");
  });

  it("maps 413 ingest_file_too_large to REGISTRY_PUBLISH_TOO_LARGE", () => {
    const error = mapProblemDetailToCliError(
      413,
      makeProblem({ code: "ingest_file_too_large", detail: "File exceeds limit" }),
    );
    expect(error.code).toBe("REGISTRY_PUBLISH_TOO_LARGE");
  });

  // ---------------------------------------------------------------------------
  // 415 ingest_unsupported_content_type
  // ---------------------------------------------------------------------------

  it("maps 415 ingest_unsupported_content_type to REGISTRY_PUBLISH_INVALID_ARCHIVE", () => {
    const error = mapProblemDetailToCliError(
      415,
      makeProblem({ code: "ingest_unsupported_content_type", detail: "Expected application/zip" }),
    );
    expect(error.code).toBe("REGISTRY_PUBLISH_INVALID_ARCHIVE");
  });

  // ---------------------------------------------------------------------------
  // 422 manifest_*
  // ---------------------------------------------------------------------------

  it("maps 422 manifest_missing to REGISTRY_PUBLISH_MANIFEST_INVALID", () => {
    const error = mapProblemDetailToCliError(
      422,
      makeProblem({ code: "manifest_missing", detail: "No manifest found" }),
    );
    expect(error.code).toBe("REGISTRY_PUBLISH_MANIFEST_INVALID");
    expect(Option.isSome(error.howToFix)).toBe(true);
    expect(Option.getOrThrow(error.howToFix)).toContain("Check your extension manifest");
  });

  it("maps 422 manifest_invalid_schema to REGISTRY_PUBLISH_MANIFEST_INVALID", () => {
    const error = mapProblemDetailToCliError(
      422,
      makeProblem({ code: "manifest_invalid_schema", detail: "Invalid manifest schema" }),
    );
    expect(error.code).toBe("REGISTRY_PUBLISH_MANIFEST_INVALID");
  });

  // ---------------------------------------------------------------------------
  // 422 integrity_mismatch
  // ---------------------------------------------------------------------------

  it("maps 422 integrity_mismatch to REGISTRY_PUBLISH_INTEGRITY_MISMATCH", () => {
    const error = mapProblemDetailToCliError(
      422,
      makeProblem({ code: "integrity_mismatch", detail: "SRI hash does not match" }),
    );
    expect(error.code).toBe("REGISTRY_PUBLISH_INTEGRITY_MISMATCH");
  });

  // ---------------------------------------------------------------------------
  // 429 throttled
  // ---------------------------------------------------------------------------

  it("maps 429 throttled to REGISTRY_PUBLISH_THROTTLED with retry time", () => {
    const error = mapProblemDetailToCliError(
      429,
      makeProblem({
        code: "throttled",
        detail: "Too many requests",
        retryAfterSeconds: 30,
      }),
    );
    expect(error.code).toBe("REGISTRY_PUBLISH_THROTTLED");
    expect(Option.isSome(error.howToFix)).toBe(true);
    expect(Option.getOrThrow(error.howToFix)).toContain("30 seconds");
  });

  // ---------------------------------------------------------------------------
  // 403 quota_exceeded
  // ---------------------------------------------------------------------------

  it("maps 403 quota_exceeded to REGISTRY_PUBLISH_QUOTA_EXCEEDED", () => {
    const error = mapProblemDetailToCliError(
      403,
      makeProblem({ code: "quota_exceeded", detail: "Quota exceeded" }),
    );
    expect(error.code).toBe("REGISTRY_PUBLISH_QUOTA_EXCEEDED");
    expect(Option.isSome(error.howToFix)).toBe(true);
    expect(Option.getOrThrow(error.howToFix)).toContain("Storage quota exceeded");
  });

  // ---------------------------------------------------------------------------
  // 501 publish_type_not_implemented
  // ---------------------------------------------------------------------------

  it("maps 501 publish_type_not_implemented to REGISTRY_PUBLISH_TYPE_NOT_SUPPORTED", () => {
    const error = mapProblemDetailToCliError(
      501,
      makeProblem({ code: "publish_type_not_implemented", detail: "Type not supported" }),
    );
    expect(error.code).toBe("REGISTRY_PUBLISH_TYPE_NOT_SUPPORTED");
    expect(Option.isNone(error.howToFix)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 503 publish_disabled
  // ---------------------------------------------------------------------------

  it("maps 503 publish_disabled to REGISTRY_PUBLISH_DISABLED", () => {
    const error = mapProblemDetailToCliError(
      503,
      makeProblem({ code: "publish_disabled", detail: "Publishing is disabled" }),
    );
    expect(error.code).toBe("REGISTRY_PUBLISH_DISABLED");
    expect(Option.isSome(error.howToFix)).toBe(true);
    expect(Option.getOrThrow(error.howToFix)).toContain("Try again later");
  });

  // ---------------------------------------------------------------------------
  // Unexpected status
  // ---------------------------------------------------------------------------

  it("maps unexpected status to REGISTRY_PUBLISH_FAILED with body in details", () => {
    const error = mapProblemDetailToCliError(
      500,
      makeProblem({ code: "internal_error", detail: "Unexpected server error" }),
    );
    expect(error.code).toBe("REGISTRY_PUBLISH_FAILED");
    expect(error.details).toContain("Unexpected server error");
  });

  // ---------------------------------------------------------------------------
  // Preservation of detail and requestId
  // ---------------------------------------------------------------------------

  it("preserves detail and requestId in CliError details array", () => {
    const error = mapProblemDetailToCliError(
      409,
      makeProblem({
        code: "publish_conflict",
        detail: "Version 1.0.0 already exists with different content",
        requestId: "req-abc-456",
      }),
    );
    expect(error.details).toContain("Version 1.0.0 already exists with different content");
    expect(error.details).toContain("Request ID: req-abc-456");
  });

  it("omits requestId from details when not present", () => {
    const problem = makeProblem({ code: "publish_conflict" });
    const { requestId: _, ...problemWithoutRequestId } = problem;
    const error = mapProblemDetailToCliError(409, problemWithoutRequestId);
    expect(error.details.some((d) => d.includes("Request ID"))).toBe(false);
  });

  it("omits detail from details array when not present", () => {
    const problem = makeProblem({ code: "publish_conflict" });
    const { detail: _, ...problemWithoutDetail } = problem;
    const error = mapProblemDetailToCliError(409, problemWithoutDetail);
    // Should still produce the right error code
    expect(error.code).toBe("REGISTRY_PUBLISH_CONFLICT");
  });

  it("includes validation issue details when present", () => {
    const error = mapProblemDetailToCliError(
      400,
      makeProblem({
        code: "invalid_request",
        detail: "Request validation failed.",
        details: [
          {
            code: "invalid_value",
            values: ["skills", "commands"],
            path: ["type"],
            message: 'Invalid option: expected one of "skills"|"commands"',
          },
        ],
      }),
    );

    expect(error.details).toContain("Request validation failed.");
    expect(error.details).toContain("Invalid value at 'type'. Expected one of: skills, commands.");
    expect(error.details).toContain("Request ID: req-123");
  });

  // ---------------------------------------------------------------------------
  // Non-JSON / null problem
  // ---------------------------------------------------------------------------

  it("maps null problem to REGISTRY_PUBLISH_FAILED", () => {
    const error = mapProblemDetailToCliError(502, null);
    expect(error.code).toBe("REGISTRY_PUBLISH_FAILED");
  });

  it("maps undefined problem to REGISTRY_PUBLISH_FAILED", () => {
    const error = mapProblemDetailToCliError(502, undefined);
    expect(error.code).toBe("REGISTRY_PUBLISH_FAILED");
  });
});

// -----------------------------------------------------------------------------
// createRemoteRegistryClient — publishExtension
// -----------------------------------------------------------------------------

describe("createRemoteRegistryClient", () => {
  describe("publishExtension", () => {
    // -------------------------------------------------------------------------
    // Correct URL construction
    // -------------------------------------------------------------------------

    it.effect("sends PUT to the correct URL", () =>
      Effect.gen(function* () {
        let capturedUrl = "";
        let capturedMethod = "";

        const httpClient = makeMockHttpClient((request) => {
          capturedUrl = request.url;
          capturedMethod = request.method;
          return new Response(JSON.stringify({ publish_status: "created" }), {
            status: 201,
          });
        });

        const client = createRemoteRegistryClient("https://registry.example.com", httpClient);
        yield* client.publishExtension(makePublishArgs());

        expect(capturedMethod).toBe("PUT");
        expect(capturedUrl).toBe(
          "https://registry.example.com/v1/extensions/@acme/skills/code-review/1.0.0",
        );
      }),
    );

    it.effect("normalizes trailing slash in registry base URL", () =>
      Effect.gen(function* () {
        let capturedUrl = "";

        const httpClient = makeMockHttpClient((request) => {
          capturedUrl = request.url;
          return new Response(JSON.stringify({ publish_status: "created" }), { status: 201 });
        });

        const client = createRemoteRegistryClient("https://registry.example.com/", httpClient);
        yield* client.publishExtension(makePublishArgs());

        expect(capturedUrl).toBe(
          "https://registry.example.com/v1/extensions/@acme/skills/code-review/1.0.0",
        );
      }),
    );

    // -------------------------------------------------------------------------
    // Multipart FormData with archive and integrity
    // -------------------------------------------------------------------------

    it.effect("sends multipart form data with archive and integrity", () =>
      Effect.gen(function* () {
        let capturedBody: FormData | undefined;

        const httpClient = makeMockHttpClient((request) => {
          // The body is a FormData when using bodyFormData
          const body = request.body;
          if (body._tag === "FormData") {
            capturedBody = body.formData;
          }
          return new Response(JSON.stringify({ publish_status: "created" }), {
            status: 201,
          });
        });

        const archiveBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
        const client = createRemoteRegistryClient("https://registry.example.com", httpClient);
        yield* client.publishExtension(
          makePublishArgs({
            archive: archiveBytes,
            metadata: makeVersionEntry({ integrity: "sha512-test-integrity" }),
          }),
        );

        expect(capturedBody).toBeDefined();
        const archivePart = capturedBody!.get("archive");
        expect(archivePart).toBeInstanceOf(Blob);
        expect((archivePart as Blob).type).toBe("application/zip");
        expect((archivePart as Blob).size).toBe(4);

        const integrityField = capturedBody!.get("integrity");
        expect(integrityField).toBe("sha512-test-integrity");
      }),
    );

    // -------------------------------------------------------------------------
    // Success: 201 Created
    // -------------------------------------------------------------------------

    it.effect("returns { published: true } on 201", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(
          () => new Response(JSON.stringify({ publish_status: "created" }), { status: 201 }),
        );

        const client = createRemoteRegistryClient("https://registry.example.com", httpClient);
        const result = yield* client.publishExtension(makePublishArgs());
        expect(result).toEqual({ published: true });
      }),
    );

    // -------------------------------------------------------------------------
    // Success: 200 OK (idempotent republish)
    // -------------------------------------------------------------------------

    it.effect("returns { published: true } on 200", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(
          () => new Response(JSON.stringify({ publish_status: "idempotent" }), { status: 200 }),
        );

        const client = createRemoteRegistryClient("https://registry.example.com", httpClient);
        const result = yield* client.publishExtension(makePublishArgs());
        expect(result).toEqual({ published: true });
      }),
    );

    // -------------------------------------------------------------------------
    // Error: non-2xx with JSON problem detail
    // -------------------------------------------------------------------------

    it.effect("maps 409 problem detail to REGISTRY_PUBLISH_CONFLICT", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(
          () =>
            new Response(
              JSON.stringify({
                type: "about:blank",
                title: "Conflict",
                status: 409,
                detail: "Version already exists",
                code: "publish_conflict",
                requestId: "req-123",
              }),
              { status: 409 },
            ),
        );

        const client = createRemoteRegistryClient("https://registry.example.com", httpClient);
        const result = yield* client.publishExtension(makePublishArgs()).pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_PUBLISH_CONFLICT");
          expect(result.left.details).toContain(
            "Request: PUT https://registry.example.com/v1/extensions/@acme/skills/code-review/1.0.0",
          );
          expect(result.left.details).toContain("HTTP status: 409");
        }
      }),
    );

    // -------------------------------------------------------------------------
    // Error: non-JSON response
    // -------------------------------------------------------------------------

    it.effect("maps non-JSON error response to REGISTRY_PUBLISH_FAILED", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(
          () => new Response("Internal Server Error", { status: 500 }),
        );

        const client = createRemoteRegistryClient("https://registry.example.com", httpClient);
        const result = yield* client.publishExtension(makePublishArgs()).pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_PUBLISH_FAILED");
          expect(result.left.details).toContain("Internal Server Error");
        }
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Network error handling
  // ---------------------------------------------------------------------------

  describe("network errors", () => {
    it.effect("maps connection failure to REGISTRY_PUBLISH_NETWORK_ERROR", () =>
      Effect.gen(function* () {
        const httpClient = HttpClient.make((request) =>
          Effect.fail(
            new HttpClientError.RequestError({
              request,
              reason: "Transport",
              cause: new Error("Connection refused"),
            }),
          ),
        );

        const client = createRemoteRegistryClient("https://registry.example.com", httpClient);
        const result = yield* client.publishExtension(makePublishArgs()).pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_PUBLISH_NETWORK_ERROR");
          expect(result.left.cause).toBeDefined();
          expect(Option.isSome(result.left.howToFix)).toBe(true);
          expect(result.left.details).toContain(
            "Request: PUT https://registry.example.com/v1/extensions/@acme/skills/code-review/1.0.0",
          );
        }
      }),
    );

    it.effect("suggests http for localhost https network failures", () =>
      Effect.gen(function* () {
        const httpClient = HttpClient.make((request) =>
          Effect.fail(
            new HttpClientError.RequestError({
              request,
              reason: "Transport",
              cause: new Error("Connection refused"),
            }),
          ),
        );

        const client = createRemoteRegistryClient("https://localhost:4000/", httpClient);
        const result = yield* client.publishExtension(makePublishArgs()).pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_PUBLISH_NETWORK_ERROR");
          expect(Option.isSome(result.left.howToFix)).toBe(true);
          expect(Option.getOrThrow(result.left.howToFix)).toContain(
            "switch the source URL to http://localhost",
          );
          expect(result.left.details).toContain(
            "Request: PUT https://localhost:4000/v1/extensions/@acme/skills/code-review/1.0.0",
          );
          expect(result.left.details).toContain(
            "Diagnosis: Local registry appears HTTP-only while source uses HTTPS.",
          );
        }
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Read-side methods
  // ---------------------------------------------------------------------------

  describe("read operations", () => {
    it.effect("getExtensionsByScope resolves named extension indexes", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient((request) => {
          if (request.url.endsWith("/v1/extensions/@axm/packs/effect")) {
            return new Response(
              JSON.stringify({
                namespace: "@axm",
                type: "pack",
                name: "effect",
                versions: [
                  {
                    version: "0.0.1",
                    published: "2026-01-01T00:00:00Z",
                    integrity: "sha512-abc",
                  },
                ],
              }),
              { status: 200 },
            );
          }
          return new Response("", { status: 404 });
        });

        const client = createRemoteRegistryClient("https://registry.example.com", httpClient);
        const result = yield* client.getExtensionsByScope({
          namespace: "@axm",
          names: ["effect"],
          types: ["pack"],
          limit: Option.none(),
          offset: 0,
        });

        expect(result.total).toBe(1);
        expect(result.extensions).toHaveLength(1);
        expect(result.extensions[0]?.namespace).toBe("@axm");
        expect(result.extensions[0]?.type).toBe("pack");
        expect(result.extensions[0]?.name).toBe("effect");
      }),
    );

    it.effect("getExtensionsByScope list mode reports not implemented", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(() => new Response("", { status: 200 }));
        const client = createRemoteRegistryClient("https://registry.example.com", httpClient);
        const result = yield* client
          .getExtensionsByScope({
            namespace: "@test",
            names: [],
            types: [],
            limit: Option.none(),
            offset: 0,
          })
          .pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_REMOTE_DISCOVERY_LIST_NOT_IMPLEMENTED");
          expect(result.left.what).toContain("getExtensionsByScope");
        }
      }),
    );

    const httpClient = makeMockHttpClient(() => new Response("", { status: 200 }));
    const client = createRemoteRegistryClient("https://registry.example.com", httpClient);

    it.effect("getExtensionPackage reports package fetch not implemented", () =>
      Effect.gen(function* () {
        const result = yield* client
          .getExtensionPackage({
            namespace: "@test",
            type: "skill",
            name: "my-skill",
            version: Option.some("1.0.0"),
          })
          .pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_REMOTE_PACKAGE_FETCH_NOT_IMPLEMENTED");
        }
      }),
    );

    it.effect("namespaceExists reports namespace checks not implemented", () =>
      Effect.gen(function* () {
        const result = yield* client.namespaceExists("@test").pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_REMOTE_NAMESPACE_CHECK_NOT_IMPLEMENTED");
        }
      }),
    );

    it.effect("extensionExists returns true for 200", () =>
      Effect.gen(function* () {
        const result = yield* client.extensionExists({
          namespace: "@test",
          type: "skill",
          name: "my-skill",
        });
        expect(result).toEqual({ exists: true });
      }),
    );

    it.effect("extensionExists returns false for 404", () =>
      Effect.gen(function* () {
        const notFoundClient = createRemoteRegistryClient(
          "https://registry.example.com",
          makeMockHttpClient(() => new Response("", { status: 404 })),
        );
        const result = yield* notFoundClient.extensionExists({
          namespace: "@test",
          type: "skill",
          name: "missing-skill",
        });
        expect(result).toEqual({ exists: false });
      }),
    );
  });
});
