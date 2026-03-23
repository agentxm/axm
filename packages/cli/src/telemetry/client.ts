/**
 * Telemetry client service.
 *
 * Sends anonymous usage events and error reports to the telemetry API.
 * All network calls are fire-and-forget daemon fibers that silently
 * swallow failures so they never impact the CLI user experience.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { createHash } from "node:crypto";
import * as os from "node:os";
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import type { TelemetryMode } from "./mode.js";
import { loadVersion } from "../version.js";
import { CliEnvConfig } from "../config/index.js";

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

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

export class TelemetryClient extends ServiceMap.Service<
  TelemetryClient,
  TelemetryClientService
>()("@axm.sh/cli/TelemetryClient") {}

// ---------------------------------------------------------------------------
// No-op / test layer
// ---------------------------------------------------------------------------

export const TelemetryClientTest = Layer.succeed(TelemetryClient, {
  trackEvent: () => Effect.void,
  reportError: () => Effect.void,
});

// ---------------------------------------------------------------------------
// Fire-and-forget helper
// ---------------------------------------------------------------------------

const fireAndForget = (effect: Effect.Effect<unknown, unknown, never>) =>
  effect.pipe(
    Effect.catchCause(() => Effect.void),
    Effect.forkDetach,
    Effect.asVoid,
  );

// ---------------------------------------------------------------------------
// Live layer factory
// ---------------------------------------------------------------------------

const BASE_URL = "https://t.agentxm.ai";

export const TelemetryClientLive = (
  mode: TelemetryMode,
  command: string,
): Layer.Layer<TelemetryClient, never, HttpClient.HttpClient | CliEnvConfig> => {
  // mode "off" → no-op
  if (mode === "off") {
    return TelemetryClientTest;
  }

  return Layer.effect(
    TelemetryClient,
    Effect.gen(function* () {
      const envConfig = yield* CliEnvConfig;

      // D4: VITEST guard moved inside Layer.effect body
      if (envConfig.vitest === "true") {
        return { trackEvent: () => Effect.void, reportError: () => Effect.void };
      }

      const httpClient = yield* HttpClient.HttpClient;

      const context = {
        client: { name: "cli", version: loadVersion() },
        os: { name: process.platform, version: os.release() },
        runtime: { name: "bun", version: process.versions["bun"] ?? "unknown" },
        device: { arch: process.arch },
        ci: envConfig.ci === "true",
      };

      const distinctId = createHash("sha256").update(os.hostname()).digest("hex");

      const trackEvent: TelemetryClientService["trackEvent"] = (event, properties) => {
        // mode "errors" → skip events
        if (mode === "errors") return Effect.void;

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
          httpClient.execute(
            HttpClientRequest.post(`${BASE_URL}/events`).pipe(
              HttpClientRequest.setBody(HttpBody.jsonUnsafe(body)),
            ),
          ),
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
          context: { ...context, command },
        };

        return fireAndForget(
          httpClient.execute(
            HttpClientRequest.post(`${BASE_URL}/errors`).pipe(
              HttpClientRequest.setBody(HttpBody.jsonUnsafe(body)),
            ),
          ),
        ).pipe(Effect.withSpan("TelemetryClient.reportError"));
      };

      return { trackEvent, reportError };
    }),
  );
};
