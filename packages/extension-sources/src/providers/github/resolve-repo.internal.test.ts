import { describe, expect, it } from "@effect/vitest";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { resolveRepo } from "./resolve-repo.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeMockHttpLayer = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() => HttpClientResponse.fromWeb(request, handler(request))),
    ),
  );

const makeTransportErrorHttpLayer = (cause: unknown) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.fail(
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request, cause }),
        }),
      ),
    ),
  );

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("resolveRepo", () => {
  describe("successful resolution", () => {
    it.effect("resolves owner/repo when repo exists", () =>
      Effect.gen(function* () {
        const layer = makeMockHttpLayer(() => new Response(null, { status: 200 }));

        const result = yield* resolveRepo({
          owner: "acme",
          repo: "widgets",
          subPath: Option.none(),
        }).pipe(Effect.provide(layer));

        expect(Option.isSome(result)).toBe(true);
        const params = Option.getOrThrow(result);
        expect(params.type).toBe("github");
        expect(params.owner).toBe("acme");
        expect(params.repo).toBe("widgets");
        expect(Option.isNone(params.ref)).toBe(true);
        expect(Option.isNone(params.subPath)).toBe(true);
      }),
    );

    it.effect("resolves owner/repo with subPath when both exist", () =>
      Effect.gen(function* () {
        const layer = makeMockHttpLayer(() => new Response(null, { status: 200 }));

        const result = yield* resolveRepo({
          owner: "acme",
          repo: "widgets",
          subPath: Option.some("src/lib"),
        }).pipe(Effect.provide(layer));

        expect(Option.isSome(result)).toBe(true);
        const params = Option.getOrThrow(result);
        expect(params.owner).toBe("acme");
        expect(params.repo).toBe("widgets");
        expect(Option.getOrNull(params.subPath)).toBe("src/lib");
      }),
    );
  });

  describe("repo not found", () => {
    it.effect("returns None when repo returns 404", () =>
      Effect.gen(function* () {
        const layer = makeMockHttpLayer(() => new Response(null, { status: 404 }));

        const result = yield* resolveRepo({
          owner: "acme",
          repo: "nonexistent",
          subPath: Option.none(),
        }).pipe(Effect.provide(layer));

        expect(Option.isNone(result)).toBe(true);
      }),
    );

    it.effect("returns None when subPath returns 404 but repo exists", () =>
      Effect.gen(function* () {
        const layer = makeMockHttpLayer((request) => {
          const url = new URL(request.url);
          // Repo HEAD succeeds, subPath HEAD fails
          if (url.pathname.includes("/tree/HEAD/")) {
            return new Response(null, { status: 404 });
          }
          return new Response(null, { status: 200 });
        });

        const result = yield* resolveRepo({
          owner: "acme",
          repo: "widgets",
          subPath: Option.some("nonexistent/path"),
        }).pipe(Effect.provide(layer));

        expect(Option.isNone(result)).toBe(true);
      }),
    );
  });

  describe("network errors", () => {
    it.effect("fails with a typed failure on network error", () =>
      Effect.gen(function* () {
        const layer = makeTransportErrorHttpLayer(new Error("Connection refused"));

        const result = yield* resolveRepo({
          owner: "acme",
          repo: "widgets",
          subPath: Option.none(),
        }).pipe(Effect.provide(layer), Effect.result);

        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure._tag).toBe("SourceNotResolvable");
          expect(result.failure.category).toBe("validation");
          expect(result.failure.detail).toContain("Failed to check GitHub");
        }
      }),
    );

    it.effect("fails with a typed failure on subPath network error", () =>
      Effect.gen(function* () {
        let callCount = 0;
        const layer = Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) => {
            callCount++;
            // First call (repo check) succeeds, second call (subPath check) fails
            if (callCount === 1) {
              return Effect.sync(() =>
                HttpClientResponse.fromWeb(request, new Response(null, { status: 200 })),
              );
            }
            return Effect.fail(
              new HttpClientError.HttpClientError({
                reason: new HttpClientError.TransportError({
                  request,
                  cause: new Error("Connection reset"),
                }),
              }),
            );
          }),
        );

        const result = yield* resolveRepo({
          owner: "acme",
          repo: "widgets",
          subPath: Option.some("src/lib"),
        }).pipe(Effect.provide(layer), Effect.result);

        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure.category).toBe("validation");
          expect(result.failure.detail).toContain("Failed to check GitHub");
        }
      }),
    );
  });

  describe("request details", () => {
    it.effect("sends HEAD request to correct repo URL", () =>
      Effect.gen(function* () {
        const urls: Array<string> = [];
        const methods: Array<string> = [];

        const layer = Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) => {
            urls.push(request.url);
            methods.push(request.method);
            return Effect.sync(() =>
              HttpClientResponse.fromWeb(request, new Response(null, { status: 200 })),
            );
          }),
        );

        yield* resolveRepo({
          owner: "acme",
          repo: "widgets",
          subPath: Option.none(),
        }).pipe(Effect.provide(layer));

        expect(urls).toEqual(["https://github.com/acme/widgets"]);
        expect(methods).toEqual(["HEAD"]);
      }),
    );

    it.effect("sends HEAD requests for both repo and subPath", () =>
      Effect.gen(function* () {
        const urls: Array<string> = [];

        const layer = Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) => {
            urls.push(request.url);
            return Effect.sync(() =>
              HttpClientResponse.fromWeb(request, new Response(null, { status: 200 })),
            );
          }),
        );

        yield* resolveRepo({
          owner: "acme",
          repo: "widgets",
          subPath: Option.some("src/lib"),
        }).pipe(Effect.provide(layer));

        expect(urls).toEqual([
          "https://github.com/acme/widgets",
          "https://github.com/acme/widgets/tree/HEAD/src/lib",
        ]);
      }),
    );
  });
});
