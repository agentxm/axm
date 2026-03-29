import { createHash } from "node:crypto";
import * as os from "node:os";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/ServiceMap";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { isCI } from "../cli-flags/index.js";
import { envWithDefault } from "../utils/index.js";
import * as GeneratedTelemetryClient from "./__generated__/telemetry-client.js";
import type { TelemetryMode } from "./mode.js";

export interface TelemetryClientService {
  readonly trackEvent: (event: string, properties?: Record<string, string>) => Effect.Effect<void>;
  readonly reportError: (error: {
    readonly name: string;
    readonly message: string;
    readonly details?: ReadonlyArray<string>;
    readonly howToFix?: string;
    readonly level: "error" | "fatal";
    readonly handled: boolean;
    readonly command: string;
  }) => Effect.Effect<void>;
}

export interface TelemetryClientOptions {
  readonly mode: TelemetryMode;
  readonly command: string;
  readonly client: {
    readonly name: string;
    readonly version: string;
  };
}

export class TelemetryClient extends ServiceMap.Service<TelemetryClient, TelemetryClientService>()(
  "@axm.sh/core/TelemetryClient",
) {}

export const TelemetryClientTest = Layer.succeed(TelemetryClient, {
  trackEvent: () => Effect.void,
  reportError: () => Effect.void,
});

const DEFAULT_BASE_URL = "https://t.agentxm.ai";

const swallowFailure = (effect: Effect.Effect<unknown, unknown, never>) =>
  effect.pipe(Effect.catchCause(() => Effect.void));

const fireAndForget = (effect: Effect.Effect<unknown, unknown, never>) =>
  effect.pipe(swallowFailure, Effect.forkDetach, Effect.asVoid);

const isTest = Effect.gen(function* () {
  const vitest = yield* envWithDefault("VITEST", "");
  const enableInTest = yield* envWithDefault("AXM_TELEMETRY_ENABLE_IN_TEST", "");
  return vitest === "true" && enableInTest !== "true";
});

const readBaseUrl = envWithDefault("AXM_TELEMETRY_BASE_URL", DEFAULT_BASE_URL);

const readRuntime = (): { readonly name: string; readonly version: string } => ({
  name: "bun",
  version: process.versions["bun"] ?? "unknown",
});

export const makeTelemetryClient = (
  options: TelemetryClientOptions,
): Effect.Effect<TelemetryClientService, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const inTest = yield* isTest;
    if (options.mode === "off" || inTest) {
      return {
        trackEvent: () => Effect.void,
        reportError: () => Effect.void,
      };
    }

    const httpClient = yield* HttpClient.HttpClient;
    const ci = yield* isCI;

    const context = {
      client: options.client,
      os: { name: process.platform, version: os.release() },
      runtime: readRuntime(),
      device: { arch: process.arch },
      ci,
    };

    const distinctId = createHash("sha256").update(os.hostname()).digest("hex");
    const baseUrl = yield* readBaseUrl;

    const client = GeneratedTelemetryClient.make(
      httpClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(baseUrl))),
    );

    const trackEvent: TelemetryClientService["trackEvent"] = (event, properties) => {
      if (options.mode === "errors") return Effect.void;

      const now = new Date().toISOString();
      const payload = {
        events: [
          {
            event,
            distinctId,
            timestamp: now,
            properties: properties ?? {},
          },
        ],
        sentAt: now,
        context,
      };

      return fireAndForget(client.EventsIngest({ payload })).pipe(
        Effect.withSpan("TelemetryClient.trackEvent"),
      );
    };

    const reportError: TelemetryClientService["reportError"] = (error) => {
      const now = new Date().toISOString();
      const payload = {
        errors: [{ message: error.message, name: error.name }],
        level: error.level,
        handled: error.handled,
        tags: { errorCode: error.name },
        fingerprint: [error.name],
        user: { id: distinctId },
        sentAt: now,
        context: { ...context, command: error.command || options.command },
      };

      return swallowFailure(client.ErrorsIngest({ payload })).pipe(
        Effect.withSpan("TelemetryClient.reportError"),
      );
    };

    return { trackEvent, reportError };
  });

export const TelemetryClientLive = (
  options: TelemetryClientOptions,
): Layer.Layer<TelemetryClient, never, HttpClient.HttpClient> =>
  Layer.effect(TelemetryClient, makeTelemetryClient(options));
