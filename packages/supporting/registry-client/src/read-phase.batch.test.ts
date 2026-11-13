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

it.effect("interrupts an abandoned request and retries it while the phase remains open", () =>
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
          const abandoned = yield* Effect.forkChild(read);
          yield* Deferred.await(started);
          yield* Fiber.interrupt(abandoned);
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

it.effect("keeps a running batch alive for a remaining requester", () =>
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
                { key: "1", outcome: "metadata", page },
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
          const second = yield* Effect.forkChild(read("second"));
          yield* Deferred.await(started);
          yield* Fiber.interrupt(first);
          yield* Deferred.succeed(release, undefined);
          const result = yield* Fiber.join(second);
          expect(Option.map(result, (index) => index.name)).toEqual(
            Option.some(extensionName("second")),
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
