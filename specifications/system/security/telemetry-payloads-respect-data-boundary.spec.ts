import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";

import { TelemetryClient, TelemetryClientLive } from "@agentxm/client-core/unstable/telemetry";

import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "system/security/telemetry-payloads-respect-data-boundary",
  title: "Telemetry payloads carry only the documented observation fields",
  class: "security",
  intents: ["privacy-and-consent"],
  methods: ["golden-output"],
});

/**
 * The documented telemetry data boundary: observation identity, timing, and
 * command context. Extension content, authored instructions and knowledge,
 * credentials, and resolved secret values have no field to travel in.
 */
const ALLOWED_EVENT_FIELDS = [
  "anonymous",
  "distinctId",
  "event",
  "groups",
  "properties",
  "sessionId",
  "timestamp",
  "userProperties",
] as const;

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

  it.effect("event payloads expose exactly the documented field surface", () =>
    Effect.gen(function* () {
      const { client, captured } = captureClient();
      const telemetry = yield* TelemetryClient.pipe(
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

      yield* telemetry.trackEvent("command:start");
      yield* Effect.yieldNow;
      const [request] = captured;
      expect(request).toBeDefined();
      const body = request?.body;
      expect(body).toBeDefined();
      if (typeof body !== "object" || body === null) {
        throw new Error("Expected a JSON object payload");
      }
      const events: unknown = "events" in body ? body.events : [body];
      const eventList = Array.isArray(events) ? events : [events];
      for (const event of eventList) {
        if (typeof event !== "object" || event === null) {
          throw new Error("Expected event object");
        }
        for (const key of Object.keys(event)) {
          expect(ALLOWED_EVENT_FIELDS).toContain(key);
        }
      }
    }),
  );
});
