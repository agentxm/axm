import * as Schema from "effect/Schema";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import * as Result from "effect/Result";
import { ResolutionMetadataRequestSchema } from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import * as Exit from "effect/Exit";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Option from "effect/Option";
import { RegistryTransportTest, testRegistryEndpoint } from "./testing.js";
import { extensionName, handle } from "./test-helpers.js";
import { RegistryClientFactory } from "./registry-client-factory.js";

const observedAt = "2026-09-22T00:00:00.000Z";
const page = {
  publisherBindingId: "hbnd_test",
  visibility: "public",
  archival: null,
  deprecation: null,
  revision: "a".repeat(64),
  observedAt,
  validUntil: "2026-09-22T00:00:30.000Z",
  versions: [{ version: "1.0.0", published: observedAt, integrity: "sha512-test" }],
  continuation: null,
};

describe("Registry planning metadata batches", () => {
  it.effect("combines distinct concurrent member reads for one registry source", () =>
    Effect.gen(function* () {
      const paths: string[] = [];
      const http = HttpClient.make((request) =>
        Effect.sync(() => {
          paths.push(new URL(request.url).pathname);
          return HttpClientResponse.fromWeb(
            request,
            new Response(
              JSON.stringify({
                schemaVersion: 2,
                purpose: "select",
                selectionPolicyVersion: "1",
                observedAt,
                results: [
                  { key: "0", outcome: "metadata", page },
                  { key: "1", outcome: "metadata", page },
                ],
              }),
              { status: 200 },
            ),
          );
        }),
      );
      const results = yield* Effect.gen(function* () {
        const factory = yield* RegistryClientFactory;
        const client = yield* factory.forEndpoint(testRegistryEndpoint);
        return yield* factory.withReadPhase(
          Effect.all(
            [
              client.getExtensionIndex({
                owner: handle("@acme"),
                type: "skill",
                name: extensionName("first"),
              }),
              client.getExtensionIndex({
                owner: handle("@acme"),
                type: "skill",
                name: extensionName("second"),
              }),
            ],
            { concurrency: "unbounded" },
          ),
        );
      }).pipe(
        Effect.provide(
          Layer.provideMerge(
            RegistryTransportTest(Layer.succeed(HttpClient.HttpClient, http)),
            NodeServices.layer,
          ),
        ),
      );

      expect(paths).toEqual(["/v1/resolutions"]);
      expect(results.map((result) => Option.map(result, (index) => index.name))).toEqual([
        Option.some(extensionName("first")),
        Option.some(extensionName("second")),
      ]);
    }),
  );
});

it.effect("shares across clients only inside one phase and starts fresh after it ends", () =>
  Effect.gen(function* () {
    let requests = 0;
    const http = HttpClient.make((request) =>
      Effect.sync(() => {
        requests += 1;
        expect(new URL(request.url).pathname).toBe("/v1/resolutions");
        expect(request.method).toBe("POST");
        return HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify({
              schemaVersion: 2,
              purpose: "select",
              selectionPolicyVersion: "1",
              observedAt,
              results: [{ key: "0", outcome: "metadata", page }],
            }),
            { status: 200 },
          ),
        );
      }),
    );
    yield* Effect.gen(function* () {
      const factory = yield* RegistryClientFactory;
      const first = yield* factory.forEndpoint(testRegistryEndpoint);
      const second = yield* factory.forEndpoint(testRegistryEndpoint);
      const args = {
        owner: handle("@acme"),
        type: "skill" as const,
        name: extensionName("shared"),
      };
      yield* factory.withReadPhase(
        Effect.gen(function* () {
          yield* first.getExtensionIndex(args);
          yield* second.getExtensionIndex(args);
          expect(requests).toBe(1);
          // A nested observation is intentionally fresh, then restores its parent.
          yield* factory.withReadPhase(second.getExtensionIndex(args));
          expect(requests).toBe(2);
          yield* first.getExtensionIndex(args);
          expect(requests).toBe(2);
        }),
      );
      yield* factory.withReadPhase(first.getExtensionIndex(args));
      expect(requests).toBe(3);
      // Retaining a client does not retain any phase's observations.
      yield* first.getExtensionIndex(args);
      yield* first.getExtensionIndex(args);
      expect(requests).toBe(5);
      const endedContext = yield* factory.withReadPhase(Effect.context<never>());
      const ended = yield* first
        .getExtensionIndex(args)
        .pipe(Effect.provideContext(endedContext), Effect.flip);
      expect(ended).toMatchObject({ category: "conflict" });
      expect(requests).toBe(5);
      const policy = {
        requestTimeout: "1 second",
        totalDeadline: "2 seconds",
        maxAttempts: 1,
        initialBackoff: "0 millis",
        maxBackoff: "0 millis",
      } as const;
      const bounded = yield* factory.forEndpoint(testRegistryEndpoint, { requestPolicy: policy });
      const samePolicy = yield* factory.forEndpoint(testRegistryEndpoint, {
        requestPolicy: policy,
      });
      yield* factory.withReadPhase(
        Effect.gen(function* () {
          yield* first.getExtensionIndex(args);
          yield* bounded.getExtensionIndex(args);
          yield* samePolicy.getExtensionIndex(args);
          expect(requests).toBe(7);
        }),
      );
      let callerResourceClosed = false;
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* factory.withReadPhase(
            Effect.addFinalizer(() =>
              Effect.sync(() => {
                callerResourceClosed = true;
              }),
            ),
          );
          expect(callerResourceClosed).toBe(false);
        }),
      );
      expect(callerResourceClosed).toBe(true);
    }).pipe(
      Effect.provide(
        Layer.provideMerge(
          RegistryTransportTest(Layer.succeed(HttpClient.HttpClient, http)),
          NodeServices.layer,
        ),
      ),
    );
  }),
);

it.effect.each([1, 2])(
  "interrupts all %i abandoned waiters and retries within the open phase",
  (waiters) =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      let requests = 0;
      const interrupted = yield* Deferred.make<void>();
      const http = HttpClient.make((request) =>
        Effect.gen(function* () {
          requests += 1;
          if (requests === 1) {
            yield* Deferred.succeed(started, undefined);
            return yield* Effect.never.pipe(
              Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
            );
          }
          return HttpClientResponse.fromWeb(
            request,
            new Response(
              JSON.stringify({
                schemaVersion: 2,
                purpose: "select",
                selectionPolicyVersion: "1",
                observedAt,
                results: [{ key: "0", outcome: "metadata", page }],
              }),
              { status: 200 },
            ),
          );
        }),
      );
      yield* Effect.gen(function* () {
        const factory = yield* RegistryClientFactory;
        const client = yield* factory.forEndpoint(testRegistryEndpoint);
        const read = client.getExtensionIndex({
          owner: handle("@acme"),
          type: "skill",
          name: extensionName("shared"),
        });
        yield* factory.withReadPhase(
          Effect.gen(function* () {
            const abandoned = yield* Effect.forEach(Array.from({ length: waiters }), () =>
              Effect.forkChild(read),
            );
            yield* Deferred.await(started);
            for (const [index, fiber] of abandoned.entries()) {
              yield* Fiber.interrupt(fiber);
              if (index < abandoned.length - 1) {
                expect(yield* Deferred.isDone(interrupted)).toBe(false);
                expect(requests).toBe(1);
              }
            }
            yield* Deferred.await(interrupted);
            expect(Option.isSome(yield* read)).toBe(true);
            expect(requests).toBe(2);
          }),
        );
      }).pipe(
        Effect.provide(
          Layer.provideMerge(
            RegistryTransportTest(Layer.succeed(HttpClient.HttpClient, http)),
            NodeServices.layer,
          ),
        ),
      );
    }),
);

it.effect.each(["shared identity", "distinct identities"])(
  "keeps %s alive for a remaining requester",
  (mode) =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let requests = 0;
      let interrupted = false;
      const http = HttpClient.make((request) =>
        Effect.gen(function* () {
          requests += 1;
          yield* Deferred.succeed(started, undefined);
          yield* Deferred.await(release).pipe(
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                interrupted = true;
              }),
            ),
          );
          return HttpClientResponse.fromWeb(
            request,
            new Response(
              JSON.stringify({
                schemaVersion: 2,
                purpose: "select",
                selectionPolicyVersion: "1",
                observedAt,
                results: [
                  { key: "0", outcome: "metadata", page },
                  ...(mode === "distinct identities"
                    ? [{ key: "1", outcome: "metadata", page }]
                    : []),
                ],
              }),
              { status: 200 },
            ),
          );
        }),
      );
      yield* Effect.gen(function* () {
        const factory = yield* RegistryClientFactory;
        const client = yield* factory.forEndpoint(testRegistryEndpoint);
        const read = (name: string) =>
          client.getExtensionIndex({
            owner: handle("@acme"),
            type: "skill",
            name: extensionName(name),
          });
        yield* factory.withReadPhase(
          Effect.gen(function* () {
            const first = yield* Effect.forkChild(read("first"));
            const secondName = mode === "shared identity" ? "first" : "second";
            const second = yield* Effect.forkChild(read(secondName));
            yield* Deferred.await(started);
            yield* Fiber.interrupt(first);
            yield* Deferred.succeed(release, undefined);
            const result = yield* Fiber.join(second);
            expect(Option.map(result, (index) => index.name)).toEqual(
              Option.some(extensionName(secondName)),
            );
            expect(interrupted).toBe(false);
            expect(requests).toBe(1);
          }),
        );
      }).pipe(
        Effect.provide(
          Layer.provideMerge(
            RegistryTransportTest(Layer.succeed(HttpClient.HttpClient, http)),
            NodeServices.layer,
          ),
        ),
      );
    }),
);

it.effect(
  "explicit invalidation waits for active transport cleanup and requires a fresh phase",
  () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      let requests = 0;
      let stopped = false;
      const http = HttpClient.make((request) =>
        Effect.gen(function* () {
          requests++;
          if (requests === 1) {
            yield* Deferred.succeed(started, undefined);
            return yield* Effect.never.pipe(
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  stopped = true;
                }),
              ),
            );
          }
          return HttpClientResponse.fromWeb(
            request,
            Response.json({
              schemaVersion: 2,
              purpose: "select",
              selectionPolicyVersion: "1",
              observedAt,
              results: [{ key: "0", outcome: "metadata", page }],
            }),
          );
        }),
      );
      yield* Effect.gen(function* () {
        const factory = yield* RegistryClientFactory;
        const client = yield* factory.forEndpoint(testRegistryEndpoint);
        const read = client.getExtensionIndex({
          owner: handle("@acme"),
          type: "skill",
          name: extensionName("shared"),
        });
        yield* factory.withReadPhase(
          Effect.gen(function* () {
            const active = yield* Effect.forkChild(read);
            yield* Deferred.await(started);
            yield* factory.invalidateReadPhase;
            expect(stopped).toBe(true);
            expect(Exit.hasInterrupts(yield* Fiber.await(active))).toBe(true);
            expect(yield* read.pipe(Effect.flip)).toMatchObject({ category: "conflict" });
            expect(Option.isSome(yield* factory.withReadPhase(read))).toBe(true);
            expect(requests).toBe(2);
          }),
        );
      }).pipe(
        Effect.provide(
          Layer.provideMerge(
            RegistryTransportTest(Layer.succeed(HttpClient.HttpClient, http)),
            NodeServices.layer,
          ),
        ),
      );
    }),
);

it.effect("known sets and individual reads share the same phase cache", () =>
  Effect.gen(function* () {
    const sizes: number[] = [];
    const http = HttpClient.make((request) =>
      Effect.sync(() => {
        if (request.body._tag !== "Uint8Array") throw new Error("Expected selection body");
        const body = Schema.decodeUnknownSync(
          Schema.fromJsonString(ResolutionMetadataRequestSchema),
        )(new TextDecoder().decode(request.body.body));
        sizes.push(body.items.length);
        return HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify({
              schemaVersion: 2,
              purpose: "select",
              selectionPolicyVersion: "1",
              observedAt,
              results: body.items.map(({ key }) => ({ key, outcome: "metadata", page })),
            }),
            { status: 200 },
          ),
        );
      }),
    );
    yield* Effect.gen(function* () {
      const factory = yield* RegistryClientFactory;
      const client = yield* factory.forEndpoint(testRegistryEndpoint);
      const first = {
        owner: handle("@acme"),
        type: "skill" as const,
        name: extensionName("first"),
      };
      const second = { ...first, name: extensionName("second") };
      yield* factory.withReadPhase(
        Effect.gen(function* () {
          const results = yield* client.selectMany([first, second, first]);
          expect(
            results.map((result) =>
              Result.map(result, (index) => Option.map(index, (value) => value.name)),
            ),
          ).toEqual([
            Result.succeed(Option.some(first.name)),
            Result.succeed(Option.some(second.name)),
            Result.succeed(Option.some(first.name)),
          ]);
          expect(yield* client.getExtensionIndex(first)).toMatchObject({ _tag: "Some" });
          expect(sizes).toEqual([2]);
        }),
      );
      yield* client.selectMany([first]);
      expect(sizes).toEqual([2, 1]);
    }).pipe(
      Effect.provide(
        Layer.provideMerge(
          RegistryTransportTest(Layer.succeed(HttpClient.HttpClient, http)),
          NodeServices.layer,
        ),
      ),
    );
  }),
);

it.effect(
  "keeps the same identity at separate Registry endpoints in separate batches and cache entries",
  () =>
    Effect.gen(function* () {
      const endpoints = [
        testRegistryEndpoint,
        decodeRegistryEndpointSync("https://second.example.test"),
      ];
      const origins: string[] = [];
      const http = HttpClient.make((request) =>
        Effect.sync(() => {
          const origin = new URL(request.url).origin;
          origins.push(origin);
          if (request.body._tag !== "Uint8Array") throw new Error("Expected selection request");
          const input = Schema.decodeUnknownSync(
            Schema.fromJsonString(ResolutionMetadataRequestSchema),
          )(new TextDecoder().decode(request.body.body));
          expect(input.items).toHaveLength(1);
          return HttpClientResponse.fromWeb(
            request,
            Response.json({
              schemaVersion: 2,
              purpose: "select",
              selectionPolicyVersion: "1",
              observedAt,
              results: input.items.map(({ key }) => ({
                key,
                outcome: "metadata",
                page: {
                  ...page,
                  publisherBindingId: origin,
                },
              })),
            }),
          );
        }),
      );
      yield* Effect.gen(function* () {
        const factory = yield* RegistryClientFactory;
        const clients = yield* Effect.forEach(endpoints, (endpoint) =>
          factory.forEndpoint(endpoint),
        );
        const readBoth = Effect.forEach(
          clients,
          (client) =>
            client.getExtensionIndex({
              owner: handle("@acme"),
              type: "skill",
              name: extensionName("shared"),
            }),
          { concurrency: clients.length },
        );
        yield* factory.withReadPhase(
          Effect.gen(function* () {
            const first = yield* readBoth;
            const repeated = yield* readBoth;
            expect(
              first.map((value) => Option.map(value, (index) => index.publisherBindingId)),
            ).toEqual(endpoints.map((endpoint) => Option.some(new URL(endpoint.href).origin)));
            expect(repeated).toEqual(first);
            expect(origins.sort()).toEqual(
              endpoints.map((endpoint) => new URL(endpoint.href).origin).sort(),
            );
          }),
        );
      }).pipe(
        Effect.provide(
          Layer.provideMerge(
            RegistryTransportTest(Layer.succeed(HttpClient.HttpClient, http)),
            NodeServices.layer,
          ),
        ),
      );
    }),
);
