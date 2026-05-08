/**
 * Unit tests for the remote registry client.
 *
 * Covers: all 6 RegistryClient methods with success paths, 404→Option.none/exists:false,
 * auth error mapping (401→AUTH_UNAUTHENTICATED, 403→AUTH_UNAUTHORIZED), network error codes,
 * schema decode errors, and the full publish error mapping table.
 */

import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as UrlParams from "effect/unstable/http/UrlParams";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";

import { createRemoteRegistryClient } from "./remote-client.js";
import type { AppError } from "../app-error/index.js";
import {
  extensionName,
  exactVersion,
  fullyQualifiedRef,
  handle,
  packageUrl,
} from "../test-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const BASE_URL = "https://registry.agentxm.ai";
const registryOwner = handle("@acme");
const skillName = extensionName("test-skill");

const makeIndexArgs = (name = "test-skill") => ({
  owner: registryOwner,
  type: "skill" as const,
  name: extensionName(name),
});

const makePackageArgs = (name = "test-skill", version?: string) => ({
  ...makeIndexArgs(name),
  version: version === undefined ? Option.none() : Option.some(exactVersion(version)),
});

const makeExistsArgs = (name = "test-skill") => makeIndexArgs(name);

/**
 * Create a mock HTTP client that routes to a handler based on the request.
 */
const makeMockHttpClient = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) =>
  HttpClient.make((request) =>
    Effect.sync(() => HttpClientResponse.fromWeb(request, handler(request))),
  );

/**
 * Create a mock HTTP client that always fails with a proper HttpClientError (transport error).
 */
const makeNetworkErrorClient = () =>
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request,
          cause: new Error("ECONNREFUSED"),
          description: "Connection refused",
        }),
      }),
    ),
  );

/**
 * Helper to run an effect and extract the AppError.
 */
const runFailure = <A>(effect: Effect.Effect<A, AppError>) => Effect.flip(effect);

/**
 * Standard extension index response body.
 */
const extensionIndexResponse = {
  name: "test-skill",
  owner: "@acme",
  type: "skill",
  description: "A test skill",
  repository: "https://github.com/acme/test-skill",
  license: "MIT",
  authors: [{ name: "Test Author", email: "test@acme.com" }],
  versions: [
    {
      version: "1.0.0",
      published: "2025-01-01T00:00:00Z",
      integrity: "sha512-abc123",
      dependencies: {},
      compatiblePackages: ["pkg:npm/react"],
    },
    {
      version: "0.9.0",
      published: "2024-12-01T00:00:00Z",
      integrity: "sha512-def456",
    },
  ],
};

const makeExtensionIndexResponse = (overrides?: {
  readonly name?: string;
  readonly owner?: string;
  readonly type?: string;
  readonly description?: string;
  readonly compatiblePackages?: ReadonlyArray<string>;
}) => ({
  ...extensionIndexResponse,
  ...(overrides?.name === undefined ? {} : { name: overrides.name }),
  ...(overrides?.owner === undefined ? {} : { owner: overrides.owner }),
  ...(overrides?.type === undefined ? {} : { type: overrides.type }),
  ...(overrides?.description === undefined ? {} : { description: overrides.description }),
  versions: [
    {
      ...extensionIndexResponse.versions[0],
      ...(overrides?.compatiblePackages === undefined
        ? {}
        : { compatiblePackages: [...overrides.compatiblePackages] }),
    },
    ...extensionIndexResponse.versions.slice(1),
  ],
});

const makeSearchHit = (overrides?: {
  readonly name?: string;
  readonly owner?: string;
  readonly type?: string;
  readonly latestVersion?: string;
}) => ({
  name: overrides?.name ?? "test-skill",
  owner: overrides?.owner ?? "@acme",
  type: overrides?.type ?? "skill",
  latestVersion: overrides?.latestVersion ?? "1.0.0",
});

const makeSearchResponse = (
  extensions: ReadonlyArray<ReturnType<typeof makeSearchHit>>,
  options?: {
    readonly has_more?: boolean;
    readonly cursor?: string | null;
  },
) => ({
  extensions,
  has_more: options?.has_more ?? false,
  cursor: options?.cursor ?? null,
});

/**
 * Standard extension list response body.
 */
const extensionListResponse = {
  extensions: [
    {
      name: "test-skill",
      owner: "@acme",
      type: "skill",
      latestVersion: "1.0.0",
    },
    {
      name: "another-skill",
      owner: "@acme",
      type: "skill",
      latestVersion: "2.0.0",
    },
  ],
};

/**
 * Standard publish success response body.
 */
const publishSuccessResponse = {
  owner: "@acme",
  type: "skill",
  name: "test-skill",
  version: "1.0.0",
  integrity: "sha512-abc123",
  sha256_hex: "abc123",
  published_at: "2025-01-01T00:00:00Z",
  publish_status: "available",
};

/**
 * Build a typed error response matching the generated client's error schemas.
 */
const typedErrorResponse = (
  status: number,
  code: string,
  detail: string,
  extra?: Record<string, unknown>,
) =>
  new Response(
    JSON.stringify({
      kind: getErrorKind(status),
      type: "about:blank",
      title: "Error",
      status,
      detail,
      code,
      ...extra,
    }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );

/**
 * Map status code to error kind for typed error schemas.
 */
const getErrorKind = (status: number): string => {
  switch (status) {
    case 400:
      return "InvalidRequestError";
    case 401:
      return "UnauthorizedError";
    case 403:
      return "ForbiddenError";
    case 404:
      return "NotFoundError";
    case 409:
      return "ConflictError";
    case 413:
      return "PayloadTooLargeError";
    case 415:
      return "UnsupportedMediaTypeError";
    case 422:
      return "UnprocessableEntityError";
    case 429:
      return "TooManyRequestsError";
    case 500:
      return "InternalError";
    case 501:
      return "NotImplementedError";
    case 503:
      return "ServiceUnavailableError";
    default:
      return "InternalError";
  }
};

// =============================================================================
// getExtensionIndex
// =============================================================================

describe("getExtensionIndex", () => {
  it.effect("returns Option.some(ExtensionIndex) on success", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () => new Response(JSON.stringify(extensionIndexResponse), { status: 200 }),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const result = yield* client.getExtensionIndex(makeIndexArgs());

      expect(Option.isSome(result)).toBe(true);
      const index = Option.getOrThrow(result);
      expect(index.name).toBe("test-skill");
      expect(index.owner).toBe("@acme");
      expect(index.type).toBe("skill");
      expect(index.versions).toHaveLength(2);
      expect(index.versions[0]?.version).toBe("1.0.0");
      expect(index.versions[0]?.compatiblePackages?.[0]).toMatchObject({
        type: "npm",
        name: "react",
      });
    }),
  );

  it.effect("returns Option.none() on 404", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(() =>
        typedErrorResponse(404, "extension_not_found", "Extension not found"),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const result = yield* client.getExtensionIndex(makeIndexArgs("nonexistent"));

      expect(Option.isNone(result)).toBe(true);
    }),
  );

  it.effect("fails with REGISTRY_REMOTE_DISCOVERY_NETWORK_ERROR on network failure", () =>
    Effect.gen(function* () {
      const httpClient = makeNetworkErrorClient();
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.getExtensionIndex(makeIndexArgs()));

      expect(error.code).toBe("REGISTRY_REMOTE_DISCOVERY_NETWORK_ERROR");
    }),
  );

  it.effect(
    "fails with REGISTRY_REMOTE_DISCOVERY_INVALID_RESPONSE on invalid response schema",
    () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(
          () => new Response(JSON.stringify({ unexpected: "shape" }), { status: 200 }),
        );
        const client = createRemoteRegistryClient(BASE_URL, httpClient);

        const error = yield* runFailure(client.getExtensionIndex(makeIndexArgs()));

        expect(error.code).toBe("REGISTRY_REMOTE_DISCOVERY_INVALID_RESPONSE");
      }),
  );

  it.effect("fails with REGISTRY_REMOTE_DISCOVERY_FAILED on 400 with proper error schema", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () =>
          new Response(
            JSON.stringify({
              kind: "DecodeErrorResponse",
              type: "about:blank",
              title: "Bad Request",
              status: 400,
              detail: "Invalid request",
              code: "invalid_request",
            }),
            { status: 400 },
          ),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.getExtensionIndex(makeIndexArgs()));

      expect(error.code).toBe("REGISTRY_REMOTE_DISCOVERY_FAILED");
    }),
  );
});

// =============================================================================
// getExtensionsByScope
// =============================================================================

describe("getExtensionsByScope", () => {
  it.effect("returns extensions in named mode", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () => new Response(JSON.stringify(extensionIndexResponse), { status: 200 }),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const result = yield* client.getExtensionsByScope({
        owner: registryOwner,
        names: ["test-skill"],
        types: ["skill"],
        limit: Option.none(),
        offset: 0,
      });

      expect(result.extensions.length).toBeGreaterThanOrEqual(1);
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.extensions[0]?.name).toBe("test-skill");
    }),
  );

  it.effect("applies limit and offset correctly", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () => new Response(JSON.stringify(extensionIndexResponse), { status: 200 }),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const result = yield* client.getExtensionsByScope({
        owner: registryOwner,
        names: ["test-skill", "another"],
        types: ["skill"],
        limit: Option.some(1),
        offset: 0,
      });

      expect(result.extensions.length).toBeLessThanOrEqual(1);
    }),
  );

  it.effect("returns empty list when no extensions match", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(() =>
        typedErrorResponse(404, "extension_not_found", "Extension not found"),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const result = yield* client.getExtensionsByScope({
        owner: registryOwner,
        names: ["nonexistent"],
        types: ["skill"],
        limit: Option.none(),
        offset: 0,
      });

      expect(result.extensions).toHaveLength(0);
      expect(result.total).toBe(0);
    }),
  );

  it.effect("fails with REGISTRY_REMOTE_DISCOVERY_NETWORK_ERROR on network failure", () =>
    Effect.gen(function* () {
      const httpClient = makeNetworkErrorClient();
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(
        client.getExtensionsByScope({
          owner: registryOwner,
          names: ["test-skill"],
          types: ["skill"],
          limit: Option.none(),
          offset: 0,
        }),
      );

      expect(error.code).toBe("REGISTRY_REMOTE_DISCOVERY_NETWORK_ERROR");
    }),
  );
});

// =============================================================================
// ownerExists
// =============================================================================

describe("ownerExists", () => {
  it.effect("returns exists:true when owner has extensions", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () => new Response(JSON.stringify(extensionListResponse), { status: 200 }),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const result = yield* client.ownerExists(registryOwner);

      expect(result.exists).toBe(true);
    }),
  );

  it.effect("returns exists:false when owner has no extensions", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () => new Response(JSON.stringify({ extensions: [] }), { status: 200 }),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const result = yield* client.ownerExists(handle("@empty"));

      expect(result.exists).toBe(false);
    }),
  );

  it.effect("fails with REGISTRY_REMOTE_NAMESPACE_CHECK_NETWORK_ERROR on network failure", () =>
    Effect.gen(function* () {
      const httpClient = makeNetworkErrorClient();
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.ownerExists(registryOwner));

      expect(error.code).toBe("REGISTRY_REMOTE_NAMESPACE_CHECK_NETWORK_ERROR");
    }),
  );

  it.effect("fails with REGISTRY_REMOTE_INVALID_RESPONSE on invalid schema", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () => new Response(JSON.stringify({ not: "extensions" }), { status: 200 }),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.ownerExists(registryOwner));

      expect(error.code).toBe("REGISTRY_REMOTE_INVALID_RESPONSE");
    }),
  );
});

// =============================================================================
// getExtensionPackage
// =============================================================================

describe("getExtensionPackage", () => {
  it.effect("returns archive for latest version", () =>
    Effect.gen(function* () {
      const archiveData = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
      const httpClient = makeMockHttpClient((request) => {
        const url = request.url;
        if (url.endsWith("/archive")) {
          return new Response(archiveData, {
            status: 200,
            headers: { "content-type": "application/zip" },
          });
        }
        return new Response(JSON.stringify(extensionIndexResponse), { status: 200 });
      });
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const result = yield* client.getExtensionPackage(makePackageArgs());

      expect(result.archive).toBeInstanceOf(Uint8Array);
      expect(result.archive.length).toBeGreaterThan(0);
    }),
  );

  it.effect("returns archive for specific version", () =>
    Effect.gen(function* () {
      const archiveData = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
      const httpClient = makeMockHttpClient((request) => {
        const url = request.url;
        if (url.endsWith("/archive")) {
          return new Response(archiveData, {
            status: 200,
            headers: { "content-type": "application/zip" },
          });
        }
        return new Response(JSON.stringify(extensionIndexResponse), { status: 200 });
      });
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const result = yield* client.getExtensionPackage(makePackageArgs("test-skill", "1.0.0"));

      expect(result.archive).toBeInstanceOf(Uint8Array);
    }),
  );

  it.effect("fails with REGISTRY_REMOTE_PACKAGE_NOT_FOUND on index 404", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(() =>
        typedErrorResponse(404, "extension_not_found", "Extension not found"),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.getExtensionPackage(makePackageArgs("nonexistent")));

      expect(error.code).toBe("REGISTRY_REMOTE_PACKAGE_NOT_FOUND");
    }),
  );

  it.effect("fails with REGISTRY_REMOTE_PACKAGE_NOT_FOUND on archive 404", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient((request) => {
        const url = request.url;
        if (url.endsWith("/archive")) {
          return typedErrorResponse(404, "archive_not_found", "Archive not found");
        }
        return new Response(JSON.stringify(extensionIndexResponse), { status: 200 });
      });
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.getExtensionPackage(makePackageArgs()));

      expect(error.code).toBe("REGISTRY_REMOTE_PACKAGE_NOT_FOUND");
    }),
  );

  it.effect("fails with REGISTRY_REMOTE_VERSION_NOT_FOUND for missing version", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () => new Response(JSON.stringify(extensionIndexResponse), { status: 200 }),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(
        client.getExtensionPackage(makePackageArgs("test-skill", "99.99.99")),
      );

      expect(error.code).toBe("REGISTRY_REMOTE_VERSION_NOT_FOUND");
    }),
  );

  it.effect("fails with REGISTRY_REMOTE_PACKAGE_FETCH_NETWORK_ERROR on network failure", () =>
    Effect.gen(function* () {
      const httpClient = makeNetworkErrorClient();
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.getExtensionPackage(makePackageArgs()));

      expect(error.code).toBe("REGISTRY_REMOTE_PACKAGE_FETCH_NETWORK_ERROR");
    }),
  );
});

// =============================================================================
// extensionExists
// =============================================================================

describe("extensionExists", () => {
  it.effect("returns exists:true on 200", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(() => new Response(null, { status: 200 }));
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const result = yield* client.extensionExists(makeExistsArgs());

      expect(result.exists).toBe(true);
    }),
  );

  it.effect("returns exists:false on 404", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(() => new Response(null, { status: 404 }));
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const result = yield* client.extensionExists(makeExistsArgs("nonexistent"));

      expect(result.exists).toBe(false);
    }),
  );

  it.effect("fails with REGISTRY_REMOTE_EXTENSION_CHECK_NETWORK_ERROR on network failure", () =>
    Effect.gen(function* () {
      const httpClient = makeNetworkErrorClient();
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.extensionExists(makeExistsArgs()));

      expect(error.code).toBe("REGISTRY_REMOTE_EXTENSION_CHECK_NETWORK_ERROR");
    }),
  );

  it.effect("fails with REGISTRY_REMOTE_EXTENSION_CHECK_FAILED on unexpected status", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(() => new Response(null, { status: 500 }));
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.extensionExists(makeExistsArgs()));

      expect(error.code).toBe("REGISTRY_REMOTE_EXTENSION_CHECK_FAILED");
    }),
  );
});

// =============================================================================
// discoverExtensions
// =============================================================================

describe("discoverExtensions", () => {
  it.effect("discovers supported types via search pagination and resolves recommendations", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient((request) => {
        const url = new URL(request.url);
        const path = decodeURIComponent(url.pathname);
        const getParam = (key: string): string | null =>
          Option.getOrNull(UrlParams.getFirst(request.urlParams, key));

        if (path === "/v1/search") {
          expect(getParam("q")).toBe("");
          expect(getParam("limit")).toBe("100");

          if (getParam("cursor") === "2") {
            return new Response(
              JSON.stringify(
                makeSearchResponse([
                  makeSearchHit({ name: "test-mcp", type: "mcp-server" }),
                  makeSearchHit({ name: "test-subagent", type: "subagent" }),
                ]),
              ),
              { status: 200 },
            );
          }

          return new Response(
            JSON.stringify(
              makeSearchResponse(
                [
                  makeSearchHit({ name: "test-skill", type: "skill" }),
                  makeSearchHit({ name: "test-command", type: "command" }),
                ],
                { has_more: true, cursor: "2" },
              ),
            ),
            { status: 200 },
          );
        }

        if (path === "/v1/extensions/@acme/skills/test-skill") {
          return new Response(
            JSON.stringify(
              makeExtensionIndexResponse({
                name: "test-skill",
                type: "skill",
                description: "Skill result",
                compatiblePackages: ["pkg:npm/react"],
              }),
            ),
            { status: 200 },
          );
        }

        if (path === "/v1/extensions/@acme/commands/test-command") {
          return new Response(
            JSON.stringify(
              makeExtensionIndexResponse({
                name: "test-command",
                type: "command",
                description: "Command result",
                compatiblePackages: ["pkg:npm/react"],
              }),
            ),
            { status: 200 },
          );
        }

        if (path === "/v1/extensions/@acme/mcp-servers/test-mcp") {
          return new Response(
            JSON.stringify(
              makeExtensionIndexResponse({
                name: "test-mcp",
                type: "mcp-server",
                description: "MCP result",
                compatiblePackages: ["pkg:npm/react"],
              }),
            ),
            { status: 200 },
          );
        }

        if (path === "/v1/extensions/@acme/subagents/test-subagent") {
          return new Response(
            JSON.stringify(
              makeExtensionIndexResponse({
                name: "test-subagent",
                type: "subagent",
                description: "Subagent result",
                compatiblePackages: ["pkg:npm/react"],
              }),
            ),
            { status: 200 },
          );
        }

        if (path === "/v1/extensions/@acme/skills/recommended-skill") {
          return new Response(
            JSON.stringify(
              makeExtensionIndexResponse({
                name: "recommended-skill",
                type: "skill",
                description: "Recommended result",
                compatiblePackages: ["pkg:npm/react"],
              }),
            ),
            { status: 200 },
          );
        }

        return typedErrorResponse(404, "extension_not_found", `Unexpected path: ${path}`);
      });
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const result = yield* client.discoverExtensions({
        packages: [packageUrl("pkg:npm/react")],
        workspaceRecommendedExtensions: [fullyQualifiedRef("@acme/skills/recommended-skill")],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.detectedPackage).toMatchObject({
        type: "npm",
        name: "react",
      });
      expect(result.results[0]?.extensions).toEqual([
        {
          owner: "@acme",
          type: "skill",
          name: "test-skill",
          description: "Skill result",
          latestVersion: "1.0.0",
        },
        {
          owner: "@acme",
          type: "command",
          name: "test-command",
          description: "Command result",
          latestVersion: "1.0.0",
        },
        {
          owner: "@acme",
          type: "mcp-server",
          name: "test-mcp",
          description: "MCP result",
          latestVersion: "1.0.0",
        },
        {
          owner: "@acme",
          type: "subagent",
          name: "test-subagent",
          description: "Subagent result",
          latestVersion: "1.0.0",
        },
      ]);
      expect(result.resolvedRecommendations).toEqual([
        {
          owner: "@acme",
          type: "skill",
          name: "recommended-skill",
          description: "Recommended result",
          latestVersion: "1.0.0",
        },
      ]);
    }),
  );

  it.effect(
    "fails with REGISTRY_REMOTE_DISCOVERY_NETWORK_ERROR when search cannot be reached",
    () =>
      Effect.gen(function* () {
        const httpClient = makeNetworkErrorClient();
        const client = createRemoteRegistryClient(BASE_URL, httpClient);

        const error = yield* runFailure(
          client.discoverExtensions({
            packages: [packageUrl("pkg:npm/react")],
          }),
        );

        expect(error.code).toBe("REGISTRY_REMOTE_DISCOVERY_NETWORK_ERROR");
      }),
  );
});

// =============================================================================
// publishExtension
// =============================================================================

const publishArgs = {
  owner: registryOwner,
  type: "skill" as const,
  name: skillName,
  version: exactVersion("1.0.0"),
  archive: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
  metadata: {
    version: exactVersion("1.0.0"),
    published: "2025-01-01T00:00:00Z",
    integrity: "sha512-abc123",
  },
};

describe("publishExtension", () => {
  it.effect("returns published:true on 200", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () => new Response(JSON.stringify(publishSuccessResponse), { status: 200 }),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const result = yield* client.publishExtension(publishArgs);

      expect(result.published).toBe(true);
    }),
  );

  it.effect("returns published:true on 201", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () => new Response(JSON.stringify(publishSuccessResponse), { status: 201 }),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const result = yield* client.publishExtension(publishArgs);

      expect(result.published).toBe(true);
    }),
  );

  it.effect("fails with AUTH_UNAUTHENTICATED on 401", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(() =>
        typedErrorResponse(401, "token_expired", "Token expired"),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.publishExtension(publishArgs));

      expect(error.code).toBe("AUTH_UNAUTHENTICATED");
    }),
  );

  it.effect("fails with AUTH_UNAUTHORIZED on 403 (generic)", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () =>
          new Response(
            JSON.stringify({
              kind: "ForbiddenError",
              type: "about:blank",
              title: "Forbidden",
              status: 403,
              detail: "Insufficient permissions",
              code: "insufficient_permissions",
              details: {
                requiredScope: "extensions:write",
                tokenScopes: ["extensions:read"],
              },
            }),
            { status: 403 },
          ),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.publishExtension(publishArgs));

      expect(error.code).toBe("AUTH_UNAUTHORIZED");
    }),
  );

  it.effect("fails with REGISTRY_PUBLISH_REJECTED on 403 with quota_exceeded code", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () =>
          new Response(
            JSON.stringify({
              kind: "ForbiddenError",
              type: "about:blank",
              title: "Forbidden",
              status: 403,
              detail: "Storage quota exceeded",
              code: "quota_exceeded",
              details: {
                retryable: false,
              },
            }),
            { status: 403 },
          ),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.publishExtension(publishArgs));

      expect(error.code).toBe("REGISTRY_PUBLISH_REJECTED");
      expect(error.reason).toBe("quota_exceeded");
    }),
  );

  it.effect("fails with REGISTRY_PUBLISH_CONFLICT on 409", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () =>
          new Response(
            JSON.stringify({
              kind: "ConflictError",
              type: "about:blank",
              title: "Conflict",
              status: 409,
              detail: "Version already exists",
              code: "publish_conflict",
            }),
            { status: 409 },
          ),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.publishExtension(publishArgs));

      expect(error.code).toBe("REGISTRY_PUBLISH_CONFLICT");
    }),
  );

  it.effect("fails with REGISTRY_PUBLISH_REJECTED on 400 with malformed_archive", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(() =>
        typedErrorResponse(400, "malformed_archive", "Archive is malformed"),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.publishExtension(publishArgs));

      expect(error.code).toBe("REGISTRY_PUBLISH_REJECTED");
      expect(error.reason).toBe("malformed_archive");
    }),
  );

  it.effect("fails with REGISTRY_PUBLISH_REJECTED on 400 with empty_archive", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(() =>
        typedErrorResponse(400, "empty_archive", "Archive is empty"),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.publishExtension(publishArgs));

      expect(error.code).toBe("REGISTRY_PUBLISH_REJECTED");
      expect(error.reason).toBe("empty_archive");
    }),
  );

  it.effect("fails with REGISTRY_PUBLISH_REJECTED on 413", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () =>
          new Response(
            JSON.stringify({
              kind: "PayloadTooLargeError",
              type: "about:blank",
              title: "Payload Too Large",
              status: 413,
              detail: "Archive too large",
              code: "ingest_archive_too_large",
            }),
            { status: 413 },
          ),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.publishExtension(publishArgs));

      expect(error.code).toBe("REGISTRY_PUBLISH_REJECTED");
      expect(error.reason).toBe("too_large");
    }),
  );

  it.effect("fails with REGISTRY_PUBLISH_REJECTED on 415", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () =>
          new Response(
            JSON.stringify({
              kind: "UnsupportedMediaTypeError",
              type: "about:blank",
              title: "Unsupported Media Type",
              status: 415,
              detail: "Unsupported content type",
              code: "ingest_unsupported_content_type",
            }),
            { status: 415 },
          ),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.publishExtension(publishArgs));

      expect(error.code).toBe("REGISTRY_PUBLISH_REJECTED");
      expect(error.reason).toBe("unsupported_content_type");
    }),
  );

  it.effect("fails with REGISTRY_PUBLISH_REJECTED on 422 with integrity_mismatch", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () =>
          new Response(
            JSON.stringify({
              kind: "UnprocessableEntityError",
              type: "about:blank",
              title: "Unprocessable Entity",
              status: 422,
              detail: "Integrity mismatch",
              code: "integrity_mismatch",
            }),
            { status: 422 },
          ),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.publishExtension(publishArgs));

      expect(error.code).toBe("REGISTRY_PUBLISH_REJECTED");
      expect(error.reason).toBe("integrity_mismatch");
    }),
  );

  it.effect("fails with REGISTRY_PUBLISH_REJECTED on 422 with manifest_* code", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () =>
          new Response(
            JSON.stringify({
              kind: "UnprocessableEntityError",
              type: "about:blank",
              title: "Unprocessable Entity",
              status: 422,
              detail: "Manifest name is invalid",
              code: "manifest_invalid_name",
            }),
            { status: 422 },
          ),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.publishExtension(publishArgs));

      expect(error.code).toBe("REGISTRY_PUBLISH_REJECTED");
      expect(error.reason).toBe("manifest_invalid_name");
    }),
  );

  it.effect("fails with REGISTRY_PUBLISH_REJECTED on 429 with retryAfterSeconds", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () =>
          new Response(
            JSON.stringify({
              kind: "TooManyRequestsError",
              type: "about:blank",
              title: "Too Many Requests",
              status: 429,
              detail: "Rate limited",
              code: "throttled",
              details: {
                retryable: true,
                retryAfterSeconds: 30,
              },
            }),
            { status: 429 },
          ),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.publishExtension(publishArgs));

      expect(error.code).toBe("REGISTRY_PUBLISH_REJECTED");
      expect(error.reason).toBe("rate_limited");
      expect(error.breadcrumbs?.[0]?.description).toContain("30");
    }),
  );

  it.effect("fails with REGISTRY_PUBLISH_REJECTED on 503", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () =>
          new Response(
            JSON.stringify({
              kind: "ServiceUnavailableError",
              type: "about:blank",
              title: "Service Unavailable",
              status: 503,
              detail: "Publishing disabled",
              code: "publish_disabled",
            }),
            { status: 503 },
          ),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.publishExtension(publishArgs));

      expect(error.code).toBe("REGISTRY_PUBLISH_REJECTED");
      expect(error.reason).toBe("publishing_disabled");
    }),
  );

  it.effect("fails with REGISTRY_PUBLISH_NETWORK_ERROR on network failure", () =>
    Effect.gen(function* () {
      const httpClient = makeNetworkErrorClient();
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.publishExtension(publishArgs));

      expect(error.code).toBe("REGISTRY_PUBLISH_NETWORK_ERROR");
    }),
  );

  it.effect("fails with REGISTRY_PUBLISH_REJECTED on unknown 500 error", () =>
    Effect.gen(function* () {
      const httpClient = makeMockHttpClient(
        () =>
          new Response(
            JSON.stringify({
              kind: "InternalError",
              type: "about:blank",
              title: "Internal Server Error",
              status: 500,
              detail: "Something went wrong",
              code: "internal_error",
            }),
            { status: 500 },
          ),
      );
      const client = createRemoteRegistryClient(BASE_URL, httpClient);

      const error = yield* runFailure(client.publishExtension(publishArgs));

      expect(error.code).toBe("REGISTRY_PUBLISH_REJECTED");
      expect(error.reason).toBe("registry_error");
    }),
  );
});

// =============================================================================
// Network diagnostics
// =============================================================================

describe("network diagnostics", () => {
  it.effect("detects localhost+HTTPS mismatch in breadcrumbs", () =>
    Effect.gen(function* () {
      const httpClient = makeNetworkErrorClient();
      const client = createRemoteRegistryClient("https://localhost:3000", httpClient);

      const error = yield* runFailure(client.getExtensionIndex(makeIndexArgs("test")));

      expect(error.code).toBe("REGISTRY_REMOTE_DISCOVERY_NETWORK_ERROR");
      expect(error.breadcrumbs?.[0]?.description).toContain("http://localhost");
    }),
  );

  it.effect("provides generic advice for remote URLs", () =>
    Effect.gen(function* () {
      const httpClient = makeNetworkErrorClient();
      const client = createRemoteRegistryClient("https://registry.example.com", httpClient);

      const error = yield* runFailure(client.getExtensionIndex(makeIndexArgs("test")));

      expect(error.code).toBe("REGISTRY_REMOTE_DISCOVERY_NETWORK_ERROR");
      expect(error.breadcrumbs?.[0]?.description).toContain("Check registry URL");
    }),
  );
});
