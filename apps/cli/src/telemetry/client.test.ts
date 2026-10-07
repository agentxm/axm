import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";

import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as TestClock from "effect/testing/TestClock";
import { vi } from "vitest";

import { LogEventSchema } from "../screen/machine-events.js";
import {
  makeUnavailableIdentityStorage,
  telemetryIngestResponse,
} from "../test-support/telemetry-harness.js";
import { at, expectRecord, property } from "../test-support/test-helpers.js";
import {
  TelemetryErrorReport,
  TelemetryEventsRequest,
  TelemetryReportingClient,
} from "./__generated__/telemetry-client.js";
import {
  TELEMETRY_SHUTDOWN_BUDGET,
  TelemetryClient,
  TelemetryClientLive,
  type TelemetryClientOptions,
  type TelemetryClientService,
} from "./client.js";
import { reportingClientFacts, type TelemetryFailureReport } from "./payloads.js";

const INSTALLATION_ID = "00000000-0000-4000-8000-000000000001";
const EVENT_ID = "00000000-0000-4000-8000-000000000002";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const failure: TelemetryFailureReport = {
  phase: "command",
  kind: "not_found",
  operation: "runtime.command",
  category: "not_found",
  errorClass: "user",
  handled: true,
  command: "setup",
};

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
      const body: unknown = bodyText.length > 0 ? JSON.parse(bodyText) : undefined;
      captured.push({ url: request.url, method: request.method, body });
      return telemetryIngestResponse(request, body);
    }),
  );

  return { client, captured };
};

/** A client that never answers and counts the sends it started and the ones interrupted. */
const makeStalledHttpClient = () => {
  const counts = { started: 0, interrupted: 0 };
  const client = HttpClient.make(() =>
    Effect.sync(() => {
      counts.started += 1;
    }).pipe(
      Effect.andThen(Effect.never),
      Effect.onInterrupt(() =>
        Effect.sync(() => {
          counts.interrupted += 1;
        }),
      ),
    ),
  );
  return { client, counts };
};

interface ReporterFixture extends Partial<
  Omit<TelemetryClientOptions, "installationId" | "deliverInTest">
> {
  /** Resolve identity from storage instead of the fixed test identity. */
  readonly storedIdentity?: boolean;
  /** Leave the repository's test-run suppression in force. */
  readonly suppressedInTest?: boolean;
}

const reporterLayer = (
  fixture: ReporterFixture,
  client: HttpClient.HttpClient,
  environment: Readonly<Record<string, string>> = {},
  platform: Layer.Layer<FileSystem.FileSystem | Path.Path> = NodeServices.layer,
) => {
  const { storedIdentity, suppressedInTest, ...options } = fixture;
  return Layer.provide(
    TelemetryClientLive({
      mode: "all",
      detectCaller: Effect.succeed("unknown"),
      client: { name: "cli", version: "1.2.3" },
      eventIdFactory: () => EVENT_ID,
      ...(suppressedInTest === true ? {} : { deliverInTest: true }),
      ...(storedIdentity === true ? {} : { installationId: INSTALLATION_ID }),
      ...options,
    }),
    Layer.mergeAll(
      platform,
      Layer.succeed(HttpClient.HttpClient, client),
      ConfigProvider.layer(ConfigProvider.fromEnv({ env: { ...environment } })),
    ),
  );
};

/** Use one reporter for an invocation; it releases, flushing its sends, before this returns. */
const withReporter = <A>(
  layer: Layer.Layer<TelemetryClient>,
  use: (telemetry: TelemetryClientService) => Effect.Effect<A>,
) => TelemetryClient.use(use).pipe(Effect.provide(layer));

/** Build a reporter in a scope the test closes itself. */
const openReporter = (layer: Layer.Layer<TelemetryClient>) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const context = yield* Layer.buildWithScope(layer, scope);
    return { scope, telemetry: Context.get(context, TelemetryClient) };
  });

const decodeReport = Schema.decodeUnknownSync(TelemetryErrorReport);
const decodeEvents = Schema.decodeUnknownSync(TelemetryEventsRequest);

describe("TelemetryClientLive", () => {
  it.effect.each(["VITEST", "CI", "AXM_TELEMETRY_BASE_URL", "AXM_USER_HOME"])(
    "sends no usage event and writes no identity when %s configuration fails",
    (key) =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const files: string[] = [];
        yield* TelemetryClient.use((telemetry) => telemetry.trackEvent("command_invoked")).pipe(
          Effect.provide(
            Layer.provide(
              TelemetryClientLive({ mode: "all", client: { name: "cli", version: "1.2.3" } }),
              Layer.mergeAll(
                Path.layer,
                Layer.succeed(HttpClient.HttpClient, mock.client),
                ConfigProvider.layer(
                  ConfigProvider.make((path) =>
                    path[0] === key
                      ? Effect.fail(
                          new ConfigProvider.SourceError({ message: "source unavailable" }),
                        )
                      : Effect.succeed(undefined),
                  ),
                ),
                FileSystem.layerNoop({
                  readFileString: (path) =>
                    Effect.sync(() => {
                      files.push(path);
                      return "";
                    }),
                  makeDirectory: (path) =>
                    Effect.sync(() => {
                      files.push(path);
                    }),
                  writeFileString: (path) =>
                    Effect.sync(() => {
                      files.push(path);
                    }),
                }),
              ),
            ),
          ),
        );
        expect(files).toEqual([]);
        expect(mock.captured).toEqual([]);
      }),
  );

  describe("mode 'all'", () => {
    it.effect("trackEvent sends one usage event carrying the invocation identity", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const invocationId = yield* withReporter(reporterLayer({}, mock.client), (telemetry) =>
          telemetry
            .trackEvent("command:start", { command: "skills install" })
            .pipe(Effect.as(telemetry.invocationId)),
        );

        expect(invocationId).toMatch(UUID_PATTERN);
        expect(mock.captured).toHaveLength(1);
        const req = at(mock.captured, 0);
        expect(req.url).toBe("https://t.agentxm.ai/v1/events");
        expect(req.method).toBe("POST");

        const body = decodeEvents(req.body, { onExcessProperty: "error" });
        const event = at(body.events, 0);
        expect(body.events).toHaveLength(1);
        expect(event.eventId).toBe(EVENT_ID);
        expect(event.event).toBe("command:start");
        expect(event.properties).toEqual({ command: "skills install" });
        expect(event.distinctId).toBe(INSTALLATION_ID);
        expect(event.anonymous).toBe(true);
        expect(typeof event.timestamp).toBe("string");
        expect(typeof body.sentAt).toBe("string");
        expect(body.context).toEqual({
          client: { name: "cli", version: "1.2.3" },
          os: { name: process.platform },
          runtime: {
            name: process.versions["bun"] === undefined ? "node" : "bun",
            version: process.versions["bun"] ?? process.versions.node,
          },
          device: { arch: process.arch },
          ci: false,
          callerAgent: "unknown",
          invocationId,
        });
      }),
    );

    it.effect("reportError sends one allowlisted report through the generated client", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const invocationId = yield* withReporter(reporterLayer({}, mock.client), (telemetry) =>
          telemetry
            .reportError({ ...failure, activityId: "00000000-0000-4000-8000-000000000003" })
            .pipe(Effect.as(telemetry.invocationId)),
        );

        expect(mock.captured).toHaveLength(1);
        const req = at(mock.captured, 0);
        expect(req.url).toBe("https://t.agentxm.ai/v1/errors");
        expect(req.method).toBe("POST");
        const report = decodeReport(req.body, { onExcessProperty: "error" });
        expect(report).toEqual({
          eventId: EVENT_ID,
          invocationId,
          occurredAt: expect.any(String),
          installationId: INSTALLATION_ID,
          activityId: "00000000-0000-4000-8000-000000000003",
          client: {
            name: "cli",
            version: "1.2.3",
            runtime: process.versions["bun"] === undefined ? "node" : "bun",
            runtimeVersion: process.versions["bun"] ?? process.versions.node,
            platform: process.platform,
            architecture: process.arch,
            callerAgent: "unknown",
            ci: false,
          },
          command: "setup",
          phase: "command",
          failure: {
            kind: "not_found",
            operation: "runtime.command",
            category: "not_found",
            class: "user",
            handled: true,
          },
        });
      }),
    );

    it.effect("omits a command that is not a canonical command identity", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        yield* withReporter(reporterLayer({}, mock.client), (telemetry) =>
          telemetry.reportError({ ...failure, command: "install --source=/home/operator" }),
        );

        expect(expectRecord(at(mock.captured, 0).body)).not.toHaveProperty("command");
      }),
    );

    it.effect("sends nothing for a report outside the contract's bounds", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        yield* withReporter(reporterLayer({}, mock.client), (telemetry) =>
          telemetry.reportError({ ...failure, kind: "Free text from /home/operator" }),
        );

        expect(mock.captured).toEqual([]);
      }),
    );

    it.effect("reports at most one terminal failure per invocation", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        yield* withReporter(reporterLayer({}, mock.client), (telemetry) =>
          Effect.gen(function* () {
            yield* telemetry.reportError(failure);
            yield* telemetry.reportError({
              ...failure,
              phase: "output",
              kind: "output-write-failed",
              operation: "runtime.command",
            });
          }),
        );

        expect(mock.captured.map(({ body }) => property(expectRecord(body), "phase"))).toEqual([
          "command",
        ]);
      }),
    );
  });

  describe("mode 'off'", () => {
    it.effect("sends, previews, and stores nothing", () =>
      Effect.acquireUseRelease(
        Effect.sync(() => nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-telemetry-"))),
        (home) =>
          Effect.gen(function* () {
            const mock = makeMockHttpClient();
            const lines: Array<string> = [];
            yield* withReporter(
              reporterLayer(
                {
                  mode: "off",
                  preview: true,
                  diagnostic: (line) => Effect.sync(() => void lines.push(line)),
                  storedIdentity: true,
                },
                mock.client,
                { AXM_USER_HOME: home },
              ),
              (telemetry) =>
                Effect.gen(function* () {
                  yield* telemetry.trackEvent("command:start");
                  yield* telemetry.reportError(failure);
                }),
            );

            expect(mock.captured).toHaveLength(0);
            expect(lines).toEqual([]);
            expect(nodeFs.existsSync(nodePath.join(home, ".axm"))).toBe(false);
          }),
        (home) => Effect.sync(() => nodeFs.rmSync(home, { recursive: true, force: true })),
      ),
    );
  });

  describe("mode 'errors'", () => {
    it.effect("skips trackEvent but sends reportError", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        yield* withReporter(reporterLayer({ mode: "errors" }, mock.client), (telemetry) =>
          Effect.gen(function* () {
            yield* telemetry.trackEvent("command:start");
            yield* telemetry.reportError(failure);
          }),
        );

        expect(mock.captured.map(({ url }) => url)).toEqual(["https://t.agentxm.ai/v1/errors"]);
      }),
    );
  });

  describe("test mode", () => {
    it.effect("uses the no-op implementation when VITEST=true", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        yield* withReporter(
          reporterLayer({ suppressedInTest: true }, mock.client, { VITEST: "true" }),
          (telemetry) =>
            Effect.gen(function* () {
              yield* telemetry.trackEvent("command:start");
              yield* telemetry.reportError(failure);
            }),
        );

        expect(mock.captured).toHaveLength(0);
      }),
    );
  });

  describe("installation identity", () => {
    it.effect("reports without identity and skips usage events when storage is unavailable", () =>
      Effect.acquireUseRelease(
        Effect.sync(makeUnavailableIdentityStorage),
        (storage) =>
          Effect.gen(function* () {
            const mock = makeMockHttpClient();
            yield* withReporter(
              reporterLayer({ storedIdentity: true }, mock.client, {
                AXM_USER_HOME: storage.userHome,
              }),
              (telemetry) =>
                Effect.gen(function* () {
                  yield* telemetry.trackEvent("command_invoked");
                  yield* telemetry.reportError(failure);
                }),
            );

            expect(mock.captured.map(({ url }) => url)).toEqual(["https://t.agentxm.ai/v1/errors"]);
            const report = decodeReport(at(mock.captured, 0).body, { onExcessProperty: "error" });
            expect(report).not.toHaveProperty("installationId");
          }),
        (storage) => Effect.sync(storage.cleanup),
      ),
    );

    it.effect("never repairs an identity file that holds no identity", () =>
      Effect.acquireUseRelease(
        Effect.sync(() => nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-telemetry-"))),
        (home) =>
          Effect.gen(function* () {
            const identityFile = nodePath.join(home, ".axm", "telemetry", "installation-id");
            nodeFs.mkdirSync(nodePath.dirname(identityFile), { recursive: true });
            nodeFs.writeFileSync(identityFile, "not-an-identity\n");
            const mock = makeMockHttpClient();
            yield* withReporter(
              reporterLayer({ storedIdentity: true }, mock.client, { AXM_USER_HOME: home }),
              (telemetry) => telemetry.reportError(failure),
            );

            expect(expectRecord(at(mock.captured, 0).body)).not.toHaveProperty("installationId");
            expect(nodeFs.readFileSync(identityFile, "utf8")).toBe("not-an-identity\n");
          }),
        (home) => Effect.sync(() => nodeFs.rmSync(home, { recursive: true, force: true })),
      ),
    );
  });

  describe("preview", () => {
    it.effect("writes the encoded report as one text line and transmits nothing", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const lines: Array<string> = [];
        yield* withReporter(
          reporterLayer(
            { preview: true, diagnostic: (line) => Effect.sync(() => void lines.push(line)) },
            mock.client,
          ),
          (telemetry) => telemetry.reportError(failure),
        );

        expect(mock.captured).toEqual([]);
        expect(lines).toHaveLength(1);
        const prefix = "telemetry preview /v1/errors ";
        expect(at(lines, 0).startsWith(prefix)).toBe(true);
        const report = decodeReport(JSON.parse(at(lines, 0).slice(prefix.length)), {
          onExcessProperty: "error",
        });
        expect(report.failure.kind).toBe("not_found");
      }),
    );

    it.effect("frames each preview as one machine log event in JSON output", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const lines: Array<string> = [];
        yield* withReporter(
          reporterLayer(
            {
              preview: true,
              previewFormat: "json",
              diagnostic: (line) => Effect.sync(() => void lines.push(line)),
            },
            mock.client,
          ),
          (telemetry) => telemetry.trackEvent("command_invoked"),
        );

        expect(mock.captured).toEqual([]);
        expect(lines).toHaveLength(1);
        const event = Schema.decodeUnknownSync(LogEventSchema)(JSON.parse(at(lines, 0)), {
          onExcessProperty: "error",
        });
        expect(event.level).toBe("info");
        const prefix = "telemetry preview /v1/events ";
        expect(event.message.startsWith(prefix)).toBe(true);
        const request = decodeEvents(JSON.parse(event.message.slice(prefix.length)), {
          onExcessProperty: "error",
        });
        expect(request.events.map(({ event }) => event)).toEqual(["command_invoked"]);
      }),
    );
  });

  describe("default preview writer", () => {
    const eventLoopTurn = Effect.callback<void>((resume) => {
      setImmediate(() => resume(Effect.void));
    });

    it.effect("drops a line a broken stderr refuses without failing the process", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const brokenPipe = Object.assign(new Error("EPIPE"), { code: "EPIPE" });
        const baseline = process.stderr.listenerCount("error");
        const guarded: Array<boolean> = [];
        const written: Array<string> = [];
        // Node acknowledges a failed write through its callback and then emits
        // the failure on the stream; an unowned emission would end the process.
        const write = vi
          .spyOn(process.stderr, "write")
          .mockImplementation((...args: Array<unknown>) => {
            written.push(String(args[0]));
            const callback = args.find(
              (arg): arg is (error?: Error | null) => void => typeof arg === "function",
            );
            callback?.(brokenPipe);
            process.nextTick(() => {
              const owned = process.stderr.listenerCount("error") > baseline;
              guarded.push(owned);
              if (owned) process.stderr.emit("error", brokenPipe);
            });
            return false;
          });

        yield* withReporter(reporterLayer({ preview: true }, mock.client), (telemetry) =>
          telemetry.reportError(failure),
        ).pipe(Effect.ensuring(Effect.sync(() => write.mockRestore())));
        yield* eventLoopTurn;

        expect(written).toHaveLength(1);
        expect(at(written, 0).startsWith("telemetry preview /v1/errors ")).toBe(true);
        expect(guarded).toEqual([true]);
        expect(mock.captured).toEqual([]);
        expect(process.stderr.listenerCount("error")).toBe(baseline);
      }),
    );
  });

  describe("JSON-primitive property support", () => {
    it.effect("trackEvent preserves number, boolean, and null property values", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        yield* withReporter(reporterLayer({}, mock.client), (telemetry) =>
          telemetry.trackEvent("command_completed", {
            "cli.command": "skills install",
            "cli.duration_ms": 1234,
            "cli.verbose": true,
            "cli.error_code": null,
          }),
        );

        expect(mock.captured).toHaveLength(1);
        const events = property(expectRecord(at(mock.captured, 0).body), "events");
        expect(Array.isArray(events)).toBe(true);
        if (Array.isArray(events)) {
          const props = expectRecord(property(expectRecord(at(events, 0)), "properties"));
          expect(props["cli.duration_ms"]).toBe(1234);
          expect(props["cli.verbose"]).toBe(true);
          expect(props["cli.error_code"]).toBeNull();
        }
      }),
    );
  });

  describe("API failure resilience", () => {
    it.effect.each([
      ["HTTP defects", HttpClient.make(() => Effect.die("network failure"))],
      [
        "status code errors",
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(request, new Response("Bad Request", { status: 400 })),
          ),
        ),
      ],
      [
        "transport errors",
        HttpClient.make((request) =>
          Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({
                request,
                cause: new Error("ECONNREFUSED"),
              }),
            }),
          ),
        ),
      ],
      [
        "a receipt that does not decode",
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(JSON.stringify({ receipt: "stored" }), {
                status: 200,
                headers: { "content-type": "application/json" },
              }),
            ),
          ),
        ),
      ],
    ] as const)("silently swallows %s", ([, client]) =>
      withReporter(reporterLayer({}, client), (telemetry) =>
        Effect.gen(function* () {
          yield* telemetry.trackEvent("command:start");
          yield* telemetry.reportError(failure);
        }),
      ),
    );
  });

  describe("shutdown budget", () => {
    it.effect("interrupts every stalled send together once the shared budget elapses", () =>
      Effect.gen(function* () {
        const stalled = makeStalledHttpClient();
        const { scope, telemetry } = yield* openReporter(reporterLayer({}, stalled.client));
        yield* telemetry.trackEvent("command_invoked");
        yield* telemetry.trackEvent("product_activity_started");
        yield* telemetry.reportError(failure);
        yield* Effect.yieldNow;
        expect(stalled.counts.started).toBe(3);

        // The command runs on after its sends started; the budget counts from
        // release, not from each send.
        yield* TestClock.adjust("200 millis");
        expect(stalled.counts.interrupted).toBe(0);
        const released = yield* Ref.make(false);
        const closing = yield* Effect.forkChild(
          Scope.close(scope, Exit.void).pipe(Effect.andThen(Ref.set(released, true))),
        );
        yield* TestClock.adjust("249 millis");
        expect(yield* Ref.get(released)).toBe(false);
        expect(stalled.counts.interrupted).toBe(0);

        yield* TestClock.adjust("1 millis");
        yield* Fiber.join(closing);
        expect(yield* Ref.get(released)).toBe(true);
        expect(stalled.counts.interrupted).toBe(3);
      }),
    );

    it.effect("bounds a stalled identity load and the sends behind it by the same budget", () =>
      Effect.gen(function* () {
        const mock = makeMockHttpClient();
        const identity = { started: 0, interrupted: 0 };
        const stalledIdentityStorage = Layer.mergeAll(
          Path.layer,
          FileSystem.layerNoop({
            readFileString: () =>
              Effect.sync(() => {
                identity.started += 1;
              }).pipe(
                Effect.andThen(Effect.never),
                Effect.onInterrupt(() =>
                  Effect.sync(() => {
                    identity.interrupted += 1;
                  }),
                ),
              ),
          }),
        );
        const { scope, telemetry } = yield* openReporter(
          reporterLayer(
            { storedIdentity: true },
            mock.client,
            { AXM_USER_HOME: "/nonexistent-home" },
            stalledIdentityStorage,
          ),
        );
        yield* telemetry.trackEvent("command_invoked");
        yield* telemetry.trackEvent("product_activity_started");
        yield* telemetry.reportError(failure);
        yield* Effect.yieldNow;
        expect(identity.started).toBe(1);

        const released = yield* Ref.make(false);
        const closing = yield* Effect.forkChild(
          Scope.close(scope, Exit.void).pipe(Effect.andThen(Ref.set(released, true))),
        );
        yield* TestClock.adjust("249 millis");
        expect(yield* Ref.get(released)).toBe(false);

        yield* TestClock.adjust("1 millis");
        yield* Fiber.join(closing);
        expect(identity.interrupted).toBe(1);
        expect(mock.captured).toEqual([]);
      }),
    );

    it.effect("stops intake as soon as release begins", () =>
      Effect.gen(function* () {
        const stalled = makeStalledHttpClient();
        const { scope, telemetry } = yield* openReporter(reporterLayer({}, stalled.client));
        yield* telemetry.trackEvent("command_invoked");
        yield* Effect.yieldNow;
        expect(stalled.counts.started).toBe(1);

        const closing = yield* Effect.forkChild(Scope.close(scope, Exit.void));
        yield* TestClock.adjust("100 millis");
        // Release is still waiting on the stalled send; nothing new joins it.
        yield* telemetry.trackEvent("command_completed");
        yield* telemetry.reportError(failure);
        yield* Effect.yieldNow;
        expect(stalled.counts.started).toBe(1);

        yield* TestClock.adjust(TELEMETRY_SHUTDOWN_BUDGET);
        yield* Fiber.join(closing);
        yield* telemetry.reportError(failure);
        expect(stalled.counts).toEqual({ started: 1, interrupted: 1 });
      }),
    );

    it.effect("skips the wait when the invocation was interrupted", () =>
      Effect.gen(function* () {
        const stalled = makeStalledHttpClient();
        const { scope, telemetry } = yield* openReporter(reporterLayer({}, stalled.client));
        yield* telemetry.trackEvent("command_invoked");
        yield* telemetry.reportError(failure);
        yield* Effect.yieldNow;
        expect(stalled.counts.started).toBe(2);

        yield* Scope.close(scope, Exit.interrupt());

        expect(stalled.counts.interrupted).toBe(2);
      }),
    );
  });
});

describe("telemetry ingest contract decoding", () => {
  // The data-boundary specification decodes captured payloads with
  // `onExcessProperty: "error"`. This is that check checking itself: a field
  // the contract does not declare has to be rejected, or the specification's
  // "only these fields" evidence would prove nothing.
  it.effect("a field outside the contract is rejected by the closed decode", () =>
    Effect.gen(function* () {
      const widened = {
        eventId: EVENT_ID,
        invocationId: EVENT_ID,
        occurredAt: "2025-01-01T00:00:00.000Z",
        client: {
          name: "cli",
          version: "1.2.3",
          runtime: "bun",
          runtimeVersion: "1.2.3",
          platform: "linux",
          architecture: "x64",
          ci: false,
        },
        phase: "command",
        failure: {
          kind: "validation",
          operation: "runtime.command",
          category: "validation",
          class: "user",
          handled: true,
        },
        workspacePath: "/home/operator/project",
      };

      const outcome = yield* Schema.decodeUnknownEffect(TelemetryErrorReport)(widened, {
        onExcessProperty: "error",
      }).pipe(Effect.flip);

      expect(String(outcome)).toContain("workspacePath");
    }),
  );
});

describe("reporting client facts", () => {
  const client = { name: "cli", version: "1.2.3" };
  const encodeClient = Schema.encodeUnknownSync(TelemetryReportingClient);

  it.each([
    [{ node: "24.19.0" }, "node", "24.19.0"],
    [{ node: "24.19.0", bun: "1.4.0-canary.12+0a1b2c3" }, "bun", "1.4.0-canary.12+0a1b2c3"],
    [{ node: "24.19.0", bun: "1.4.0 (patched)" }, "bun", "unknown"],
    [{ node: "9".repeat(65) }, "node", "unknown"],
    [{}, "node", "unknown"],
  ])("carries runtime versions %j within the contract", (versions, runtime, runtimeVersion) => {
    const facts = reportingClientFacts(client, false, versions);
    expect(facts).toMatchObject({ runtime, runtimeVersion });
    expect(() => encodeClient(facts)).not.toThrow();
  });
});
