import { createHash } from "node:crypto";
import * as os from "node:os";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/ServiceMap";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
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
  readonly runtime: {
    readonly name: string;
    readonly version: string;
  };
  readonly ci: boolean;
  readonly test?: boolean;
  readonly baseUrl?: string;
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

export const makeTelemetryClient = (
  options: TelemetryClientOptions,
): Effect.Effect<TelemetryClientService, never, HttpClient.HttpClient> => {
  if (options.mode === "off" || options.test === true) {
    return Effect.succeed({
      trackEvent: () => Effect.void,
      reportError: () => Effect.void,
    });
  }

  return Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;

    const context = {
      client: options.client,
      os: { name: process.platform, version: os.release() },
      runtime: options.runtime,
      device: { arch: process.arch },
      ci: options.ci,
    };

    const distinctId = createHash("sha256").update(os.hostname()).digest("hex");
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

    const trackEvent: TelemetryClientService["trackEvent"] = (event, properties) => {
      if (options.mode === "errors") return Effect.void;

      const now = new Date().toISOString();
      const body = {
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

      return fireAndForget(
        httpClient
          .execute(
            HttpClientRequest.post(`${baseUrl}/events`).pipe(
              HttpClientRequest.setBody(HttpBody.jsonUnsafe(body)),
            ),
          )
          .pipe(Effect.asVoid),
      ).pipe(Effect.withSpan("TelemetryClient.trackEvent"));
    };

    const reportError: TelemetryClientService["reportError"] = (error) => {
      const now = new Date().toISOString();
      const body = {
        errors: [{ message: error.message, name: error.name }],
        level: error.level,
        handled: error.handled,
        tags: { errorCode: error.name },
        fingerprint: [error.name],
        user: { id: distinctId },
        sentAt: now,
        context: { ...context, command: error.command || options.command },
      };

      return swallowFailure(
        httpClient
          .execute(
            HttpClientRequest.post(`${baseUrl}/errors`).pipe(
              HttpClientRequest.setBody(HttpBody.jsonUnsafe(body)),
            ),
          )
          .pipe(Effect.asVoid),
      ).pipe(Effect.withSpan("TelemetryClient.reportError"));
    };

    return { trackEvent, reportError };
  });
};

export const TelemetryClientLive = (
  options: TelemetryClientOptions,
): Layer.Layer<TelemetryClient, never, HttpClient.HttpClient> =>
  Layer.effect(TelemetryClient, makeTelemetryClient(options));
