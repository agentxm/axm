import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { AuthClient } from "./auth-client.js";
import { authClientOver } from "./test-support/test-helpers.js";
import { recordTrace } from "../test-support/test-helpers.js";

const endpoint = decodeHttpRegistryEndpointSync("https://registry.example.test");
const token = {
  access_token: "PRIVATE_ACCESS",
  refresh_token: "PRIVATE_REFRESH",
  token_type: "Bearer",
  expires_in: 3600,
  expires_at: "2030-01-01T01:00:00.000Z",
};

for (const outcome of ["success", "failure", "interrupt"] as const) {
  it.effect(`keeps the auth request open through response-body ${outcome}`, () =>
    Effect.gen(function* () {
      const trace = recordTrace();
      const reading = yield* Deferred.make<ReadableStreamDefaultController<Uint8Array>>();
      const calls: Array<string> = [];
      const client = HttpClient.make((request) =>
        Effect.sync(() => {
          calls.push(request.url);
          return HttpClientResponse.fromWeb(
            request,
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  Deferred.doneUnsafe(reading, Effect.succeed(controller));
                },
              }),
              { headers: { "content-type": "application/json" } },
            ),
          );
        }),
      );
      const fiber = yield* Effect.flatMap(AuthClient, (auth) =>
        auth.exchangePkceCode(endpoint, {
          code: "PRIVATE_CODE",
          verifier: "PRIVATE_VERIFIER",
          redirectUri: "http://127.0.0.1/callback",
        }),
      ).pipe(
        Effect.provide(authClientOver(client)),
        Effect.withTracer(trace.tracer),
        Effect.withTracerEnabled(true),
        Effect.forkChild,
      );
      const controller = yield* Deferred.await(reading);
      const request = trace.spans.find((span) => span.name === "axm.auth.request");
      expect(request?.status._tag).toBe("Started");
      expect(calls).toHaveLength(1);
      if (outcome === "interrupt") yield* Fiber.interrupt(fiber);
      else {
        yield* Effect.sync(() => {
          if (outcome === "failure") controller.error(new Error("PRIVATE_BODY_ERROR"));
          else {
            controller.enqueue(new TextEncoder().encode(JSON.stringify(token)));
            controller.close();
          }
        });
        const result = yield* Fiber.await(fiber);
        expect(Exit.isSuccess(result)).toBe(outcome === "success");
      }
      expect(request?.status._tag).toBe("Ended");
      expect(request === undefined ? 0 : trace.endCounts.get(request.spanId)).toBe(1);
      expect(request?.attributes.get("axm.auth.purpose")).toBe("pkce-exchange");
      expect(
        JSON.stringify(trace.spans.map((span) => Object.fromEntries(span.attributes))),
      ).not.toContain("PRIVATE");
    }),
  );
}

it.effect("closes an interrupted device retry wait once without another HTTP attempt", () =>
  Effect.gen(function* () {
    const waiting = yield* Deferred.make<void>();
    const trace = recordTrace((span) => {
      if (span.name === "axm.auth.retry-wait") Deferred.doneUnsafe(waiting, Effect.void);
    });
    let calls = 0;
    const client = HttpClient.make((request) =>
      Effect.sync(() => {
        calls += 1;
        return HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify({
              type: "https://registry.agentxm.ai/v1/problems/internal_error",
              title: "Internal",
              status: 500,
              detail: "Unavailable",
              code: "internal_error",
            }),
            { status: 500, headers: { "content-type": "application/problem+json" } },
          ),
        );
      }),
    );
    const fiber = yield* Effect.flatMap(AuthClient, (auth) =>
      auth.pollDeviceToken(endpoint, "PRIVATE_DEVICE", 0),
    ).pipe(
      Effect.provide(authClientOver(client)),
      Effect.withTracer(trace.tracer),
      Effect.withTracerEnabled(true),
      Effect.forkChild,
    );
    yield* Deferred.await(waiting);
    yield* Fiber.interrupt(fiber);
    expect(calls).toBe(1);
    const waits = trace.spans.filter((span) => span.name === "axm.auth.retry-wait");
    expect(waits).toHaveLength(1);
    expect(waits.map((span) => trace.endCounts.get(span.spanId))).toEqual([1]);
    expect(
      waits.map((span) => span.status._tag === "Ended" && Exit.hasInterrupts(span.status.exit)),
    ).toEqual([true]);
  }),
);
