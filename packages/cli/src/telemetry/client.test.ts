import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  TelemetryClient,
  TelemetryClientLive,
  TelemetryClientTest,
  type TelemetryClientService,
} from "./client.js";
import { at, expectRecord, property } from "../test-helpers.js";

// ---------------------------------------------------------------------------
// Mock HTTP client that captures requests
// ---------------------------------------------------------------------------

interface CapturedRequest {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

const makeMockHttpClient = () => {
  const captured: Array<CapturedRequest> = [];

  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      const bodyText =
        request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "";

      captured.push({
        url: request.url,
        method: request.method,
        body: bodyText.length > 0 ? JSON.parse(bodyText) : undefined,
      });

      return HttpClientResponse.fromWeb(request, new Response("", { status: 202 }));
    }),
  );

  return { client, captured };
};

const makeMockLayer = (mock: { client: HttpClient.HttpClient }) =>
  Layer.succeed(HttpClient.HttpClient, mock.client);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TelemetryClientLive", () => {
  // TelemetryClientLive reads VITEST from process.env. In test environment
  // VITEST=true, which makes the client skip fire-and-forget requests.
  // Override to false so the live path runs.
  let savedVitest: string | undefined;
  beforeEach(() => {
    savedVitest = process.env["VITEST"];
    process.env["VITEST"] = "false";
  });
  afterEach(() => {
    if (savedVitest === undefined) delete process.env["VITEST"];
    else process.env["VITEST"] = savedVitest;
  });

  const getTelemetry = (
    mode: "all" | "errors" | "off",
    command: string,
    mock: { client: HttpClient.HttpClient },
  ): Effect.Effect<TelemetryClientService> => {
    const httpLayer = makeMockLayer(mock);
    const telemetryLayer = Layer.provide(TelemetryClientLive(mode, command), httpLayer);
    return TelemetryClient.asEffect().pipe(Effect.provide(telemetryLayer));
  };

  describe("mode 'all'", () => {
    it.effect("trackEvent sends POST to /events with correct payload shape", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const telemetry = yield* getTelemetry("all", "skills install", mock);

        yield* telemetry.trackEvent("command:start", { command: "skills install" });

        // Daemon fibers need a tick to complete
        yield* Effect.yieldNow;

        expect(mock.captured).toHaveLength(1);
        const req = at(mock.captured, 0);
        expect(req.url).toBe("https://t.agentxm.ai/v1/events");
        expect(req.method).toBe("POST");

        const body = expectRecord(req.body);
        const events = property(body, "events");
        expect(Array.isArray(events)).toBe(true);
        if (Array.isArray(events)) {
          expect(events).toHaveLength(1);
          const event = expectRecord(at(events, 0));
          expect(property(event, "event")).toBe("command:start");
          expect(property(event, "properties")).toEqual({ command: "skills install" });
          expect(typeof property(event, "distinctId")).toBe("string");
          expect(typeof property(event, "timestamp")).toBe("string");
        }
        expect(typeof property(body, "sentAt")).toBe("string");
        const context = expectRecord(property(body, "context"));
        const client = expectRecord(property(context, "client"));
        expect(property(client, "name")).toBe("cli");
        expect(typeof property(client, "version")).toBe("string");
        const os = expectRecord(property(context, "os"));
        expect(typeof property(os, "name")).toBe("string");
        expect(typeof property(os, "version")).toBe("string");
        const runtime = expectRecord(property(context, "runtime"));
        expect(property(runtime, "name")).toBe("bun");
        const device = expectRecord(property(context, "device"));
        expect(typeof property(device, "arch")).toBe("string");
        expect(typeof property(context, "ci")).toBe("boolean");
      }),
    );

    it.effect("reportError sends POST to /errors with correct payload shape", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const telemetry = yield* getTelemetry("all", "init", mock);

        yield* telemetry.reportError({
          name: "WORKSPACE_NOT_FOUND",
          message: "Workspace not initialized",
          details: ["some detail"],
          howToFix: "Run axm init",
          level: "error",
          handled: true,
          command: "init",
        });

        yield* Effect.yieldNow;

        expect(mock.captured).toHaveLength(1);
        const req = at(mock.captured, 0);
        expect(req.url).toBe("https://t.agentxm.ai/v1/errors");
        expect(req.method).toBe("POST");

        const body = expectRecord(req.body);
        const errors = property(body, "errors");
        expect(Array.isArray(errors)).toBe(true);
        if (Array.isArray(errors)) {
          expect(errors).toHaveLength(1);
          const error = expectRecord(at(errors, 0));
          expect(property(error, "name")).toBe("WORKSPACE_NOT_FOUND");
          expect(property(error, "message")).toBe("Workspace not initialized");
        }
        expect(property(body, "level")).toBe("error");
        expect(property(body, "handled")).toBe(true);
        expect(property(expectRecord(property(body, "tags")), "errorCode")).toBe(
          "WORKSPACE_NOT_FOUND",
        );
        expect(property(body, "fingerprint")).toEqual(["WORKSPACE_NOT_FOUND"]);
        expect(typeof property(expectRecord(property(body, "user")), "id")).toBe("string");
        expect(typeof property(body, "sentAt")).toBe("string");
        expect(expectRecord(property(body, "context"))).toHaveProperty("command", "init");
        expect(expectRecord(property(body, "context"))).toHaveProperty("client");
      }),
    );
  });

  describe("mode 'off'", () => {
    it.effect("sends nothing for trackEvent or reportError", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const telemetry = yield* getTelemetry("off", "init", mock);

        yield* telemetry.trackEvent("command:start");
        yield* telemetry.reportError({
          name: "ERR",
          message: "msg",
          level: "error",
          handled: true,
          command: "init",
        });

        yield* Effect.yieldNow;

        expect(mock.captured).toHaveLength(0);
      }),
    );
  });

  describe("mode 'errors'", () => {
    it.effect("skips trackEvent but sends reportError", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const telemetry = yield* getTelemetry("errors", "init", mock);

        yield* telemetry.trackEvent("command:start");
        yield* Effect.yieldNow;
        expect(mock.captured).toHaveLength(0);

        yield* telemetry.reportError({
          name: "ERR",
          message: "msg",
          level: "error",
          handled: true,
          command: "init",
        });
        yield* Effect.yieldNow;

        expect(mock.captured).toHaveLength(1);
        expect(at(mock.captured, 0).url).toBe("https://t.agentxm.ai/v1/errors");
      }),
    );
  });

  describe("API failure resilience", () => {
    it.effect("silently swallows HTTP failures", () =>
      Effect.gen(function* () {
        const failingClient = HttpClient.make(() => Effect.die("network failure"));
        const httpLayer = Layer.succeed(HttpClient.HttpClient, failingClient);
        const telemetryLayer = Layer.provide(TelemetryClientLive("all", "init"), httpLayer);

        const telemetry = yield* TelemetryClient.asEffect().pipe(Effect.provide(telemetryLayer));

        // These should not throw or affect the caller
        yield* telemetry.trackEvent("command:start");
        yield* telemetry.reportError({
          name: "ERR",
          message: "msg",
          level: "error",
          handled: true,
          command: "init",
        });

        yield* Effect.yieldNow;

        // If we got here, failures were swallowed
        expect(true).toBe(true);
      }),
    );
  });
});

describe("TelemetryClientTest", () => {
  it.effect("provides a no-op implementation", () =>
    Effect.gen(function* () {
      const telemetry = yield* TelemetryClient.asEffect().pipe(Effect.provide(TelemetryClientTest));

      // Should complete without errors
      yield* telemetry.trackEvent("test-event");
      yield* telemetry.reportError({
        name: "TEST",
        message: "test",
        level: "error",
        handled: true,
        command: "test",
      });
    }),
  );
});
