import { existsSync } from "node:fs";
import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { computeIntegrity } from "@agentxm/host-primitives";
import { ExactContentRequestSchema } from "@agentxm/registry-protocol/unstable/registry/resolutions";
import { makeArchiveCache } from "./archive-cache.js";
import { createRemoteRegistryClient } from "./remote-client.js";
import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { testRegistryAuthority, exactVersion, extensionName, handle } from "./test-helpers.js";

it.effect.each(["corrupt", "truncated", "bad-refetch"])(
  "%s cache recovery requires admission, verifies refetched bytes, and preserves unrelated entries",
  (scenario) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-cache-recovery-" });
      const cache = yield* makeArchiveCache(fs, path, root);
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const integrity = yield* computeIntegrity(bytes);
      const unrelated = new Uint8Array([5, 6, 7, 8]);
      const unrelatedIntegrity = yield* computeIntegrity(unrelated);
      yield* cache.write(integrity, bytes);
      const [entry] = (yield* fs.readDirectory(root)).filter((name) => name.endsWith(".zip"));
      if (entry === undefined) throw new Error("Expected cached archive");
      const damagedPath = path.join(root, entry);
      yield* cache.write(unrelatedIntegrity, unrelated);
      yield* fs.writeFile(
        damagedPath,
        scenario === "truncated" ? bytes.slice(0, 2) : new Uint8Array([9, 9, 9, 9]),
      );
      const requests: string[] = [];
      let allowed = false;
      const http = HttpClient.make((request) =>
        Effect.sync(() => {
          const pathname = new URL(request.url).pathname;
          requests.push(`${request.method} ${pathname}`);
          if (request.method === "GET") {
            expect(pathname).toMatch(/\/skills\/recover\/1\.0\.0\/archive$/u);
            // Corrupt local bytes have been removed before any refetch starts.
            expect(existsSync(damagedPath)).toBe(false);
            return HttpClientResponse.fromWeb(
              request,
              new Response(scenario === "bad-refetch" ? new Uint8Array([0]) : bytes),
            );
          }
          expect(request.method).toBe("POST");
          expect(pathname).toBe("/v1/resolutions");
          if (request.body._tag !== "Uint8Array") throw new Error("Expected request body");
          const input = Schema.decodeUnknownSync(Schema.fromJsonString(ExactContentRequestSchema))(
            new TextDecoder().decode(request.body.body),
          );
          const observedAt = "2026-11-13T00:00:00Z";
          return HttpClientResponse.fromWeb(
            request,
            Response.json({
              schemaVersion: 2,
              purpose: "authorize-exact",
              observedAt,
              results: input.items.map((item) =>
                allowed
                  ? {
                      key: item.key,
                      outcome: "allowed",
                      identity: item.identity,
                      accepted: item.accepted,
                      publisherBindingId: item.expectedPublisherBinding,
                      yanked: false,
                      observedAt,
                    }
                  : { key: item.key, outcome: "unavailable" },
              ),
            }),
          );
        }),
      );
      const client = createRemoteRegistryClient(
        decodeHttpRegistryEndpointSync("https://registry.example.test"),
        http,
        testRegistryAuthority,
        cache,
      );
      const selection = {
        owner: handle("@acme"),
        type: "skill" as const,
        name: extensionName("recover"),
        exact: { version: exactVersion("1.0.0"), integrity, publisherBindingId: "publisher" },
      };
      expect(Result.isFailure(yield* Effect.result(client.getExtensionPackage(selection)))).toBe(
        true,
      );
      expect(requests).toEqual(["POST /v1/resolutions"]);
      // Refusal precedes cache access; it neither consumes nor repairs bytes.
      expect(yield* fs.exists(damagedPath)).toBe(true);
      allowed = true;
      const result = yield* Effect.result(client.getExtensionPackage(selection));
      if (scenario === "bad-refetch") {
        expect(result).toMatchObject({ _tag: "Failure", failure: { category: "validation" } });
        expect(Option.isNone(yield* cache.read(integrity))).toBe(true);
      } else {
        expect(result).toMatchObject({ _tag: "Success", success: { archive: bytes } });
        expect(yield* cache.read(integrity)).toEqual(Option.some(bytes));
      }
      expect(requests).toEqual([
        "POST /v1/resolutions",
        "POST /v1/resolutions",
        "GET /v1/extensions/%40acme/skills/recover/1.0.0/archive",
      ]);
      expect(yield* cache.read(unrelatedIntegrity)).toEqual(Option.some(unrelated));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
