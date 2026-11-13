import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Tracer from "effect/Tracer";
import { rootCommand, runCommand } from "../app.js";
import { makeCommandTraceIdentity } from "../command-tracing.js";
import { baseLayer } from "../runtime.js";
import { TelemetryClientTest } from "../telemetry/index.js";
import { COMMAND_ROUTE_ALLOCATION } from "../test-support/command-routes.js";
import { TestRenderer } from "../test-support/presenter-test.js";
import { TraceInvocation, type InvocationTraceAttributes } from "./trace-invocation.js";
import { withLocalTracing } from "./index.js";
import { localTracingCollector } from "../test-support/local-tracing-collector.js";

export const specification = defineSpecification({
  requirement: "cli/local-tracing-identifies-commands",
  title: "Local traces identify the dispatched command without its private operands",
  statement:
    "An explicitly traced invocation shall identify the parser-validated command route, execution mode, and semantic outcome using the registered command vocabulary, including built-in and failing dispatch paths, without recording private operands.",
  class: "functional",
  role: "interface",
  goals: ["actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "The production parser and dispatcher traverse the real command tree with production runtime services and a recording Screen; the tracer records emitted command facts without asserting OTLP delivery.",
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const identity = makeCommandTraceIdentity(rootCommand);

describe("Command trace identity", () => {
  it("admits exactly the independent registered-route inventory and the unresolved fallback", () => {
    expect([...identity.routes].sort()).toEqual(
      [
        ...COMMAND_ROUTE_ALLOCATION.map(({ path }) => path.join(" ") || "root"),
        "unresolved",
      ].sort(),
    );
    expect(identity.resolve(["private-unregistered-route"], [])["axm.command.route"]).toBe(
      "unresolved",
    );
  });

  it.effect(
    "records each real route through help dispatch, including direct and group routes",
    () =>
      Effect.forEach(
        COMMAND_ROUTE_ALLOCATION,
        ({ path }) =>
          Effect.gen(function* () {
            const attributes: InvocationTraceAttributes[] = [];
            const spans: Tracer.NativeSpan[] = [];
            const renderer = TestRenderer.make();
            yield* runCommand([...path, "--help"], false).pipe(
              Effect.exit,
              Effect.provide(Layer.mergeAll(baseLayer, renderer.layer, TelemetryClientTest)),
              Effect.provideService(TraceInvocation, (value) => attributes.push(value)),
              Effect.withTracer(
                Tracer.make({
                  span(options) {
                    const span = new Tracer.NativeSpan(options);
                    spans.push(span);
                    return span;
                  },
                }),
              ),
            );
            const command = spans.find((span) => span.name === "axm.cli.command");
            expect(command?.attributes.get("axm.command.route"), path.join(" ")).toBe(
              path.join(" ") || "root",
            );
            expect(command?.attributes.get("axm.operation.mode")).toBe("query");
            expect(command?.attributes.get("axm.outcome")).toBe("success");
            expect(attributes).toContainEqual(
              expect.objectContaining({ "axm.command.route": path.join(" ") || "root" }),
            );
          }),
        { concurrency: 4 },
      ),
  );

  it.each([
    { path: ["lint"], argv: ["lint"], mode: "query" },
    { path: ["lint"], argv: ["lint", "--fix"], mode: "apply" },
    { path: ["lint"], argv: ["lint", "--fix=false"], mode: "query" },
    { path: ["install"], argv: ["install", "--preview"], mode: "preview" },
    { path: ["install"], argv: ["install", "--preview=false"], mode: "apply" },
    { path: ["token", "show"], argv: ["token", "show"], mode: "query" },
    { path: ["show"], argv: ["show", "--all"], mode: "query" },
    { path: ["schema"], argv: ["schema", "publish"], mode: "query" },
    { path: [], argv: ["--version"], mode: "query" },
  ])("uses declared capabilities for $argv", ({ path, argv, mode }) => {
    expect(identity.resolve(path, argv)["axm.operation.mode"]).toBe(mode);
  });

  it.effect("keeps operands and unknown command words out of failed-dispatch identity", () =>
    Effect.forEach(
      [
        { argv: ["private-unregistered-route", "--help"], route: "root" },
        {
          argv: ["install", "private-extension-token", "--private-unknown-flag"],
          route: "install",
        },
      ],
      ({ argv, route }) =>
        Effect.gen(function* () {
          const attributes: InvocationTraceAttributes[] = [];
          const renderer = TestRenderer.make();
          yield* runCommand(argv, false).pipe(
            Effect.exit,
            Effect.provide(Layer.mergeAll(baseLayer, renderer.layer, TelemetryClientTest)),
            Effect.provideService(TraceInvocation, (value) => attributes.push(value)),
          );
          expect(attributes).toContainEqual(
            expect.objectContaining({ "axm.command.route": route }),
          );
          expect(attributes).toContainEqual(expect.objectContaining({ "axm.outcome": "failure" }));
          expect(JSON.stringify(attributes)).not.toContain("private");
        }),
    ),
  );

  it.live("exports real direct-route identity on both the command and invocation", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const receiver = yield* localTracingCollector();
        const renderer = TestRenderer.make();
        yield* withLocalTracing(
          runCommand(["token", "show", "--private-secret-flag"], false).pipe(
            Effect.exit,
            Effect.provide(Layer.mergeAll(baseLayer, renderer.layer, TelemetryClientTest)),
          ),
          { AXM_TRACE: "1", AXM_TRACE_ENDPOINT: receiver.endpoint },
          { commandRoutes: identity.routes },
        );
        for (const name of ["axm.cli.command", "axm.cli.invocation"]) {
          const span = receiver.spans().find((value) => value.name === name);
          expect(span?.attributes).toContainEqual({
            key: "axm.command.route",
            value: { stringValue: "token show" },
          });
          expect(span?.attributes).toContainEqual({
            key: "axm.operation.mode",
            value: { stringValue: "query" },
          });
          expect(span?.attributes).toContainEqual({
            key: "axm.outcome",
            value: { stringValue: "failure" },
          });
        }
        expect(JSON.stringify(receiver.spans())).not.toContain("private-secret");
      }),
    ),
  );
});
