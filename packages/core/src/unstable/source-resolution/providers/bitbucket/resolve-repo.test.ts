import { describe, expect, it } from "@effect/vitest";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { AppError } from "../../../app-error/index.js";
import { resolveRepo } from "./resolve-repo.js";

// -----------------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------------

/** Create a mock HttpClient layer that routes responses by URL. */
const makeMockHttpLayer = (
  handler: (url: URL) => { readonly status: number },
): Layer.Layer<HttpClient.HttpClient> =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() => {
        const url = new URL(request.url);
        const { status } = handler(url);
        return HttpClientResponse.fromWeb(request, new Response(null, { status }));
      }),
    ),
  );

/** All URLs return 200. */
const allOkLayer = makeMockHttpLayer(() => ({ status: 200 }));

/** Repo URL returns 404 (repo not found). */
const repoNotFoundLayer = makeMockHttpLayer(() => ({ status: 404 }));

/** Repo exists but subpath returns 404. */
const subPathNotFoundLayer = makeMockHttpLayer((url) => ({
  status: url.pathname.includes("/src/HEAD/") ? 404 : 200,
}));

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

describe("resolveRepo", () => {
  describe("successful resolution", () => {
    it.effect("resolves owner/repo to Some when repo exists", () =>
      Effect.gen(function* () {
        const result = yield* resolveRepo({
          owner: "acme",
          repo: "widgets",
          subPath: Option.none(),
        }).pipe(Effect.provide(allOkLayer));

        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.type).toBe("bitbucket");
          expect(result.value.owner).toBe("acme");
          expect(result.value.repo).toBe("widgets");
          expect(result.value.ref).toEqual(Option.none());
          expect(result.value.subPath).toEqual(Option.none());
        }
      }),
    );

    it.effect("resolves owner/repo with subPath when both exist", () =>
      Effect.gen(function* () {
        const result = yield* resolveRepo({
          owner: "acme",
          repo: "widgets",
          subPath: Option.some("src/lib"),
        }).pipe(Effect.provide(allOkLayer));

        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.type).toBe("bitbucket");
          expect(result.value.owner).toBe("acme");
          expect(result.value.repo).toBe("widgets");
          expect(result.value.subPath).toEqual(Option.some("src/lib"));
        }
      }),
    );
  });

  describe("repo not found (404)", () => {
    it.effect("returns None when repo does not exist", () =>
      Effect.gen(function* () {
        const result = yield* resolveRepo({
          owner: "acme",
          repo: "nonexistent",
          subPath: Option.none(),
        }).pipe(Effect.provide(repoNotFoundLayer));

        expect(Option.isNone(result)).toBe(true);
      }),
    );

    it.effect("returns None when subPath does not exist", () =>
      Effect.gen(function* () {
        const result = yield* resolveRepo({
          owner: "acme",
          repo: "widgets",
          subPath: Option.some("missing/path"),
        }).pipe(Effect.provide(subPathNotFoundLayer));

        expect(Option.isNone(result)).toBe(true);
      }),
    );
  });

  describe("network errors", () => {
    it.effect("fails with AppError on network failure", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          resolveRepo({
            owner: "acme",
            repo: "widgets",
            subPath: Option.none(),
          }).pipe(Effect.provide(networkErrorLayer)),
        );

        expect(error).toBeInstanceOf(AppError);
        expect(error.code).toBe("validation");
        expect(error.detail).toContain("Failed to check Bitbucket");
      }),
    );
  });
});
