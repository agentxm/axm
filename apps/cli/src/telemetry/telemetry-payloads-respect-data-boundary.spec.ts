import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { type AppError, makeAppError } from "../app-error/index.js";
import { withCliErrorHandling } from "../cli-runtime/index.js";
import { TestFlagsLayer } from "../cli-flags/index.js";
import { makeRecordingStreams, machineScreenLayer } from "../test-support/screen-harness.js";
import {
  captureTelemetry,
  makeTelemetryOperation,
  sensitiveSentinels,
  telemetryReporterLayer,
} from "../test-support/telemetry-harness.js";
import {
  TelemetryClient,
  type TelemetryClientOptions,
  TelemetryErrorReport,
  TelemetryEventsRequest,
} from "./index.js";

export const specification = defineSpecification({
  requirement: "system/security/telemetry-payloads-respect-data-boundary",
  title: "Telemetry excludes extension content and secrets",
  statement:
    "Every telemetry event and error report AXM sends shall conform to AgentXM Telemetry Ingest API 0.3.0 and contain only identity, correlation, timing, client, command-observation, and allowlisted failure-identity data, excluding extension content, authored instructions and knowledge, credentials, and resolved secret values.",
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
const decodeErrorReport = (input: unknown) =>
  Schema.decodeUnknownEffect(TelemetryErrorReport)(input, { onExcessProperty: "error" });

const INSTALLATION_ID = "00000000-0000-4000-8000-000000000001";
const EVENT_ID = "00000000-0000-4000-8000-000000000002";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const reporterOptions: TelemetryClientOptions = {
  mode: "all",
  client: { name: "cli", version: "1.2.3" },
  installationId: INSTALLATION_ID,
  eventIdFactory: () => EVENT_ID,
  // The repository's own test run suppresses delivery; this specification
  // observes what is delivered, so it asks explicitly.
  deliverInTest: true,
};

const reporterOver = (client: HttpClient.HttpClient) =>
  telemetryReporterLayer({ client, reporter: reporterOptions });

const isErrorReport = (request: { readonly url: string }) => request.url.endsWith("/v1/errors");
const isEventBatch = (request: { readonly url: string }) => request.url.endsWith("/v1/events");

/** Every captured payload, at every depth, is free of the sensitive sentinels. */
const expectNoSentinel = (captured: unknown) => {
  const serialized = JSON.stringify(captured);
  for (const secret of sensitiveSentinels) expect(serialized).not.toContain(secret);
};

describe("Telemetry data boundary", () => {
  it.effect("usage events carry only the fields the published telemetry contract declares", () =>
    Effect.gen(function* () {
      const capture = captureTelemetry();
      const invocationId = yield* TelemetryClient.use((telemetry) =>
        telemetry
          .trackEvent("command:start", { "cli.duration_ms": 12 })
          .pipe(Effect.as(telemetry.invocationId)),
      ).pipe(Effect.provide(reporterOver(capture.client)));

      expect(capture.requests).toHaveLength(1);
      const request = yield* decodeEventsRequest(capture.requests[0]?.body);
      expect(request.events.map((event) => event.event)).toEqual(["command:start"]);
      expect(request.context.invocationId).toBe(invocationId);
    }),
  );

  it.effect("error reports carry only the fields the published telemetry contract declares", () =>
    Effect.gen(function* () {
      const capture = captureTelemetry();
      const invocationId = yield* TelemetryClient.use((telemetry) =>
        telemetry
          .reportError({
            phase: "command",
            kind: "not_found",
            category: "not_found",
            errorClass: "user",
            handled: true,
            command: "install",
          })
          .pipe(Effect.as(telemetry.invocationId)),
      ).pipe(Effect.provide(reporterOver(capture.client)));

      expect(capture.requests.filter(isErrorReport)).toHaveLength(1);
      const report = yield* decodeErrorReport(capture.requests[0]?.body);
      expect(report.eventId).toBe(EVENT_ID);
      expect(report.invocationId).toBe(invocationId);
      expect(report.invocationId).toMatch(UUID_PATTERN);
      expect(report.installationId).toBe(INSTALLATION_ID);
      expect(report.command).toBe("install");
      expect(report.phase).toBe("command");
      expect(report.failure).toEqual({
        kind: "not_found",
        category: "not_found",
        class: "user",
        handled: true,
      });
      expect(report.client).toEqual({
        name: "cli",
        version: "1.2.3",
        runtime: process.versions["bun"] === undefined ? "node" : "bun",
        runtimeVersion: process.versions["bun"] ?? process.versions.node,
        platform: process.platform,
        architecture: process.arch,
        ci: report.client.ci,
      });
      expect(typeof report.client.ci).toBe("boolean");
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
              expectNoSentinel(captured.requests);
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
              const payloads = JSON.stringify(captured.requests);
              expect(payloads).toContain("cli.arg.source");
              expect(payloads).toContain("<redacted>");
              expect(payloads).toContain("cli.applied_count");
            }),
          (operation) => Effect.sync(operation.cleanup),
        );
      }),
  );

  it.effect(
    "an actual failed install reports its failure identity and shares the invocation identity with its usage events",
    () =>
      Effect.gen(function* () {
        const operation = makeTelemetryOperation();
        const captured = captureTelemetry();
        yield* Effect.acquireUseRelease(
          Effect.succeed(operation),
          (operation) =>
            Effect.gen(function* () {
              const result = yield* operation.run({ client: captured.client, fail: true });
              expect(result.exitCode).toBe(3);
              expectNoSentinel(captured.requests);

              const reports = captured.requests.filter(isErrorReport);
              expect(reports).toHaveLength(1);
              const report = yield* decodeErrorReport(reports[0]?.body);
              expect(report.phase).toBe("command");
              expect(report.command).toBe("install");
              expect(report.failure).toEqual({
                kind: "not_found",
                category: "not_found",
                class: "user",
                handled: true,
              });

              const batches = captured.requests.filter(isEventBatch);
              expect(batches.length).toBeGreaterThanOrEqual(2);
              for (const batch of batches) {
                const decoded = yield* decodeEventsRequest(batch.body);
                expect(decoded.context.invocationId).toBe(report.invocationId);
                for (const event of decoded.events) expect(event.eventId).toMatch(UUID_PATTERN);
              }
            }),
          (operation) => Effect.sync(operation.cleanup),
        );
      }),
  );

  it.effect(
    "handled errors and defects report only their allowlisted identity, never content or credentials",
    () =>
      Effect.gen(function* () {
        const content = sensitiveSentinels.join(" ");
        // The envelope renders each failure locally with its full detail; the
        // report names only the failure's allowlisted identity.
        const settle = (program: Effect.Effect<void, AppError>) =>
          Effect.gen(function* () {
            const capture = captureTelemetry();
            const streams = makeRecordingStreams();
            yield* withCliErrorHandling(program, { command: "install", format: "json" }).pipe(
              Effect.provide(
                Layer.mergeAll(
                  reporterOver(capture.client),
                  machineScreenLayer(streams),
                  TestFlagsLayer({ json: true }),
                ),
              ),
            );
            expect(JSON.stringify(streams.log)).toContain(sensitiveSentinels[0]);
            return capture.requests;
          });

        const handled = yield* settle(
          Effect.fail(
            makeAppError({
              code: "validation",
              detail: content,
              cause: new Error(sensitiveSentinels[3]),
            }),
          ),
        );
        const defect = yield* settle(Effect.die(new TypeError(content)));

        for (const [requests, expected] of [
          [handled, { kind: "validation", category: "validation", class: "user", handled: true }],
          [
            defect,
            { kind: "defect.type-error", category: "internal", class: "internal", handled: false },
          ],
        ] as const) {
          expectNoSentinel(requests);
          const reports = requests.filter(isErrorReport);
          expect(reports).toHaveLength(1);
          const report = yield* decodeErrorReport(reports[0]?.body);
          expect(report.failure).toEqual(expected);
          expect(report.command).toBe("install");
          for (const batch of requests.filter(isEventBatch)) {
            const decoded = yield* decodeEventsRequest(batch.body);
            expect(decoded.context.invocationId).toBe(report.invocationId);
          }
        }
      }),
  );
});
