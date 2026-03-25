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
        body: bodyText.length > 0 ? (JSON.parse(bodyText) as unknown) : undefined,
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
        const req = mock.captured[0]!;
        expect(req.url).toBe("https://t.agentxm.ai/v1/events");
        expect(req.method).toBe("POST");

        const body = req.body as {
          events: ReadonlyArray<{
            event: string;
            distinctId: string;
            timestamp: string;
            properties: Record<string, string>;
          }>;
          sentAt: string;
          context: {
            client: { name: string; version: string };
            os: { name: string; version: string };
            runtime: { name: string; version: string };
            device: { arch: string };
            ci: boolean;
          };
        };

        expect(body.events).toHaveLength(1);
        expect(body.events[0]!.event).toBe("command:start");
        expect(body.events[0]!.properties).toEqual({ command: "skills install" });
        expect(typeof body.events[0]!.distinctId).toBe("string");
        expect(typeof body.events[0]!.timestamp).toBe("string");
        expect(typeof body.sentAt).toBe("string");
        expect(body.context.client.name).toBe("cli");
        expect(typeof body.context.client.version).toBe("string");
        expect(typeof body.context.os.name).toBe("string");
        expect(typeof body.context.os.version).toBe("string");
        expect(body.context.runtime.name).toBe("bun");
        expect(typeof body.context.device.arch).toBe("string");
        expect(typeof body.context.ci).toBe("boolean");
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
        const req = mock.captured[0]!;
        expect(req.url).toBe("https://t.agentxm.ai/v1/errors");
        expect(req.method).toBe("POST");

        const body = req.body as {
          errors: ReadonlyArray<{ message: string; name: string }>;
          level: string;
          handled: boolean;
          tags: { errorCode: string };
          fingerprint: ReadonlyArray<string>;
          user: { id: string };
          sentAt: string;
          context: Record<string, unknown>;
        };

        expect(body.errors).toHaveLength(1);
        expect(body.errors[0]!.name).toBe("WORKSPACE_NOT_FOUND");
        expect(body.errors[0]!.message).toBe("Workspace not initialized");
        expect(body.level).toBe("error");
        expect(body.handled).toBe(true);
        expect(body.tags.errorCode).toBe("WORKSPACE_NOT_FOUND");
        expect(body.fingerprint).toEqual(["WORKSPACE_NOT_FOUND"]);
        expect(typeof body.user.id).toBe("string");
        expect(typeof body.sentAt).toBe("string");
        expect(body.context).toHaveProperty("command", "init");
        expect(body.context).toHaveProperty("client");
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
        expect(mock.captured[0]!.url).toBe("https://t.agentxm.ai/v1/errors");
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
