import { describe, expect, it } from "@effect/vitest";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { AppError } from "../../../app-error/index.js";
import { checkAzureReposRepoExists } from "./repo-exists.js";

// -----------------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------------

/** Create a mock HttpClient layer that returns a fixed status code. */
const makeMockHttpLayer = (status: number): Layer.Layer<HttpClient.HttpClient> =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() => HttpClientResponse.fromWeb(request, new Response(null, { status }))),
    ),
  );

/** All requests return 200. */
const okLayer = makeMockHttpLayer(200);

/** All requests return 404. */
const notFoundLayer = makeMockHttpLayer(404);

/** Simulate network error. */
const networkErrorLayer = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request,
          cause: new Error("network failure"),
        }),
      }),
    ),
  ),
);

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("checkAzureReposRepoExists", () => {
  describe("repo exists", () => {
    it.effect("succeeds when the repo returns 200", () =>
      checkAzureReposRepoExists("myorg", "myproject", "myrepo").pipe(Effect.provide(okLayer)),
    );
  });

  describe("repo not found (404)", () => {
    it.effect("fails with SOURCE_PARSE_FAILED when repo returns 404", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          checkAzureReposRepoExists("myorg", "myproject", "nonexistent").pipe(
            Effect.provide(notFoundLayer),
          ),
        );

        expect(error).toBeInstanceOf(AppError);
        expect(error.code).toBe("validation");
        expect(error.detail).toBe("Not found on Azure Repos");
      }),
    );
  });

  describe("network errors", () => {
    it.effect("fails with SOURCE_PARSE_FAILED on network failure", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          checkAzureReposRepoExists("myorg", "myproject", "myrepo").pipe(
            Effect.provide(networkErrorLayer),
          ),
        );

        expect(error).toBeInstanceOf(AppError);
        expect(error.code).toBe("validation");
        expect(error.detail).toContain("Failed to check Azure Repos");
      }),
    );
  });
});
