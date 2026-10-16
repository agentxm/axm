import { createHash } from "node:crypto";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { defineSpecification } from "@agentxm/specification-metadata";
import { exactVersion, extensionName, handle, remoteRegistryClient } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "registry-client/remote-archives-require-complete-responses",
  title: "Unconditional archive acquisition requires a complete response",
  statement:
    "For an unconditional Registry archive GET, AXM shall accept only a complete 200 response, refuse partial or bodyless success responses before admitting archive bytes, and preserve response evidence without retrying a permanent refusal.",
  class: "functional",
  role: "interface",
  goals: ["trustworthy-distribution", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "Controlled HTTP responses expose admission, attempts, and failure metadata through the public client factory.",
  methods: ["contract", "decision-table"],
  derivedFrom: ["packages/supporting/registry-client/specs/registry-openapi.json"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const archive = new Uint8Array([1, 2, 3]);
const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;

describe("Complete remote archive acquisition", () => {
  for (const status of [204, 206, 416]) {
    it.effect(`refuses ${status} without retrying or caching bytes`, () =>
      Effect.gen(function* () {
        let requests = 0;
        let writes = 0;
        const http = HttpClient.make((request) =>
          Effect.sync(() => {
            requests += 1;
            expect(request.headers["range"]).toBeUndefined();
            expect(request.headers["if-none-match"]).toBeUndefined();
            return HttpClientResponse.fromWeb(
              request,
              new Response(status === 204 ? null : archive, {
                status,
                headers: {
                  "content-type": "application/zip",
                  "x-request-id": "fc9c43e7-e99a-46ee-a55c-c0e8ef747c61",
                  ...(status === 206 ? { "content-range": "bytes 0-2/8" } : {}),
                  ...(status === 416 ? { "content-range": "bytes */8" } : {}),
                },
              }),
            );
          }),
        );
        const fileSystem = FileSystem.makeNoop({
          exists: () => Effect.succeed(false),
          makeDirectory: () =>
            Effect.sync(() => {
              writes += 1;
            }),
        });
        const client = yield* remoteRegistryClient(
          http,
          fileSystem,
          yield* Path.Path,
          "/isolated-user",
        );
        const failure = yield* client
          .getExtensionPackage({
            owner: handle("@acme"),
            type: "skill",
            name: extensionName("example"),
            exact: { version: exactVersion("1.0.0"), integrity, publisherBindingId: "hbnd_test" },
          })
          .pipe(Effect.flip);
        expect(failure.metadata?.response).toMatchObject({
          status,
          requestId: "fc9c43e7-e99a-46ee-a55c-c0e8ef747c61",
        });
        if (status !== 416)
          expect(failure).toMatchObject({
            _tag: "RegistryRequestFailed",
            reason: "response-decode",
          });
        expect(requests).toBe(1);
        expect(writes).toBe(0);
      }).pipe(Effect.provide(Path.layer)),
    );
  }
});
