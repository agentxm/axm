import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { defineSpecification } from "@agentxm/specification-metadata";

import { TestFlagsLayer } from "../cli-flags/index.js";
import { LogEventSchema, withCliErrorHandling } from "../cli-runtime/index.js";
import { makeTestOutputStreams, ScreenMachine } from "../screen/index.js";
import { captureTelemetry, telemetryReporterLayer } from "../test-support/telemetry-harness.js";
import {
  TelemetryClient,
  type TelemetryClientOptions,
  type TelemetryClientService,
  TelemetryErrorReport,
  TelemetryEventsRequest,
  type TelemetryMode,
} from "./index.js";

export const specification = defineSpecification({
  requirement: "system/security/telemetry-preview-never-transmits",
  title: "Telemetry preview shows the payload without sending it",
  statement:
    "When the operator enables telemetry preview, AXM shall write the exact sanitized wire payload it would otherwise send to the diagnostic channel, shall not transmit it, and shall write nothing when telemetry is off.",
  class: "functional",
  role: "experience",
  goals: ["privacy-and-consent"],
  methods: ["example", "contract"],
  derivedFrom: [
    "system/security/telemetry-consent-and-precedence",
    "system/security/telemetry-payloads-respect-data-boundary",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeErrorReport = (input: unknown) =>
  Schema.decodeUnknownEffect(TelemetryErrorReport)(input, { onExcessProperty: "error" });
const decodeEventsRequest = (input: unknown) =>
  Schema.decodeUnknownEffect(TelemetryEventsRequest)(input, { onExcessProperty: "error" });
const decodeLogEvent = (line: string) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(LogEventSchema))(line, {
    onExcessProperty: "error",
  });

const PREVIEW_LINE = /^telemetry preview (\/v1\/errors|\/v1\/events) (\{.*\})$/u;

/** One invocation that reports a failure and records a usage event. */
const reportAndTrack = (telemetry: TelemetryClientService) =>
  telemetry
    .reportError({
      phase: "command",
      kind: "not_found",
      category: "not_found",
      errorClass: "user",
      handled: true,
      command: "install",
    })
    .pipe(Effect.andThen(telemetry.trackEvent("command_completed", { "cli.result": "error" })));

/**
 * Run one invocation, capturing both the transport and the diagnostic
 * channel. The reporter releases before this returns, so everything it would
 * ever send or write has been observed.
 */
const observe = (options: {
  readonly mode: TelemetryMode;
  readonly preview: boolean;
  readonly previewFormat?: TelemetryClientOptions["previewFormat"];
}) =>
  Effect.gen(function* () {
    const capture = captureTelemetry();
    const diagnostics: Array<string> = [];
    yield* TelemetryClient.use(reportAndTrack).pipe(
      Effect.provide(
        telemetryReporterLayer({
          client: capture.client,
          reporter: {
            mode: options.mode,
            client: { name: "cli", version: "1.2.3" },
            deliverInTest: true,
            installationId: "00000000-0000-4000-8000-000000000001",
            eventIdFactory: () => "00000000-0000-4000-8000-000000000002",
            preview: options.preview,
            ...(options.previewFormat === undefined
              ? {}
              : { previewFormat: options.previewFormat }),
            diagnostic: (line) => Effect.sync(() => void diagnostics.push(line)),
          },
        }),
      ),
    );
    return { requests: capture.requests, diagnostics };
  });

/** The route and payload one preview line names. */
const previewedPayload = (line: string) => {
  const match = PREVIEW_LINE.exec(line);
  expect(match, line).not.toBeNull();
  const payload: unknown = JSON.parse(match?.[2] ?? "null");
  return { route: match?.[1], payload };
};

/**
 * Payloads as comparable text, with the identity of the invocation that
 * produced each set aside: two invocations never share one.
 */
const comparable = (payloads: ReadonlyArray<unknown>): ReadonlyArray<string> =>
  payloads
    .map((payload) =>
      JSON.stringify(payload, (key, value: unknown) =>
        key === "invocationId" ? undefined : value,
      ),
    )
    .sort();

describe("Telemetry preview", () => {
  it.effect("an opted-in error report is written to the diagnostic channel and never sent", () =>
    Effect.gen(function* () {
      const previewed = yield* observe({ mode: "errors", preview: true });
      const delivered = yield* observe({ mode: "errors", preview: false });

      expect(previewed.requests).toEqual([]);
      expect(previewed.diagnostics).toHaveLength(1);
      const { route, payload } = previewedPayload(previewed.diagnostics[0] ?? "");
      expect(route).toBe("/v1/errors");
      const report = yield* decodeErrorReport(payload);
      expect(report.failure).toEqual({
        kind: "not_found",
        category: "not_found",
        class: "user",
        handled: true,
      });

      // The preview is the payload delivery would have sent, field for field
      // apart from the identity of the invocation that produced it.
      expect(delivered.diagnostics).toEqual([]);
      expect(comparable(delivered.requests.map(({ body }) => body))).toEqual(comparable([payload]));
    }),
  );

  it.effect("opted-in usage events are written to the diagnostic channel and never sent", () =>
    Effect.gen(function* () {
      const previewed = yield* observe({ mode: "all", preview: true });
      const delivered = yield* observe({ mode: "all", preview: false });

      expect(previewed.requests).toEqual([]);
      const lines = previewed.diagnostics.map(previewedPayload);
      expect(lines.map(({ route }) => route).sort()).toEqual(["/v1/errors", "/v1/events"]);
      for (const { route, payload } of lines) {
        if (route === "/v1/events") yield* decodeEventsRequest(payload);
        else yield* decodeErrorReport(payload);
      }
      expect(comparable(lines.map(({ payload }) => payload))).toEqual(
        comparable(delivered.requests.map(({ body }) => body)),
      );
    }),
  );

  it.effect("machine output carries each preview as one log event on the diagnostic channel", () =>
    Effect.gen(function* () {
      const previewed = yield* observe({ mode: "errors", preview: true, previewFormat: "json" });

      expect(previewed.requests).toEqual([]);
      expect(previewed.diagnostics).toHaveLength(1);
      const event = yield* decodeLogEvent(previewed.diagnostics[0] ?? "");
      expect(event.level).toBe("info");
      const { route, payload } = previewedPayload(event.message);
      expect(route).toBe("/v1/errors");
      yield* decodeErrorReport(payload);
    }),
  );

  it.effect(
    "a command that resolved machine output carries each preview as one log event, whatever its spelling",
    () =>
      Effect.gen(function* () {
        const capture = captureTelemetry();
        const diagnostics: Array<string> = [];
        const streams = makeTestOutputStreams();
        // A spelling such as `--json=true` escapes the startup scan, so the
        // reporter's own framing is text; the command runtime resolved machine
        // output from the parsed command line, and its previews follow that.
        yield* withCliErrorHandling(Effect.void, { command: "list", format: "json" }).pipe(
          Effect.provide(
            Layer.mergeAll(
              telemetryReporterLayer({
                client: capture.client,
                reporter: {
                  mode: "all",
                  client: { name: "cli", version: "1.2.3" },
                  deliverInTest: true,
                  installationId: "00000000-0000-4000-8000-000000000001",
                  preview: true,
                  previewFormat: "text",
                  diagnostic: (line) => Effect.sync(() => void diagnostics.push(line)),
                },
              }),
              Layer.provide(ScreenMachine(), streams.layer),
              TestFlagsLayer({ json: true }),
            ),
          ),
        );

        expect(capture.requests).toEqual([]);
        expect(diagnostics).toHaveLength(2);
        for (const line of diagnostics) {
          const event = yield* decodeLogEvent(line);
          const { route, payload } = previewedPayload(event.message);
          expect(route).toBe("/v1/events");
          yield* decodeEventsRequest(payload);
        }
      }),
  );

  it.effect("telemetry that is off writes nothing even when preview is requested", () =>
    Effect.gen(function* () {
      const previewed = yield* observe({ mode: "off", preview: true });

      expect(previewed.requests).toEqual([]);
      expect(previewed.diagnostics).toEqual([]);
    }),
  );
});
