import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";

import {
  TelemetryClient,
  TelemetryClientLive,
  TelemetryErrorsRequest,
  TelemetryEventsRequest,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/security/telemetry-payloads-respect-data-boundary",
  title: "Telemetry payloads carry only the fields the published telemetry contract declares",
  statement:
    "Every telemetry event AXM sends shall carry only the observation fields for identity, timing, and command context that the published telemetry contract declares, so that extension content, authored instructions and knowledge, credentials, and resolved secret values have no field in which to travel.",
  class: "quality",
  characteristic: "privacy",
  role: "interface",
  goals: ["privacy-and-consent"],
  methods: ["contract", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "Values inside the free-form properties field carry only documented observation data; the evidence bounds field names at every level the published contract closes, not the values inside properties.",
    "The telemetry contract snapshot generated into the CLI is the contract the production telemetry service publishes.",
  ],
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
        }),
        Layer.succeed(HttpClient.HttpClient, client),
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
  let savedVitest: string | undefined;
  beforeEach(() => {
    savedVitest = process.env["VITEST"];
    process.env["VITEST"] = "false";
  });
  afterEach(() => {
    if (savedVitest === undefined) {
      delete process.env["VITEST"];
    } else {
      process.env["VITEST"] = savedVitest;
    }
  });

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
        message: "message",
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

  it.effect("a field outside the contract is rejected by the same check", () =>
    Effect.gen(function* () {
      const { client, captured } = captureClient();
      const telemetry = yield* telemetryOver(client);
      yield* telemetry.trackEvent("command:start", undefined, { bounded: true });

      const body = onlyCapturedBody(captured);
      if (typeof body !== "object" || body === null) {
        throw new Error("Expected a JSON object payload");
      }
      const widened = { ...body, workspacePath: "/home/operator/project" };
      const outcome = yield* decodeEventsRequest(widened).pipe(Effect.flip);
      expect(String(outcome)).toContain("workspacePath");
    }),
  );
});
