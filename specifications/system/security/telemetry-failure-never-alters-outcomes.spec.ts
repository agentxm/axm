import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";

import { TelemetryClient, TelemetryClientLive } from "@agentxm/client-core/unstable/telemetry";

import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "system/security/telemetry-failure-never-alters-outcomes",
  title: "Telemetry collection or delivery failure is invisible to the operation",
  class: "functional",
  intents: ["privacy-and-consent", "safe-repetition"],
  methods: ["example"],
});

const telemetryOver = (client: HttpClient.HttpClient) =>
  TelemetryClient.pipe(
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

describe("Telemetry failure isolation", () => {
  // The live client short-circuits under the test runner; disable that guard
  // so the real delivery path runs against the controlled transport.
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

  it.effect("a crashing transport never fails the requested operation", () =>
    Effect.gen(function* () {
      const crashingClient = HttpClient.make(() => Effect.die("network failure"));
      const telemetry = yield* telemetryOver(crashingClient);

      yield* telemetry.trackEvent("command:start");
      yield* telemetry.reportError({
        name: "ERR",
        message: "message",
        level: "error",
        errorClass: "user",
        handled: true,
        command: "install",
      });
      // Reaching this point is the claim: neither call failed, defected, or
      // changed the effect's outcome.
      expect(true).toBe(true);
    }),
  );

  it.effect("a rejecting transport never fails the requested operation", () =>
    Effect.gen(function* () {
      const rejectingClient = HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(request, new Response("unavailable", { status: 503 })),
        ),
      );
      const telemetry = yield* telemetryOver(rejectingClient);

      yield* telemetry.trackEvent("command:start");
      expect(true).toBe(true);
    }),
  );
});
