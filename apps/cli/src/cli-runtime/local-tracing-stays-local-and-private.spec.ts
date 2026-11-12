import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Exit from "effect/Exit";
import * as Tracer from "effect/Tracer";
import * as HttpClient from "effect/http/HttpClient";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import { defineSpecification } from "@agentxm/specification-metadata";
import { localTraceEndpoint, withLocalTracing } from "./index.js";
import { localTracingCollector } from "../test-support/local-tracing-collector.js";

class PrivateFailure extends Data.TaggedError("PrivateFailure")<{ message: string }> {}

export const specification = defineSpecification({
  requirement: "cli/local-tracing-stays-local-and-private",
  title: "Local tracing requires explicit activation and excludes private inputs",
  statement:
    "Diagnostic tracing shall create an exporter only after explicit process-level activation, send only to a local endpoint independently of product telemetry, and exclude secrets, content, raw arguments, sensitive paths, and automatic error details from exported data.",
  class: "quality",
  characteristic: "security",
  role: "interface",
  goals: ["privacy-and-consent"],
  boundary: "platform",
  boundaryRationale:
    "The actual exporter is observed at a real loopback HTTP receiver, including rejected and redirected endpoints.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Private local tracing", () => {
  it.live(
    "keeps real HTTP work but omits automatic URLs and headers without tracing its own exporter",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const receiver = yield* localTracingCollector();
          const secret = "PRIVATE-http-token";
          const request = HttpClient.get(`${receiver.endpoint}?token=${secret}`, {
            headers: { authorization: `Bearer ${secret}` },
          }).pipe(
            Effect.flatMap((response) => response.text),
            Effect.provide(NodeHttpClient.layerNodeHttpOptions({ proxyEnv: {} })),
          );
          yield* withLocalTracing(request, {
            AXM_TRACE: "1",
            AXM_TRACE_ENDPOINT: receiver.endpoint,
          });
          const requests = receiver.spans().filter((span) => span.name === "axm.http.request");
          expect(requests).toHaveLength(1);
          expect(requests[0]?.attributes).toContainEqual({
            key: "http.request.method",
            value: { stringValue: "GET" },
          });
          expect(receiver.bodies.join("")).not.toContain(secret);
          expect(receiver.bodies.join("")).not.toContain(receiver.endpoint);
        }),
      ),
  );

  it.live("leaves the tracer untouched and sends nothing without explicit activation", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const receiver = yield* localTracingCollector();
        const original = yield* Tracer.Tracer;
        const current = yield* withLocalTracing(Tracer.Tracer, {
          AXM_TRACE_ENDPOINT: receiver.endpoint,
          OTEL_EXPORTER_OTLP_ENDPOINT: receiver.endpoint,
          OTEL_TRACES_EXPORTER: "otlp",
          AXM_TELEMETRY: "on",
        });
        expect(current).toBe(original);
        expect(receiver.bodies).toEqual([]);
      }),
    ),
  );

  it("accepts only literal loopback collectors without URL credentials or query data", () => {
    expect(localTraceEndpoint({ AXM_TRACE: "true" })).toBe(
      "http://127.0.0.1:5341/ingest/otlp/v1/traces",
    );
    expect(localTraceEndpoint({ AXM_TRACE: "false" })).toBeUndefined();
    expect(localTraceEndpoint({ AXM_TRACE: "TRUE" })).toBeUndefined();
    for (const endpoint of [
      "https://example.com/v1/traces",
      "http://127.0.0.1.example.com/v1/traces",
      "file:///tmp/traces",
      "http://user:secret@127.0.0.1/v1/traces",
      "http://127.0.0.1/v1/traces?token=secret",
      "http://127.0.0.1/v1/traces#secret",
      "invalid",
    ])
      expect(localTraceEndpoint({ AXM_TRACE: "1", AXM_TRACE_ENDPOINT: endpoint })).toBeUndefined();
    expect(
      localTraceEndpoint({ AXM_TRACE: "1", AXM_TRACE_ENDPOINT: "http://localhost:4318/v1/traces" }),
    ).toBe("http://127.0.0.1:4318/v1/traces");
    expect(
      localTraceEndpoint({ AXM_TRACE: "1", AXM_TRACE_ENDPOINT: "http://[::1]:4318/v1/traces" }),
    ).toBe("http://[::1]:4318/v1/traces");
  });

  it.live(
    "exports bounded failure state without attributes, events, names, or exception contents supplied by callers",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const receiver = yield* localTracingCollector();
          const secret = "PRIVATE-token-and-/workspace/path";
          const program = Effect.gen(function* () {
            // A later failure must override an earlier provisional success.
            yield* Effect.annotateCurrentSpan("axm.outcome", "success");
            yield* Effect.annotateCurrentSpan({ "unsafe.path": secret, "axm.work.count": secret });
            const span = yield* Effect.currentSpan;
            span.event(secret, 0n, { contents: secret });
            return yield* new PrivateFailure({ message: secret });
          }).pipe(Effect.withSpan("axm.archive.admit"), Effect.withSpan(secret));
          const result = yield* Effect.exit(
            withLocalTracing(program, {
              AXM_TRACE: "1",
              AXM_TRACE_ENDPOINT: receiver.endpoint,
              AXM_TELEMETRY: "off",
              AXM_TRACE_API_KEY: secret,
              OTEL_RESOURCE_ATTRIBUTES: `private=${secret}`,
            }).pipe(
              Effect.provideService(
                ConfigProvider.ConfigProvider,
                ConfigProvider.fromUnknown({ OTEL_RESOURCE_ATTRIBUTES: `private=${secret}` }),
              ),
            ),
          );
          expect(Exit.isFailure(result)).toBe(true);
          expect(receiver.headers[0]?.["x-seq-apikey"]).toBe(secret);
          expect(
            receiver.spans().find((span) => span.name === "axm.archive.admit")?.status.code,
          ).toBe(2);
          expect(receiver.bodies.length).toBeGreaterThan(0);
          expect(receiver.headers[0]?.["content-type"]).toBe("application/x-protobuf");
          expect(receiver.bodies.join("")).not.toContain(secret);
          expect(
            receiver.spans().every((span) => span.events.length === 0 && span.links.length === 0),
          ).toBe(true);
          expect(
            receiver.spans().find((span) => span.name === "axm.archive.admit")?.attributes,
          ).toContainEqual({ key: "axm.outcome", value: { stringValue: "failure" } });
        }),
      ),
  );

  it.live("does not follow a collector redirect", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const destination = yield* localTracingCollector();
        const receiver = yield* localTracingCollector("redirect", destination.endpoint);
        expect(
          yield* withLocalTracing(Effect.succeed(42), {
            AXM_TRACE: "1",
            AXM_TRACE_ENDPOINT: receiver.endpoint,
          }),
        ).toBe(42);
        expect(receiver.bodies.length).toBeGreaterThan(0);
        expect(destination.bodies).toEqual([]);
      }),
    ),
  );
});
