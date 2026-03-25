import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { TelemetryClient, TelemetryClientLive } from "./client.js";

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
        expect(body.context.client).toEqual({ name: "cli", version: "1.2.3" });
        expect(body.context.runtime.name).toBe("bun");
        expect(typeof body.context.runtime.version).toBe("string");
        expect(typeof body.context.os.name).toBe("string");
        expect(typeof body.context.os.version).toBe("string");
        expect(typeof body.context.device.arch).toBe("string");
        expect(body.context.ci).toBe(false);
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

  describe("test mode", () => {
    it.effect("uses the no-op implementation when VITEST=true", () =>
      Effect.gen(function* () {
        process.env["VITEST"] = "true";
        const mock = makeMockHttpClient();
        const telemetry = yield* getTelemetry("all", "init", mock);

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

  describe("API failure resilience", () => {
    it.effect("silently swallows HTTP failures", () =>
      Effect.gen(function* () {
        const failingClient = HttpClient.make(() => Effect.die("network failure"));
        const telemetryLayer = Layer.provide(
          TelemetryClientLive({
            mode: "all",
            command: "init",
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
          handled: true,
          command: "init",
        });
        yield* Effect.yieldNow;

        expect(true).toBe(true);
      }),
    );
  });
});
