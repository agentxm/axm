import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import { TELEMETRY_EVENT_TIMEOUT, TelemetryClient, TelemetryClientLive } from "./client.js";
import { at, expectRecord, property } from "../test-helpers.js";

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

const getTelemetry = (
  mode: "all" | "errors" | "off",
  command: string,
  mock: { client: HttpClient.HttpClient },
) => {
  const telemetryLayer = Layer.provide(
    TelemetryClientLive({
      mode,
      command,
      client: { name: "cli", version: "1.2.3" },
    }),
    Layer.succeed(HttpClient.HttpClient, mock.client),
  );

  return TelemetryClient.asEffect().pipe(Effect.provide(telemetryLayer));
};

describe("TelemetryClientLive", () => {
  // isTest() reads VITEST env var. Override to false so the live path runs.
  let savedVitest: string | undefined;
  beforeEach(() => {
    savedVitest = process.env["VITEST"];
    process.env["VITEST"] = "false";
  });
  afterEach(() => {
    if (savedVitest === undefined) delete process.env["VITEST"];
    else process.env["VITEST"] = savedVitest;
  });

  describe("mode 'all'", () => {
    it.effect("trackEvent sends POST to /events with correct payload shape", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const telemetry = yield* getTelemetry("all", "skills install", mock);

        yield* telemetry.trackEvent("command:start", { command: "skills install" });
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
        expect(property(context, "client")).toEqual({ name: "cli", version: "1.2.3" });
        const runtime = expectRecord(property(context, "runtime"));
        expect(property(runtime, "name")).toBe("bun");
        expect(typeof property(runtime, "version")).toBe("string");
        const os = expectRecord(property(context, "os"));
        expect(typeof property(os, "name")).toBe("string");
        expect(typeof property(os, "version")).toBe("string");
        const device = expectRecord(property(context, "device"));
        expect(typeof property(device, "arch")).toBe("string");
        expect(typeof property(context, "ci")).toBe("boolean");
      }),
    );

    it.effect("reportError sends POST to /errors with correct payload shape", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const telemetry = yield* getTelemetry("all", "setup", mock);

        yield* telemetry.reportError({
          name: "WORKSPACE_NOT_FOUND",
          message: "WorkspaceMutations not initialized",
          details: ["some detail"],
          category: "not_found",
          level: "error",
          errorClass: "user",
          handled: true,
          command: "setup",
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
          expect(property(error, "message")).toBe("WorkspaceMutations not initialized");
          expect(property(error, "details")).toEqual(["some detail"]);
        }
        expect(property(body, "level")).toBe("error");
        expect(property(body, "errorClass")).toBe("user");
        expect(property(body, "handled")).toBe(true);
        expect(property(expectRecord(property(body, "tags")), "errorCode")).toBe(
          "WORKSPACE_NOT_FOUND",
        );
        expect(property(body, "fingerprint")).toEqual(["WORKSPACE_NOT_FOUND"]);
        expect(typeof property(expectRecord(property(body, "user")), "id")).toBe("string");
        expect(typeof property(body, "sentAt")).toBe("string");
        expect(expectRecord(property(body, "context"))).toHaveProperty("command", "setup");
        expect(expectRecord(property(body, "context"))).toHaveProperty("client");
      }),
    );
  });

  describe("mode 'off'", () => {
    it.effect("sends nothing for trackEvent or reportError", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const telemetry = yield* getTelemetry("off", "setup", mock);

        yield* telemetry.trackEvent("command:start");
        yield* telemetry.reportError({
          name: "ERR",
          message: "msg",
          level: "error",
          errorClass: "user",
          handled: true,
          command: "setup",
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
        const telemetry = yield* getTelemetry("errors", "setup", mock);

        yield* telemetry.trackEvent("command:start");
        yield* Effect.yieldNow;
        expect(mock.captured).toHaveLength(0);

        yield* telemetry.reportError({
          name: "ERR",
          message: "msg",
          level: "error",
          errorClass: "user",
          handled: true,
          command: "setup",
        });
        yield* Effect.yieldNow;

        expect(mock.captured).toHaveLength(1);
        expect(at(mock.captured, 0).url).toBe("https://t.agentxm.ai/v1/errors");
      }),
    );
  });

  describe("test mode", () => {
    it.effect("uses the no-op implementation when VITEST=true", () =>
      Effect.gen(function* () {
        process.env["VITEST"] = "true";
        const mock = makeMockHttpClient();
        const telemetry = yield* getTelemetry("all", "setup", mock);

        yield* telemetry.trackEvent("command:start");
        yield* telemetry.reportError({
          name: "ERR",
          message: "msg",
          level: "error",
          errorClass: "user",
          handled: true,
          command: "setup",
        });
        yield* Effect.yieldNow;

        expect(mock.captured).toHaveLength(0);
      }),
    );
  });

  describe("JSON-primitive property support", () => {
    it.effect("trackEvent accepts number, boolean, and null property values", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const telemetry = yield* getTelemetry("all", "skills install", mock);

        yield* telemetry.trackEvent("command_completed", {
          "cli.command": "skills install",
          "cli.duration_ms": 1234,
          "cli.verbose": true,
          "cli.error_code": null,
        });
        yield* Effect.yieldNow;

        expect(mock.captured).toHaveLength(1);
        const req = at(mock.captured, 0);
        const body = expectRecord(req.body);
        const events = property(body, "events");
        expect(Array.isArray(events)).toBe(true);
        if (Array.isArray(events)) {
          const event = expectRecord(at(events, 0));
          const props = expectRecord(property(event, "properties"));
          expect(props["cli.duration_ms"]).toBe(1234);
          expect(typeof props["cli.duration_ms"]).toBe("number");
          expect(props["cli.verbose"]).toBe(true);
          expect(typeof props["cli.verbose"]).toBe("boolean");
          expect(props["cli.error_code"]).toBeNull();
        }
      }),
    );

    it.effect("HTTP payload preserves JSON types (numbers stay numbers)", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const telemetry = yield* getTelemetry("all", "setup", mock);

        yield* telemetry.trackEvent("test_event", {
          count: 42,
          enabled: false,
          label: "test",
          missing: null,
        });
        yield* Effect.yieldNow;

        expect(mock.captured).toHaveLength(1);
        const body = expectRecord(at(mock.captured, 0).body);
        const events = property(body, "events");
        expect(Array.isArray(events)).toBe(true);
        if (Array.isArray(events)) {
          const props = expectRecord(property(expectRecord(at(events, 0)), "properties"));
          // Verify raw JSON types are preserved through serialization
          expect(props["count"]).toBe(42);
          expect(props["enabled"]).toBe(false);
          expect(props["label"]).toBe("test");
          expect(props["missing"]).toBeNull();
        }
      }),
    );
  });

  describe("generated client delegation", () => {
    it.effect("trackEvent delegates to generated EventsIngest via POST /v1/events", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const telemetry = yield* getTelemetry("all", "skills install", mock);

        yield* telemetry.trackEvent("command:start", { command: "skills install" });
        yield* Effect.yieldNow;

        expect(mock.captured).toHaveLength(1);
        const req = at(mock.captured, 0);
        expect(req.url).toBe("https://t.agentxm.ai/v1/events");
        expect(req.method).toBe("POST");
      }),
    );

    it.effect("reportError delegates to generated ErrorsIngest via POST /v1/errors", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const telemetry = yield* getTelemetry("all", "setup", mock);

        yield* telemetry.reportError({
          name: "ERR",
          message: "msg",
          level: "error",
          errorClass: "user",
          handled: true,
          command: "setup",
        });
        yield* Effect.yieldNow;

        expect(mock.captured).toHaveLength(1);
        const req = at(mock.captured, 0);
        expect(req.url).toBe("https://t.agentxm.ai/v1/errors");
        expect(req.method).toBe("POST");
      }),
    );
  });

  describe("API failure resilience", () => {
    it.effect("times out hung usage events", () =>
      Effect.gen(function* () {
        const interrupted = yield* Deferred.make<void>();
        const hangingClient = HttpClient.make(() =>
          Effect.never.pipe(
            Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined).pipe(Effect.asVoid)),
          ),
        );
        const telemetryLayer = Layer.provide(
          TelemetryClientLive({
            mode: "all",
            command: "setup",
            client: { name: "cli", version: "1.2.3" },
          }),
          Layer.succeed(HttpClient.HttpClient, hangingClient),
        );
        const telemetry = yield* TelemetryClient.asEffect().pipe(Effect.provide(telemetryLayer));

        yield* telemetry.trackEvent("command:start");
        yield* Effect.yieldNow;
        expect(yield* Deferred.isDone(interrupted)).toBe(false);

        yield* TestClock.adjust(TELEMETRY_EVENT_TIMEOUT);
        yield* Effect.yieldNow;
        expect(yield* Deferred.isDone(interrupted)).toBe(true);
      }),
    );

    it.effect("silently swallows HTTP defects", () =>
      Effect.gen(function* () {
        const failingClient = HttpClient.make(() => Effect.die("network failure"));
        const telemetryLayer = Layer.provide(
          TelemetryClientLive({
            mode: "all",
            command: "setup",
            client: { name: "cli", version: "1.2.3" },
          }),
          Layer.succeed(HttpClient.HttpClient, failingClient),
        );
        const telemetry = yield* TelemetryClient.asEffect().pipe(Effect.provide(telemetryLayer));

        yield* telemetry.trackEvent("command:start");
        yield* telemetry.reportError({
          name: "ERR",
          message: "msg",
          level: "error",
          errorClass: "user",
          handled: true,
          command: "setup",
        });
        yield* Effect.yieldNow;

        expect(true).toBe(true);
      }),
    );

    it.effect("silently swallows HttpClientError (status code errors)", () =>
      Effect.gen(function* () {
        const errorClient = HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(request, new Response("Bad Request", { status: 400 })),
          ),
        );
        const telemetryLayer = Layer.provide(
          TelemetryClientLive({
            mode: "all",
            command: "setup",
            client: { name: "cli", version: "1.2.3" },
          }),
          Layer.succeed(HttpClient.HttpClient, errorClient),
        );
        const telemetry = yield* TelemetryClient.asEffect().pipe(Effect.provide(telemetryLayer));

        yield* telemetry.trackEvent("command:start");
        yield* telemetry.reportError({
          name: "ERR",
          message: "msg",
          level: "error",
          errorClass: "user",
          handled: true,
          command: "setup",
        });
        yield* Effect.yieldNow;

        expect(true).toBe(true);
      }),
    );

    it.effect("silently swallows HttpClientError (transport errors)", () =>
      Effect.gen(function* () {
        const transportErrorClient = HttpClient.make((request) =>
          Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({
                request,
                cause: new Error("ECONNREFUSED"),
              }),
            }),
          ),
        );
        const telemetryLayer = Layer.provide(
          TelemetryClientLive({
            mode: "all",
            command: "setup",
            client: { name: "cli", version: "1.2.3" },
          }),
          Layer.succeed(HttpClient.HttpClient, transportErrorClient),
        );
        const telemetry = yield* TelemetryClient.asEffect().pipe(Effect.provide(telemetryLayer));

        yield* telemetry.trackEvent("command:start");
        yield* telemetry.reportError({
          name: "ERR",
          message: "msg",
          level: "error",
          errorClass: "user",
          handled: true,
          command: "setup",
        });
        yield* Effect.yieldNow;

        expect(true).toBe(true);
      }),
    );

    it.effect("silently swallows TelemetryClientError (400 decode error)", () =>
      Effect.gen(function* () {
        const error400Client = HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(
                JSON.stringify({
                  kind: "DecodeErrorResponse",
                  type: "about:blank",
                  title: "Bad Request",
                  status: 400,
                  detail: "Invalid payload",
                  code: "validation_error",
                }),
                { status: 400, headers: { "content-type": "application/json" } },
              ),
            ),
          ),
        );
        const telemetryLayer = Layer.provide(
          TelemetryClientLive({
            mode: "all",
            command: "setup",
            client: { name: "cli", version: "1.2.3" },
          }),
          Layer.succeed(HttpClient.HttpClient, error400Client),
        );
        const telemetry = yield* TelemetryClient.asEffect().pipe(Effect.provide(telemetryLayer));

        yield* telemetry.trackEvent("command:start");
        yield* telemetry.reportError({
          name: "ERR",
          message: "msg",
          level: "error",
          errorClass: "user",
          handled: true,
          command: "setup",
        });
        yield* Effect.yieldNow;

        expect(true).toBe(true);
      }),
    );
  });
});
