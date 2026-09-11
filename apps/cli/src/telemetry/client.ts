// @effect-diagnostics anyUnknownInErrorContext:off — telemetry is a best-effort boundary over generated opaque transport failures
import { randomUUID } from "node:crypto";
import * as os from "node:os";
import { resolveUserAxmHome } from "@agentxm/workspace-state";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/Context";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { isCI } from "../utils/environment.js";
import { envWithDefault } from "../utils/index.js";
import * as GeneratedTelemetryClient from "./__generated__/telemetry-client.js";
import type { TelemetryMode } from "./mode.js";

export type TelemetryPropertyValue = string | number | boolean | null;
export type TelemetryProperties = Record<string, TelemetryPropertyValue>;
export type TelemetryErrorClass = "internal" | "user" | "external";

export interface TelemetryClientService {
  readonly trackEvent: (
    event: string,
    properties?: TelemetryProperties,
    options?: {
      /** Await the send (bounded) so the event lands before process exit. */
      readonly bounded?: boolean;
    },
  ) => Effect.Effect<void>;
  readonly reportError: (error: {
    readonly name: string;
    readonly category?: string;
    readonly level: "error" | "fatal";
    readonly errorClass: TelemetryErrorClass;
    readonly handled: boolean;
    readonly command: string;
  }) => Effect.Effect<void>;
}

/**
 * The host facts telemetry observes. It is a port because observing the host
 * is a native boundary that can fail, and a failure there must be invisible
 * to the command — which is only demonstrable when the failure can be stated.
 */
export interface TelemetryHostObservation {
  readonly osRelease: () => string;
}

export const nodeTelemetryHost: TelemetryHostObservation = {
  osRelease: () => os.release(),
};

export interface TelemetryClientOptions {
  readonly mode: TelemetryMode;
  readonly command: string;
  readonly client: {
    readonly name: string;
    readonly version: string;
  };
  /**
   * Deliver even while the repository's own test run is executing. Delivery
   * is suppressed under Vitest so no test reaches the telemetry service; a
   * specification that observes delivery asks for it explicitly here.
   */
  readonly deliverInTest?: boolean;
  /** Where non-identifying operating-system facts come from. */
  readonly host?: TelemetryHostObservation;
  /** Deterministic test seam; production persists a random installation ID. */
  readonly installationId?: string;
  /** Deterministic test seam; production assigns a fresh event ID per event. */
  readonly eventIdFactory?: () => string;
}

export class TelemetryClient extends ServiceMap.Service<TelemetryClient, TelemetryClientService>()(
  "axm.sh/telemetry/client/TelemetryClient",
) {}

const disabledTelemetry: TelemetryClientService = {
  trackEvent: () => Effect.void,
  reportError: () => Effect.void,
};

export const TelemetryClientTest = Layer.succeed(TelemetryClient, disabledTelemetry);

const DEFAULT_BASE_URL = "https://t.agentxm.ai";
export const TELEMETRY_EVENT_TIMEOUT = "250 millis";

const swallowFailure = (effect: Effect.Effect<unknown, unknown, never>) =>
  effect.pipe(Effect.catchCause(() => Effect.void));

const fireAndForget = (effect: Effect.Effect<unknown, unknown, never>) =>
  effect.pipe(
    Effect.timeoutOption(TELEMETRY_EVENT_TIMEOUT),
    swallowFailure,
    Effect.asVoid,
    Effect.forkDetach,
    Effect.asVoid,
  );

const isTest = (options: TelemetryClientOptions) =>
  Effect.gen(function* () {
    if (options.deliverInTest === true) return false;
    const vitest = yield* envWithDefault("VITEST", "");
    return vitest === "true";
  });

const readBaseUrl = envWithDefault("AXM_TELEMETRY_BASE_URL", DEFAULT_BASE_URL);

const readRuntime = (): { readonly name: string; readonly version: string } => ({
  name: "bun",
  version: process.versions["bun"] ?? "unknown",
});

const INSTALLATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const readInstallationId = (fs: FileSystem.FileSystem, filePath: string) =>
  fs.readFileString(filePath).pipe(
    Effect.map((value) => value.trim()),
    Effect.filterOrFail((value) => INSTALLATION_ID_PATTERN.test(value)),
  );

const loadOrCreateInstallationId = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const axmHome = yield* resolveUserAxmHome();
  const directory = path.join(axmHome, "telemetry");
  const filePath = path.join(directory, "installation-id");
  const existing = yield* readInstallationId(fs, filePath).pipe(Effect.option);
  if (Option.isSome(existing)) return existing.value;

  yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 });
  const candidate = randomUUID();
  const created = yield* fs
    .writeFileString(filePath, `${candidate}\n`, { flag: "wx", mode: 0o600 })
    .pipe(Effect.result);
  if (created._tag === "Success") return candidate;
  if (created.failure.reason._tag === "AlreadyExists") {
    return yield* readInstallationId(fs, filePath);
  }
  return yield* Effect.fail(created.failure);
});

export const makeTelemetryClient = (
  options: TelemetryClientOptions,
): Effect.Effect<
  TelemetryClientService,
  never,
  HttpClient.HttpClient | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const inTest = yield* isTest(options);
    if (options.mode === "off" || inTest) {
      return disabledTelemetry;
    }

    const httpClient = yield* HttpClient.HttpClient;
    const ci = yield* isCI;
    const host = options.host ?? nodeTelemetryHost;

    const context = {
      client: options.client,
      os: { name: process.platform, version: host.osRelease() },
      runtime: readRuntime(),
      device: { arch: process.arch },
      ci,
    };

    const distinctId = options.installationId ?? (yield* loadOrCreateInstallationId);
    const eventIdFactory = options.eventIdFactory ?? randomUUID;
    const baseUrl = yield* readBaseUrl;

    const client = GeneratedTelemetryClient.make(
      httpClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(baseUrl))),
    );

    const trackEvent: TelemetryClientService["trackEvent"] = (event, properties, sendOptions) => {
      if (options.mode === "errors") return Effect.void;

      return Effect.gen(function* () {
        const now = DateTime.formatIso(yield* DateTime.now);
        const payload = {
          events: [
            {
              eventId: eventIdFactory(),
              event,
              distinctId,
              timestamp: now,
              properties: properties ?? {},
              anonymous: true,
            },
          ],
          sentAt: now,
          context,
        };

        const send = client.EventsIngest({ payload });
        // A bounded send completes (or times out) before the caller proceeds,
        // so a terminal event lands before process exit on die paths too.
        if (sendOptions?.bounded === true) {
          return yield* send.pipe(
            Effect.timeoutOption(TELEMETRY_EVENT_TIMEOUT),
            swallowFailure,
            Effect.asVoid,
          );
        }
        return yield* fireAndForget(send);
      }).pipe(swallowFailure, Effect.withSpan("TelemetryClient.trackEvent"));
    };

    // Await error delivery before exit, but bound both transport and collection.
    const reportError: TelemetryClientService["reportError"] = (error) =>
      Effect.gen(function* () {
        const now = DateTime.formatIso(yield* DateTime.now);
        const payload = {
          errors: [
            {
              // Free text can contain package content or secrets even after
              // credential-pattern redaction. Only the category crosses here.
              message: error.name,
              name: error.name,
            },
          ],
          level: error.level,
          errorClass: error.errorClass,
          handled: error.handled,
          tags: {
            errorCode: error.name,
            ...(error.category !== undefined ? { errorCategory: error.category } : {}),
          },
          fingerprint: [error.name],
          user: { id: distinctId },
          sentAt: now,
          context: { ...context, command: error.command || options.command },
        };

        return yield* client.ErrorsIngest({ payload });
      }).pipe(
        Effect.timeoutOption(TELEMETRY_EVENT_TIMEOUT),
        swallowFailure,
        Effect.asVoid,
        Effect.withSpan("TelemetryClient.reportError"),
      );

    return { trackEvent, reportError };
  }).pipe(Effect.catchCause(() => Effect.succeed(disabledTelemetry)));

export const TelemetryClientLive = (
  options: TelemetryClientOptions,
): Layer.Layer<TelemetryClient, never, HttpClient.HttpClient | FileSystem.FileSystem | Path.Path> =>
  Layer.effect(TelemetryClient, makeTelemetryClient(options));
