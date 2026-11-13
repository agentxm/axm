import { createServer } from "node:http";
import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { ResolutionMetadataRequestSchema } from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import * as HttpClient from "effect/http/HttpClient";
import { makeOperationRequestBudget, OperationRequestBudget } from "@agentxm/host-primitives";
import { makeRegistryClientFactory, RegistryHttpClient } from "@agentxm/registry-client";
import { passThroughRegistryAuthorization } from "@agentxm/registry-client/testing";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { makeRegistryHttpClientLayer, PlatformLayer } from "./runtime.js";

// Supports request admission through body consumption using the production CLI
// fetch adapter and a real socket. The server owns the independent arrival journal.
it.live(
  "a stalled Registry body retains its permit until timeout, then queued work completes",
  () =>
    Effect.gen(function* () {
      const arrivals: string[] = [];
      const slowResponseClosed = Promise.withResolvers<void>();
      const server = yield* Effect.acquireRelease(
        Effect.promise(async () => {
          const server = createServer((request, response) => {
            let body = "";
            request.setEncoding("utf8");
            request.on("data", (chunk: unknown) => {
              if (typeof chunk === "string") body += chunk;
            });
            request.on("end", () => {
              const input = Schema.decodeUnknownSync(
                Schema.fromJsonString(ResolutionMetadataRequestSchema),
              )(body);
              const first = input.items[0];
              if (first === undefined) throw new Error("Missing requested identity");
              const name = first.identity.name;
              arrivals.push(name);
              response.writeHead(200, { "content-type": "application/json" });
              if (name === "slow") {
                response.on("close", () => slowResponseClosed.resolve());
                response.write('{"schemaVersion":2,');
                return;
              }
              const observedAt = "2026-11-13T00:00:00.000Z";
              response.end(
                JSON.stringify({
                  schemaVersion: 2,
                  purpose: "select",
                  selectionPolicyVersion: "1",
                  observedAt,
                  results: input.items.map(({ key }) => ({
                    key,
                    outcome: "metadata",
                    page: {
                      publisherBindingId: "hbnd_fixture",
                      visibility: "public",
                      archival: null,
                      deprecation: null,
                      revision: "fixture",
                      observedAt,
                      validUntil: "2099-01-01T00:00:00.000Z",
                      versions: [
                        {
                          version: "1.0.0",
                          published: observedAt,
                          integrity: `sha512-${"A".repeat(86)}==`,
                        },
                      ],
                      continuation: null,
                    },
                  })),
                }),
              );
            });
          });
          await new Promise<void>((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", () => resolve());
          });
          return server;
        }),
        (server) =>
          Effect.promise(
            () =>
              new Promise<void>((resolve) => {
                server.closeAllConnections();
                server.close(() => resolve());
              }),
          ),
      );
      const address = server.address();
      if (address === null || typeof address === "string")
        throw new Error("Missing fixture address");
      const endpoint = decodeRegistryEndpointSync(`http://127.0.0.1:${address.port}`);
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: "axm-wire-body-" });
      const headers = yield* Deferred.make<void>();
      const transport = yield* RegistryHttpClient.pipe(
        Effect.provide(makeRegistryHttpClientLayer(globalThis.fetch)),
      );
      const observed = HttpClient.transformResponse(transport, (response) =>
        response.pipe(Effect.tap(() => Deferred.succeed(headers, undefined))),
      );
      const factory = yield* makeRegistryClientFactory({
        httpClient: observed,
        fileSystem: fs,
        path,
        authorization: passThroughRegistryAuthorization,
      }).pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ AXM_USER_HOME: home }))),
      );
      const client = yield* factory.forEndpoint(endpoint, {
        requestPolicy: {
          requestTimeout: "2 seconds",
          totalDeadline: "10 seconds",
          maxAttempts: 1,
          initialBackoff: "0 millis",
          maxBackoff: "0 millis",
        },
      });
      const budget = yield* makeOperationRequestBudget({ invocation: 1, origin: 1 });
      const attempts: Array<{ event: "start" | "end"; success?: boolean }> = [];
      let active = 0;
      const governed = OperationRequestBudget.of({
        capacity: budget.capacity,
        withAttempt: (origin, effect) =>
          budget.withAttempt(
            origin,
            Effect.gen(function* () {
              active++;
              attempts.push({ event: "start" });
              return yield* effect.pipe(
                Effect.onExit((exit) =>
                  Effect.sync(() => {
                    active--;
                    attempts.push({ event: "end", success: Exit.isSuccess(exit) });
                  }),
                ),
              );
            }),
          ),
      });
      const read = (name: string) =>
        client
          .getExtensionIndex({
            owner: decodeHandleSync("@acme"),
            type: "skill",
            name: decodeExtensionNameSync(name),
          })
          .pipe(Effect.provideService(OperationRequestBudget, governed));
      const slow = yield* read("slow").pipe(Effect.result, Effect.forkChild);
      yield* Deferred.await(headers);
      expect(arrivals).toEqual(["slow"]);
      expect(active).toBe(1);
      const ready = yield* read("ready").pipe(Effect.forkChild);
      const failure = yield* Fiber.join(slow);
      expect(failure).toMatchObject({ _tag: "Failure", failure: { category: "timeout" } });
      expect(yield* Fiber.join(ready)).toMatchObject({ _tag: "Some", value: { name: "ready" } });
      expect(active).toBe(0);
      expect(arrivals).toEqual(["slow", "ready"]);
      expect(attempts).toEqual([
        { event: "start" },
        { event: "end", success: false },
        { event: "start" },
        { event: "end", success: true },
      ]);
      // Socket cleanup is independent of the request-budget instrumentation.
      yield* Effect.promise(() => slowResponseClosed.promise);
    }).pipe(Effect.scoped, Effect.provide(PlatformLayer)),
);
