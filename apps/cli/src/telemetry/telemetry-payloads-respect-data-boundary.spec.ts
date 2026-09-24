import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { recordCommandSettlement } from "../cli-runtime/telemetry.js";
import {
  captureTelemetry,
  makeTelemetryOperation,
  sensitiveSentinels,
} from "../test-support/telemetry-harness.js";
import {
  TelemetryClient,
  TelemetryClientLive,
  TelemetryErrorsRequest,
  TelemetryEventsRequest,
} from "./index.js";

export const specification = defineSpecification({
  requirement: "system/security/telemetry-payloads-respect-data-boundary",
  title: "Telemetry excludes extension content and secrets",
  statement:
    "Every telemetry event and error report AXM sends shall conform to AgentXM Telemetry Ingest API 0.2.0 and contain only identity, timing, and command-observation data, excluding extension content, authored instructions and knowledge, credentials, and resolved secret values.",
  class: "quality",
  characteristic: "privacy",
  role: "interface",
  goals: ["privacy-and-consent"],
  methods: ["contract", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/**
 * Decodes a captured payload the way the telemetry ingest contract does: a
 * field the contract does not declare is an error at every level the
 * contract closes.
 */
const decodeEventsRequest = (input: unknown) =>
  Schema.decodeUnknownEffect(TelemetryEventsRequest)(input, { onExcessProperty: "error" });
const decodeErrorsRequest = (input: unknown) =>
  Schema.decodeUnknownEffect(TelemetryErrorsRequest)(input, { onExcessProperty: "error" });

interface CapturedRequest {
  readonly url: string;
  readonly body: unknown;
}

const captureClient = () => {
  const captured: Array<CapturedRequest> = [];
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      const bodyText =
        request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "";
      captured.push({
        url: request.url,
        body: bodyText.length > 0 ? JSON.parse(bodyText) : undefined,
      });
      return HttpClientResponse.fromWeb(request, new Response("", { status: 202 }));
    }),
  );
  return { client, captured };
};

const telemetryOver = (client: HttpClient.HttpClient) =>
  TelemetryClient.pipe(
    Effect.provide(
      Layer.provide(
        TelemetryClientLive({
          mode: "all",
          command: "install",
          client: { name: "cli", version: "1.2.3" },
          installationId: "00000000-0000-4000-8000-000000000001",
          eventIdFactory: () => "00000000-0000-4000-8000-000000000002",
          // The repository's own test run suppresses delivery; this
          // specification observes what is delivered, so it asks explicitly.
          deliverInTest: true,
        }),
        Layer.mergeAll(NodeServices.layer, Layer.succeed(HttpClient.HttpClient, client)),
      ),
    ),
  );

const onlyCapturedBody = (captured: ReadonlyArray<CapturedRequest>): unknown => {
  expect(captured).toHaveLength(1);
  const body = captured[0]?.body;
  expect(body).toBeDefined();
  return body;
};

describe("Telemetry data boundary", () => {
  it.effect("usage events carry only the fields the published telemetry contract declares", () =>
    Effect.gen(function* () {
      const { client, captured } = captureClient();
      const telemetry = yield* telemetryOver(client);

      yield* telemetry.trackEvent("command:start", { "cli.duration_ms": 12 }, { bounded: true });

      const request = yield* decodeEventsRequest(onlyCapturedBody(captured));
      expect(request.events.map((event) => event.event)).toEqual(["command:start"]);
    }),
  );

  it.effect("error reports carry only the fields the published telemetry contract declares", () =>
    Effect.gen(function* () {
      const { client, captured } = captureClient();
      const telemetry = yield* telemetryOver(client);

      yield* telemetry.reportError({
        name: "ERR",
        level: "error",
        errorClass: "user",
        handled: true,
        command: "install",
      });

      const request = yield* decodeErrorsRequest(onlyCapturedBody(captured));
      expect(request.errors.map((error) => error.name)).toEqual(["ERR"]);
      expect(request.context.command).toBe("install");
    }),
  );

  it.effect(
    "actual install events exclude argument values and package content at every payload depth",
    () =>
      Effect.gen(function* () {
        const operation = makeTelemetryOperation();
        const captured = captureTelemetry();
        yield* Effect.acquireUseRelease(
          Effect.succeed(operation),
          (operation) =>
            Effect.gen(function* () {
              const result = yield* operation.run({ client: captured.client });
              expect(result.exit._tag).toBe("Success");
              expect(captured.requests.length).toBeGreaterThanOrEqual(3);
              const payloads = JSON.stringify(captured.requests);
              for (const secret of sensitiveSentinels) expect(payloads).not.toContain(secret);
              for (const request of captured.requests) {
                const decoded = yield* decodeEventsRequest(request.body);
                for (const event of decoded.events) {
                  expect([
                    "command_invoked",
                    "product_activity_started",
                    "product_activity_finished",
                  ]).toContain(event.event);
                }
              }
              expect(payloads).toContain("cli.arg.source");
              expect(payloads).toContain("<redacted>");
              expect(payloads).toContain("cli.applied_count");
            }),
          (operation) => Effect.sync(operation.cleanup),
        );
      }),
  );

  it.effect(
    "handled errors and defects report only their category, never content or credentials",
    () =>
      Effect.gen(function* () {
        const { client, captured } = captureClient();
        const telemetry = yield* telemetryOver(client);
        const content = sensitiveSentinels.join(" ");
        // The settlement reporter takes the failure's category only: the
        // detail, the response body, and the defect message never reach it.
        yield* recordCommandSettlement({
          command: "install",
          result: "error",
          durationMs: 5,
          failure: { code: "validation", level: "error", handled: true },
          semanticProperties: { "cli.outcome": "failed" },
        }).pipe(Effect.provideService(TelemetryClient, telemetry));
        yield* recordCommandSettlement({
          command: "install",
          result: "defect",
          durationMs: 5,
          failure: { code: "internal", level: "fatal", handled: false },
        }).pipe(Effect.provideService(TelemetryClient, telemetry));
        expect(JSON.stringify(captured)).not.toContain(content);
        for (const secret of sensitiveSentinels)
          expect(JSON.stringify(captured)).not.toContain(secret);
        const errorRequests = captured.filter((request) => request.url.endsWith("/v1/errors"));
        const eventRequests = captured.filter((request) => request.url.endsWith("/v1/events"));
        expect(errorRequests).toHaveLength(2);
        expect(eventRequests).toHaveLength(2);
        const errors = [];
        for (const request of errorRequests) {
          const decoded = yield* decodeErrorsRequest(request.body);
          errors.push(...decoded.errors);
          expect(decoded.context.command).toBe("install");
        }
        expect(errors.map((error) => error.name)).toEqual(["validation", "Defect"]);
        for (const request of eventRequests) {
          const decoded = yield* decodeEventsRequest(request.body);
          expect(decoded.events.map((event) => event.event)).toEqual(["command_completed"]);
        }
      }),
  );
});
