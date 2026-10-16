import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { DiscoverPackagesRequestSchema } from "@agentxm/registry-protocol/unstable/registry/discover-schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import { agentExtensionRecommendation, packageUrl, remoteRegistryClient } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "registry-client/discovery-respects-request-limits",
  title: "Large workspace discovery respects the Registry request contract",
  statement:
    "AXM shall divide package discovery into requests within the Registry's package, declared-extension, and encoded JSON byte limits, preserve each package's complete normalized declarations and version ranges, refuse a package that cannot fit alone before sending any request, and return all results in input order only when every request succeeds.",
  class: "functional",
  role: "interface",
  goals: ["trustworthy-distribution", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "Recorded HTTP bytes and responses expose all request bounds, package integrity, ordering, and partial-failure handling through the public client factory.",
  methods: ["contract", "example"],
  derivedFrom: ["packages/supporting/registry-client/specs/registry-openapi.json"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const packages = Array.from({ length: 1001 }, (_, i) => ({
  purl: packageUrl(`pkg:npm/package-${i}@1.0.0`),
  version: "1.0.0",
  declaredExtensions: [
    agentExtensionRecommendation({ ref: "@acme/skills/example", versionRange: "^1.0.0" }),
  ],
}));

describe("Discovery request limits", () => {
  for (const rejectedStatus of [undefined, 400, 413]) {
    it.effect(
      rejectedStatus !== undefined
        ? `preserves a later ${rejectedStatus} refusal without retry or partial success`
        : "discovers 1,001 packages in order through bounded requests",
      () =>
        Effect.gen(function* () {
          const batches: Array<ReadonlyArray<string>> = [];
          const http = HttpClient.make((request) =>
            Effect.gen(function* () {
              if (request.body._tag !== "Uint8Array")
                return yield* Effect.die("Expected JSON payload");
              const payload = yield* Schema.decodeUnknownEffect(
                Schema.fromJsonString(DiscoverPackagesRequestSchema),
              )(new TextDecoder().decode(request.body.body)).pipe(Effect.orDie);
              expect(payload.packages.length).toBeLessThanOrEqual(500);
              expect(
                payload.packages.every(
                  (pkg) =>
                    pkg.declaredExtensions[0]?.source.type === "registry" &&
                    "versionRange" in pkg.declaredExtensions[0] &&
                    pkg.declaredExtensions[0].versionRange === "^1.0.0",
                ),
              ).toBe(true);
              batches.push(payload.packages.map((pkg) => pkg.purl));
              const response =
                rejectedStatus !== undefined && batches.length === 2
                  ? new Response(
                      JSON.stringify({
                        type: "https://registry.example.test/problems/invalid_request",
                        title: "Invalid discovery request",
                        status: rejectedStatus,
                        code: rejectedStatus === 413 ? "payload_too_large" : "invalid_request",
                        detail: "Invalid package metadata",
                        ...(rejectedStatus === 400
                          ? {
                              requestId: "fc9c43e7-e99a-46ee-a55c-c0e8ef747c62",
                              errors: [
                                { pointer: "/packages", detail: "Invalid package metadata" },
                              ],
                            }
                          : {}),
                      }),
                      {
                        status: rejectedStatus,
                        headers: {
                          "x-request-id": "fc9c43e7-e99a-46ee-a55c-c0e8ef747c62",
                          "content-type": "application/json",
                        },
                      },
                    )
                  : new Response(
                      JSON.stringify({
                        results: payload.packages.map((pkg) => ({
                          purl: pkg.purl,
                          version: pkg.version,
                          status: "resolved",
                          extensions: [],
                        })),
                      }),
                      { status: 200 },
                    );
              return HttpClientResponse.fromWeb(request, response);
            }),
          );
          const client = yield* remoteRegistryClient(
            http,
            FileSystem.makeNoop({}),
            yield* Path.Path,
            "/isolated-user",
          );
          if (rejectedStatus !== undefined) {
            const failure = yield* client.discoverPackages({ packages }).pipe(Effect.flip);
            expect(failure.category).toBe("validation");
            expect(failure.metadata?.response).toMatchObject({
              status: rejectedStatus,
              requestId: "fc9c43e7-e99a-46ee-a55c-c0e8ef747c62",
            });
            expect(batches.map((batch) => batch.length)).toEqual([500, 500]);
          } else {
            const response = yield* client.discoverPackages({ packages });
            expect(batches.map((batch) => batch.length)).toEqual([500, 500, 1]);
            expect(response.results.map((result) => result.purl)).toEqual(
              packages.map((_, i) => `pkg:npm/package-${i}`),
            );
          }
        }).pipe(Effect.provide(Path.layer)),
    );
  }

  for (const declarationsPerPackage of [0, 2]) {
    it.effect(
      `batches 501 packages containing ${declarationsPerPackage} declarations each without losing package metadata`,
      () =>
        Effect.gen(function* () {
          const input = Array.from({ length: 501 }, (_, index) => ({
            purl: packageUrl(`pkg:npm/bounded-${index}`),
            version: "1.0.0",
            declaredExtensions: Array.from({ length: declarationsPerPackage }, (_, declaration) =>
              agentExtensionRecommendation({
                ref: `@acme/skills/example-${declaration}`,
                versionRange: "^1.0.0",
              }),
            ),
          }));
          const batchSizes: Array<number> = [];
          const http = HttpClient.make((request) =>
            Effect.gen(function* () {
              if (request.body._tag !== "Uint8Array")
                return yield* Effect.die("Expected JSON payload");
              const payload = yield* Schema.decodeUnknownEffect(
                Schema.fromJsonString(DiscoverPackagesRequestSchema),
              )(new TextDecoder().decode(request.body.body)).pipe(Effect.orDie);
              expect(payload.packages.length).toBeLessThanOrEqual(500);
              expect(
                payload.packages.reduce((count, pkg) => count + pkg.declaredExtensions.length, 0),
              ).toBeLessThanOrEqual(500);
              expect(
                payload.packages.every(
                  (pkg) => pkg.declaredExtensions.length === declarationsPerPackage,
                ),
              ).toBe(true);
              batchSizes.push(payload.packages.length);
              return HttpClientResponse.fromWeb(
                request,
                Response.json({
                  results: payload.packages.map((pkg) => ({
                    purl: pkg.purl,
                    version: pkg.version,
                    status: "resolved",
                    extensions: [],
                  })),
                }),
              );
            }),
          );
          const client = yield* remoteRegistryClient(
            http,
            FileSystem.makeNoop({}),
            yield* Path.Path,
            "/isolated-user",
          );
          const response = yield* client.discoverPackages({ packages: input });
          expect(batchSizes).toEqual(declarationsPerPackage === 0 ? [500, 1] : [250, 250, 1]);
          expect(response.results.map((result) => result.purl)).toEqual(
            input.map((_, index) => `pkg:npm/bounded-${index}`),
          );
        }).pipe(Effect.provide(Path.layer)),
    );
  }

  it.effect("counts UTF-8 bytes, JSON escaping, and the request envelope while batching", () =>
    Effect.gen(function* () {
      const version = 'é"\\'.repeat(70_000);
      const input = Array.from({ length: 3 }, (_, index) => ({
        purl: packageUrl(`pkg:npm/large-${index}`),
        version,
        declaredExtensions: [],
      }));
      const sizes: Array<number> = [];
      const batchSizes: Array<number> = [];
      const http = HttpClient.make((request) =>
        Effect.gen(function* () {
          if (request.body._tag !== "Uint8Array") return yield* Effect.die("Expected JSON payload");
          sizes.push(request.body.body.byteLength);
          expect(request.body.body.byteLength).toBeLessThanOrEqual(1024 * 1024);
          const payload = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(DiscoverPackagesRequestSchema),
          )(new TextDecoder().decode(request.body.body)).pipe(Effect.orDie);
          expect(payload.packages.every((pkg) => pkg.version === version)).toBe(true);
          batchSizes.push(payload.packages.length);
          return HttpClientResponse.fromWeb(
            request,
            Response.json({
              results: payload.packages.map((pkg) => ({
                purl: pkg.purl,
                version: pkg.version,
                status: "resolved",
                extensions: [],
              })),
            }),
          );
        }),
      );
      const client = yield* remoteRegistryClient(
        http,
        FileSystem.makeNoop({}),
        yield* Path.Path,
        "/isolated-user",
      );
      const response = yield* client.discoverPackages({ packages: input });
      expect(batchSizes).toEqual([2, 1]);
      expect(sizes[0]).toBeGreaterThan(800_000);
      expect(response.results.map((result) => result.purl)).toEqual([
        "pkg:npm/large-0",
        "pkg:npm/large-1",
        "pkg:npm/large-2",
      ]);
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("admits a package at exactly the encoded byte boundary", () =>
    Effect.gen(function* () {
      const sizes: Array<number> = [];
      const http = HttpClient.make((request) =>
        Effect.gen(function* () {
          if (request.body._tag !== "Uint8Array") return yield* Effect.die("Expected JSON payload");
          sizes.push(request.body.body.byteLength);
          return HttpClientResponse.fromWeb(request, Response.json({ results: [] }));
        }),
      );
      const client = yield* remoteRegistryClient(
        http,
        FileSystem.makeNoop({}),
        yield* Path.Path,
        "/isolated-user",
      );
      const pkg = { purl: packageUrl("pkg:npm/boundary"), version: "", declaredExtensions: [] };
      yield* client.discoverPackages({ packages: [pkg] });
      const baseBytes = sizes[0];
      if (baseBytes === undefined) return yield* Effect.die("Missing baseline request");
      const paddingBytes = 1024 * 1024 - baseBytes;
      const version = "é".repeat(Math.floor(paddingBytes / 2)) + "x".repeat(paddingBytes % 2);
      yield* client.discoverPackages({ packages: [{ ...pkg, version }] });
      expect(sizes[1]).toBe(1024 * 1024);
      const failure = yield* client
        .discoverPackages({ packages: [{ ...pkg, version: `${version}x` }] })
        .pipe(Effect.flip);
      expect(failure).toMatchObject({ _tag: "RegistryOperationFailed", category: "validation" });
      expect(sizes).toHaveLength(2);
    }).pipe(Effect.provide(Path.layer)),
  );

  for (const oversized of ["declarations", "bytes"] as const) {
    it.effect(
      `refuses a package with excessive ${oversized} before sending earlier fitting packages`,
      () =>
        Effect.gen(function* () {
          let requests = 0;
          const http = HttpClient.make(() =>
            Effect.sync(() => {
              requests += 1;
            }).pipe(Effect.andThen(Effect.die("An oversized package must be refused before HTTP"))),
          );
          const client = yield* remoteRegistryClient(
            http,
            FileSystem.makeNoop({}),
            yield* Path.Path,
            "/isolated-user",
          );
          const fitting = {
            purl: packageUrl("pkg:npm/fitting"),
            version: "1.0.0",
            declaredExtensions: [],
          };
          const excessive = {
            purl: packageUrl("pkg:npm/oversized"),
            version: oversized === "bytes" ? "é".repeat(1024 * 512) : "1.0.0",
            declaredExtensions:
              oversized === "declarations"
                ? Array.from({ length: 501 }, () =>
                    agentExtensionRecommendation({ ref: "@acme/skills/example" }),
                  )
                : [],
          };
          const failure = yield* client
            .discoverPackages({ packages: [fitting, excessive] })
            .pipe(Effect.flip);
          expect(failure).toMatchObject({
            _tag: "RegistryOperationFailed",
            category: "validation",
          });
          expect(failure.detail).toContain(oversized === "bytes" ? "1048576" : "500");
          expect(requests).toBe(0);
        }).pipe(Effect.provide(Path.layer)),
    );
  }
});
