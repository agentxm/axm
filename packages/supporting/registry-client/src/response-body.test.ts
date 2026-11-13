import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Result from "effect/Result";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { MAX_RESOLUTION_RESPONSE_BYTES } from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import { OperationRequestBudget, makeOperationRequestBudget } from "@agentxm/host-primitives";
import { captureRegistryErrorResponseBodies } from "./response-body.js";
import { executeRegistryRequest } from "./request-policy.js";
import { RegistryRequestFailed } from "./errors.js";

const url = "https://registry.example.test/v1/resolutions";

it.effect("accepts the exact resolution byte limit before decoding JSON", () =>
  Effect.gen(function* () {
    const value = "a".repeat(MAX_RESOLUTION_RESPONSE_BYTES - 2);
    const client = captureRegistryErrorResponseBodies(
      HttpClient.make((request) =>
        Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(value))),
      ),
    );
    const response = yield* client.post(url);
    expect(yield* response.json).toBe(value);
  }),
);

for (const status of [200, 503]) {
  it.effect(`cancels an oversized ${status} resolution body before retaining or decoding it`, () =>
    Effect.gen(function* () {
      let pulls = 0;
      let cancelled = false;
      const client = captureRegistryErrorResponseBodies(
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(
                new ReadableStream(
                  {
                    pull(controller) {
                      pulls++;
                      controller.enqueue(new Uint8Array(MAX_RESOLUTION_RESPONSE_BYTES / 2));
                    },
                    cancel() {
                      cancelled = true;
                    },
                  },
                  { highWaterMark: 0 },
                ),
                { status },
              ),
            ),
          ),
        ),
      );
      const result = yield* Effect.result(client.post(url));
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result))
        expect(result.failure.reason).toMatchObject({
          _tag: "DecodeError",
          description: "Registry resolution response exceeds the encoded body limit",
        });
      expect(pulls).toBe(3);
      expect(cancelled).toBe(true);
    }),
  );
}

it.effect("does not impose the resolution limit on archive downloads", () =>
  Effect.gen(function* () {
    const client = captureRegistryErrorResponseBodies(
      HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(new Uint8Array(MAX_RESOLUTION_RESPONSE_BYTES + 1)),
          ),
        ),
      ),
    );
    const response = yield* client.get("https://registry.example.test/archive.zip");
    expect((yield* response.arrayBuffer).byteLength).toBe(MAX_RESOLUTION_RESPONSE_BYTES + 1);
  }),
);

it.effect(
  "keeps the request permit through a slow stream and cancels it at the attempt deadline",
  () =>
    Effect.gen(function* () {
      const budget = yield* makeOperationRequestBudget({ invocation: 1, origin: 1 });
      const firstHeaders = yield* Deferred.make<void>();
      let requests = 0;
      let bodyPulls = 0;
      let cancelled = false;
      const client = captureRegistryErrorResponseBodies(
        HttpClient.make((request) =>
          Effect.gen(function* () {
            requests++;
            if (requests > 1)
              return HttpClientResponse.fromWeb(request, Response.json({ ok: true }));
            yield* Deferred.succeed(firstHeaders, undefined);
            return HttpClientResponse.fromWeb(
              request,
              new Response(
                new ReadableStream(
                  {
                    pull() {
                      bodyPulls++;
                    },
                    cancel() {
                      cancelled = true;
                    },
                  },
                  { highWaterMark: 0 },
                ),
              ),
            );
          }),
        ),
      );
      const read = executeRegistryRequest(
        client.post(url).pipe(Effect.flatMap((response) => response.json)),
        {
          operation: "bounded resolution read",
          request: { service: "registry", method: "POST", url },
          replaySafety: { kind: "safe" },
          policy: {
            requestTimeout: "1 second",
            totalDeadline: "5 seconds",
            maxAttempts: 1,
            initialBackoff: "0 millis",
            maxBackoff: "0 millis",
          },
          mapError: (cause) =>
            new RegistryRequestFailed({
              category: "internal",
              detail: "Resolution read failed",
              cause,
            }),
        },
      ).pipe(Effect.provideService(OperationRequestBudget, budget));
      const first = yield* Effect.result(read).pipe(Effect.forkChild);
      yield* Deferred.await(firstHeaders);
      const second = yield* read.pipe(Effect.forkChild);
      yield* TestClock.adjust("500 millis");
      expect(requests).toBe(1);
      expect(bodyPulls).toBe(1);
      expect(cancelled).toBe(false);
      yield* TestClock.adjust("500 millis");
      expect(Result.isFailure(yield* Fiber.join(first))).toBe(true);
      expect(yield* Fiber.join(second)).toEqual({ ok: true });
      expect(requests).toBe(2);
      expect(cancelled).toBe(true);
    }),
);
