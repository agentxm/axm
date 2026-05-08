/**
 * Unit tests for CLI version resolution.
 *
 * Covers: cli-v prefix stripping, fallback to listing releases, custom repo
 * parameter, network failure, GitHub API error status, semver comparison,
 * and the "unknown" local version sentinel.
 */

import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { resolveLatestVersion, DEFAULT_GITHUB_REPO } from "./version-resolution.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Create a mock HTTP client that routes to a handler based on the request URL.
 */
const makeMockHttpClient = (handler: (url: string) => Response): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.sync(() => HttpClientResponse.fromWeb(request, handler(request.url))),
  );

/**
 * Create a mock HTTP client that always fails with a transport error.
 */
const makeNetworkErrorClient = (): HttpClient.HttpClient =>
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
 * Standard latest release with cli-v prefix.
 */
const latestCliRelease = { tag_name: "cli-v0.3.0" };

/**
 * Latest release that is NOT a CLI release.
 */
const latestNonCliRelease = { tag_name: "core-v1.2.0" };

/**
 * A list of releases with mixed CLI and non-CLI tags.
 */
const mixedReleases = [
  { tag_name: "core-v1.2.0" },
  { tag_name: "cli-v0.2.0" },
  { tag_name: "cli-v0.1.0" },
];

// =============================================================================
// Tag with cli-v prefix
// =============================================================================

describe("resolveLatestVersion", () => {
  describe("latest release has cli-v prefix", () => {
    it.effect("strips cli-v prefix and returns the version", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(
          () => new Response(JSON.stringify(latestCliRelease), { status: 200 }),
        );
        const result = yield* resolveLatestVersion(httpClient, "0.2.0");
        expect(result.remoteVersion).toBe("0.3.0");
        expect(result.localVersion).toBe("0.2.0");
      }),
    );

    it.effect("detects stale when local < remote", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(
          () => new Response(JSON.stringify(latestCliRelease), { status: 200 }),
        );
        const result = yield* resolveLatestVersion(httpClient, "0.2.0");
        expect(result.isStale).toBe(true);
      }),
    );

    it.effect("detects not stale when local >= remote", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(
          () => new Response(JSON.stringify(latestCliRelease), { status: 200 }),
        );
        const result = yield* resolveLatestVersion(httpClient, "0.3.0");
        expect(result.isStale).toBe(false);
      }),
    );

    it.effect("detects not stale when local > remote", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(
          () => new Response(JSON.stringify(latestCliRelease), { status: 200 }),
        );
        const result = yield* resolveLatestVersion(httpClient, "1.0.0");
        expect(result.isStale).toBe(false);
      }),
    );
  });

  // ===========================================================================
  // Fallback to listing releases
  // ===========================================================================

  describe("latest release does NOT have cli-v prefix (fallback)", () => {
    it.effect("falls back to listing releases and uses first cli-v tag", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient((url) => {
          if (url.includes("/releases/latest")) {
            return new Response(JSON.stringify(latestNonCliRelease), { status: 200 });
          }
          return new Response(JSON.stringify(mixedReleases), { status: 200 });
        });
        const result = yield* resolveLatestVersion(httpClient, "0.1.0");
        expect(result.remoteVersion).toBe("0.2.0");
        expect(result.isStale).toBe(true);
      }),
    );

    it.effect("fails when no cli-v release exists in the list", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient((url) => {
          if (url.includes("/releases/latest")) {
            return new Response(JSON.stringify(latestNonCliRelease), { status: 200 });
          }
          return new Response(
            JSON.stringify([{ tag_name: "core-v1.0.0" }, { tag_name: "lib-v2.0.0" }]),
            { status: 200 },
          );
        });
        const error = yield* Effect.flip(resolveLatestVersion(httpClient, "0.1.0"));
        expect(error.code).toBe("not_found");
      }),
    );
  });

  // ===========================================================================
  // Custom repo parameter
  // ===========================================================================

  describe("custom repo parameter", () => {
    it.effect("uses the custom repo in API URLs", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient((url) => {
          expect(url).toContain("my-org/my-cli");
          return new Response(JSON.stringify(latestCliRelease), { status: 200 });
        });
        const result = yield* resolveLatestVersion(httpClient, "0.1.0", "my-org/my-cli");
        expect(result.remoteVersion).toBe("0.3.0");
      }),
    );

    it.effect("defaults to the standard repo when no repo is specified", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient((url) => {
          expect(url).toContain(DEFAULT_GITHUB_REPO);
          return new Response(JSON.stringify(latestCliRelease), { status: 200 });
        });
        const result = yield* resolveLatestVersion(httpClient, "0.1.0");
        expect(result.remoteVersion).toBe("0.3.0");
      }),
    );
  });

  // ===========================================================================
  // Network failure
  // ===========================================================================

  describe("network failure", () => {
    it.effect("fails with VERSION_RESOLUTION_NETWORK_ERROR", () =>
      Effect.gen(function* () {
        const httpClient = makeNetworkErrorClient();
        const error = yield* Effect.flip(resolveLatestVersion(httpClient, "0.1.0"));
        expect(error.code).toBe("network");
      }),
    );
  });

  // ===========================================================================
  // GitHub API non-200 status
  // ===========================================================================

  describe("GitHub API error status", () => {
    it.effect("fails with VERSION_RESOLUTION_GITHUB_ERROR on 404", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(
          () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
        );
        const error = yield* Effect.flip(resolveLatestVersion(httpClient, "0.1.0"));
        expect(error.code).toBe("internal");
      }),
    );

    it.effect("fails with VERSION_RESOLUTION_GITHUB_ERROR on 403 (rate limited)", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(
          () => new Response(JSON.stringify({ message: "rate limit exceeded" }), { status: 403 }),
        );
        const error = yield* Effect.flip(resolveLatestVersion(httpClient, "0.1.0"));
        expect(error.code).toBe("internal");
      }),
    );
  });

  // ===========================================================================
  // Semver comparison
  // ===========================================================================

  describe("semver comparison", () => {
    it.effect("treats 'unknown' local version as always stale", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(
          () => new Response(JSON.stringify(latestCliRelease), { status: 200 }),
        );
        const result = yield* resolveLatestVersion(httpClient, "unknown");
        expect(result.isStale).toBe(true);
      }),
    );

    it.effect("compares patch versions correctly", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(
          () => new Response(JSON.stringify({ tag_name: "cli-v1.0.1" }), { status: 200 }),
        );
        const result = yield* resolveLatestVersion(httpClient, "1.0.0");
        expect(result.isStale).toBe(true);
      }),
    );

    it.effect("compares minor versions correctly", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(
          () => new Response(JSON.stringify({ tag_name: "cli-v1.1.0" }), { status: 200 }),
        );
        const result = yield* resolveLatestVersion(httpClient, "1.0.5");
        expect(result.isStale).toBe(true);
      }),
    );

    it.effect("same version is not stale", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(
          () => new Response(JSON.stringify({ tag_name: "cli-v2.0.0" }), { status: 200 }),
        );
        const result = yield* resolveLatestVersion(httpClient, "2.0.0");
        expect(result.isStale).toBe(false);
      }),
    );

    it.effect("pre-release local version is stale compared to stable remote", () =>
      Effect.gen(function* () {
        const httpClient = makeMockHttpClient(
          () => new Response(JSON.stringify({ tag_name: "cli-v1.0.0" }), { status: 200 }),
        );
        const result = yield* resolveLatestVersion(httpClient, "1.0.0-beta.1");
        expect(result.isStale).toBe(true);
      }),
    );
  });
});
