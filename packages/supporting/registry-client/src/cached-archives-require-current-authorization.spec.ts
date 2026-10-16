import { createHash } from "node:crypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { defineSpecification } from "@agentxm/specification-metadata";
import { exactVersion, extensionName, handle, remoteRegistryClient } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "registry-client/cached-archives-require-current-authorization",
  title: "Cached archives retain current Registry content authorization",
  statement:
    "When reusing a Registry archive from its cache, AXM shall validate current archive download authorization and matching integrity before returning the bytes, retaining exact-version publisher binding evidence and applying the same checks to verification-purpose acquisitions.",
  class: "functional",
  role: "interface",
  goals: ["trustworthy-distribution"],
  boundary: "platform",
  boundaryRationale:
    "A real temporary archive cache and controlled Registry responses expose whether a later acquisition returns bytes after access is withdrawn.",
  methods: ["contract", "decision-table"],
  derivedFrom: ["packages/supporting/registry-client/specs/registry-openapi.json"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const archive = new Uint8Array([1, 2, 3]);
const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
const observedAt = "2026-10-16T00:00:00.000Z";
const metadata = {
  schemaVersion: 1,
  selectionPolicyVersion: "1",
  observedAt,
  results: [
    {
      key: "exact",
      outcome: "metadata",
      page: {
        publisherBindingId: "hbnd_test",
        visibility: "public",
        archival: null,
        deprecation: null,
        revision: "revision",
        observedAt,
        validUntil: "2026-10-16T00:00:30.000Z",
        versions: [{ version: "1.0.0", published: observedAt, integrity }],
        continuation: null,
      },
    },
  ],
};
const index = {
  name: "example",
  owner: "@acme",
  type: "skill",
  publisherBindingId: "hbnd_test",
  description: "Example skill",
  archival: null,
  deprecation: null,
  versions: [{ version: "1.0.0", published: observedAt, integrity }],
};
const archivePath = "/v1/extensions/%40acme/skills/example/1.0.0/archive";

describe("Authorization for cached archives", () => {
  for (const exact of [false, true]) {
    for (const usagePurpose of [undefined, "verification"] as const) {
      for (const deniedStatus of [403, 404]) {
        it.effect(
          `refuses ${exact ? "exact" : "selected"} ${usagePurpose ?? "normal"} cached bytes after archive access returns ${deniedStatus} while metadata remains visible`,
          () =>
            Effect.gen(function* () {
              const fileSystem = yield* FileSystem.FileSystem;
              const root = yield* fileSystem.makeTempDirectoryScoped({
                prefix: "axm-content-access-",
              });
              const requests: Array<{ readonly method: string; readonly path: string }> = [];
              let revoked = false;
              const http = HttpClient.make((request) =>
                Effect.sync(() => {
                  const requestPath = new URL(request.url).pathname;
                  requests.push({ method: request.method, path: requestPath });
                  if (requestPath === "/v1/resolutions/metadata") {
                    return HttpClientResponse.fromWeb(request, Response.json(metadata));
                  }
                  if (!requestPath.endsWith("/archive")) {
                    return HttpClientResponse.fromWeb(request, Response.json(index));
                  }
                  expect(request.headers["x-agentxm-usage-purpose"]).toBe(usagePurpose);
                  expect(request.headers["range"]).toBeUndefined();
                  expect(request.headers["if-none-match"]).toBeUndefined();
                  return HttpClientResponse.fromWeb(
                    request,
                    new Response(request.method === "HEAD" ? null : archive, {
                      status: revoked ? deniedStatus : 200,
                      headers: {
                        "x-integrity": integrity,
                        "x-request-id": "fc9c43e7-e99a-46ee-a55c-c0e8ef747c64",
                      },
                    }),
                  );
                }),
              );
              const client = yield* remoteRegistryClient(http, fileSystem, yield* Path.Path, root);
              const args = {
                owner: handle("@acme"),
                type: "skill" as const,
                name: extensionName("example"),
                ...(exact
                  ? {
                      exact: {
                        version: exactVersion("1.0.0"),
                        integrity,
                        publisherBindingId: "hbnd_test",
                      },
                    }
                  : { version: Option.none() }),
                ...(usagePurpose === undefined ? {} : { usagePurpose }),
              };
              expect((yield* client.getExtensionPackage(args)).archive).toEqual(archive);
              expect((yield* client.getExtensionPackage(args)).archive).toEqual(archive);
              revoked = true;
              const failure = yield* client.getExtensionPackage(args).pipe(Effect.flip);
              expect(failure.category).toBe(deniedStatus === 403 ? "forbidden" : "not_found");
              expect(failure.metadata?.response?.status).toBe(deniedStatus);
              expect(failure.metadata?.response?.requestId).toBe(
                "fc9c43e7-e99a-46ee-a55c-c0e8ef747c64",
              );
              expect(requests.filter((request) => request.path === archivePath)).toEqual([
                { method: "GET", path: archivePath },
                { method: "HEAD", path: archivePath },
                { method: "HEAD", path: archivePath },
              ]);
            }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
        );
      }
    }
  }

  it.effect.each([
    { status: 200, reportedIntegrity: "sha512-different" },
    { status: 200, reportedIntegrity: undefined },
    { status: 204, reportedIntegrity: integrity },
    { status: 206, reportedIntegrity: integrity },
    { status: 304, reportedIntegrity: integrity },
    { status: 409, reportedIntegrity: integrity },
  ])(
    "refuses cached bytes for archive HEAD $status with integrity $reportedIntegrity",
    ({ status, reportedIntegrity }) =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "axm-cache-evidence-" });
        let archiveGets = 0;
        const http = HttpClient.make((request) =>
          Effect.sync(() => {
            if (new URL(request.url).pathname === "/v1/resolutions/metadata") {
              return HttpClientResponse.fromWeb(request, Response.json(metadata));
            }
            if (request.method === "GET") {
              archiveGets += 1;
              return HttpClientResponse.fromWeb(request, new Response(archive));
            }
            return HttpClientResponse.fromWeb(
              request,
              new Response(null, {
                status,
                headers:
                  reportedIntegrity === undefined ? {} : { "x-integrity": reportedIntegrity },
              }),
            );
          }),
        );
        const client = yield* remoteRegistryClient(http, fileSystem, yield* Path.Path, root);
        const args = {
          owner: handle("@acme"),
          type: "skill" as const,
          name: extensionName("example"),
          exact: { version: exactVersion("1.0.0"), integrity, publisherBindingId: "hbnd_test" },
        };
        yield* client.getExtensionPackage(args);
        const failure = yield* client.getExtensionPackage(args).pipe(Effect.flip);
        expect(failure.metadata?.response?.status).toBe(status);
        expect(archiveGets).toBe(1);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  for (const usagePurpose of [undefined, "verification"] as const) {
    it.effect(
      `refuses previously cached ${usagePurpose ?? "normal"} bytes after access is withdrawn`,
      () =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const root = yield* fileSystem.makeTempDirectoryScoped({
            prefix: "axm-authorized-cache-",
          });
          const requests: Array<string> = [];
          const http = HttpClient.make((request) =>
            Effect.sync(() => {
              requests.push(new URL(request.url).pathname);
              if (requests.length === 1)
                return HttpClientResponse.fromWeb(request, new Response(archive, { status: 200 }));
              expect(requests[1]).toBe("/v1/resolutions/metadata");
              return HttpClientResponse.fromWeb(
                request,
                new Response(
                  JSON.stringify({
                    schemaVersion: 1,
                    selectionPolicyVersion: "1",
                    observedAt: "2026-10-16T00:00:00.000Z",
                    results: [{ key: "exact", outcome: "unavailable" }],
                  }),
                  { status: 200 },
                ),
              );
            }),
          );
          const client = yield* remoteRegistryClient(http, fileSystem, yield* Path.Path, root);
          const args = {
            owner: handle("@acme"),
            type: "skill" as const,
            name: extensionName("example"),
            exact: { version: exactVersion("1.0.0"), integrity, publisherBindingId: "hbnd_test" },
            ...(usagePurpose === undefined ? {} : { usagePurpose }),
          };
          const first = yield* client.getExtensionPackage(args);
          expect(first.archive).toEqual(archive);
          const failure = yield* client.getExtensionPackage(args).pipe(Effect.flip);
          expect(failure.category).toBe("conflict");
          expect(requests).toHaveLength(2);
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }
});
