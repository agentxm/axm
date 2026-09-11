import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { defineSpecification } from "@agentxm/specification-metadata";

import { at, expectRecord, property } from "../test-support/test-helpers.js";
import { TelemetryClient, TelemetryClientLive } from "./client.js";

export const specification = defineSpecification({
  requirement: "system/security/telemetry-uses-anonymous-installation-identity",
  title: "Enabled telemetry uses anonymous random installation identity",
  statement:
    "When an operator enables telemetry, AXM shall use a persisted random installation identity rather than a machine-derived identity, mark usage events anonymous, assign each usage event a fresh retry-stable event identity, and create no telemetry identity while collection is disabled.",
  class: "quality",
  characteristic: "privacy",
  role: "interface",
  goals: ["privacy-and-consent"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const installationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const makeCaptureClient = () => {
  const bodies: Array<Record<string, unknown>> = [];
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      const body =
        request.body._tag === "Uint8Array"
          ? expectRecord(JSON.parse(new TextDecoder().decode(request.body.body)))
          : {};
      bodies.push(body);
      return HttpClientResponse.fromWeb(request, new Response("", { status: 202 }));
    }),
  );
  return { bodies, client };
};

const telemetryFor = (home: string, client: HttpClient.HttpClient, mode: "all" | "off" = "all") => {
  const platform = Layer.mergeAll(
    NodeServices.layer,
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } })),
  );
  return TelemetryClient.pipe(
    Effect.provide(
      Layer.provide(
        TelemetryClientLive({
          mode,
          command: "install",
          client: { name: "cli", version: "1.2.3" },
          deliverInTest: true,
          host: { osRelease: () => "synthetic-release" },
        }),
        Layer.mergeAll(platform, Layer.succeed(HttpClient.HttpClient, client)),
      ),
    ),
  );
};

const onlyEvent = (body: Record<string, unknown>): Record<string, unknown> => {
  const events = property(body, "events");
  expect(Array.isArray(events)).toBe(true);
  if (!Array.isArray(events)) throw new Error("Expected telemetry events.");
  expect(events).toHaveLength(1);
  return expectRecord(at(events, 0));
};

describe("Anonymous telemetry identity", () => {
  it.effect("persists a random installation ID and assigns unique anonymous event IDs", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-telemetry-"))),
      (home) =>
        Effect.gen(function* () {
          const capture = makeCaptureClient();
          const first = yield* telemetryFor(home, capture.client);
          yield* first.trackEvent("command_invoked", undefined, { bounded: true });

          const second = yield* telemetryFor(home, capture.client);
          yield* second.trackEvent("command_completed", undefined, { bounded: true });

          expect(capture.bodies).toHaveLength(2);
          const firstEvent = onlyEvent(at(capture.bodies, 0));
          const secondEvent = onlyEvent(at(capture.bodies, 1));
          const firstInstallationId = property(firstEvent, "distinctId");
          const secondInstallationId = property(secondEvent, "distinctId");
          expect(typeof firstInstallationId).toBe("string");
          expect(firstInstallationId).toBe(secondInstallationId);
          expect(String(firstInstallationId)).toMatch(installationIdPattern);
          expect(property(firstEvent, "anonymous")).toBe(true);
          expect(property(secondEvent, "anonymous")).toBe(true);
          expect(property(firstEvent, "eventId")).not.toBe(property(secondEvent, "eventId"));

          const persisted = nodeFs
            .readFileSync(nodePath.join(home, ".axm", "telemetry", "installation-id"), "utf8")
            .trim();
          expect(persisted).toBe(firstInstallationId);
        }),
      (home) => Effect.sync(() => nodeFs.rmSync(home, { recursive: true, force: true })),
    ),
  );

  it.effect("creates no installation identity while telemetry is disabled", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-telemetry-"))),
      (home) =>
        Effect.gen(function* () {
          const capture = makeCaptureClient();
          const telemetry = yield* telemetryFor(home, capture.client, "off");
          yield* telemetry.trackEvent("command_invoked", undefined, { bounded: true });

          expect(capture.bodies).toHaveLength(0);
          expect(nodeFs.existsSync(nodePath.join(home, ".axm", "telemetry"))).toBe(false);
        }),
      (home) => Effect.sync(() => nodeFs.rmSync(home, { recursive: true, force: true })),
    ),
  );
});
