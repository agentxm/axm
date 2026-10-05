import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as HttpClient from "effect/http/HttpClient";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  captureTelemetry,
  makeUnavailableIdentityStorage,
  telemetryReporterLayer,
} from "../test-support/telemetry-harness.js";
import { at, expectRecord, property } from "../test-support/test-helpers.js";
import { TelemetryClient, type TelemetryClientService, TelemetryErrorReport } from "./index.js";

export const specification = defineSpecification({
  requirement: "system/security/telemetry-uses-anonymous-installation-identity",
  title: "Enabled telemetry uses random installation identity",
  statement:
    "When telemetry is enabled, AXM shall use a persisted random installation identity rather than a machine-derived identity, mark usage events anonymous, assign each usage event and error report a fresh retry-stable event identity, create no telemetry identity while collection is disabled, and, when identity storage is unavailable, send an eligible error report without an installation identity, skip usage events that require one, and never substitute a shared fallback identity.",
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

const decodeErrorReport = (input: unknown) =>
  Schema.decodeUnknownEffect(TelemetryErrorReport)(input, { onExcessProperty: "error" });

/**
 * One invocation's reporter resolving its identity from the given user home.
 * The reporter releases — flushing what it sent — before this returns.
 */
const invocation = <A>(
  home: string,
  client: HttpClient.HttpClient,
  use: (telemetry: TelemetryClientService) => Effect.Effect<A>,
  mode: "all" | "off" = "all",
) =>
  TelemetryClient.use(use).pipe(
    Effect.provide(
      telemetryReporterLayer({
        client,
        reporter: { mode, client: { name: "cli", version: "1.2.3" }, deliverInTest: true },
        environment: { AXM_USER_HOME: home },
      }),
    ),
  );

const reportFailure = (telemetry: TelemetryClientService) =>
  telemetry.reportError({
    phase: "command",
    kind: "not_found",
    category: "not_found",
    errorClass: "user",
    handled: true,
    command: "install",
  });

const onlyEvent = (body: unknown): Record<string, unknown> => {
  const events = property(expectRecord(body), "events");
  expect(Array.isArray(events)).toBe(true);
  if (!Array.isArray(events)) throw new Error("Expected telemetry events.");
  expect(events).toHaveLength(1);
  return expectRecord(at(events, 0));
};

const temporaryHome = Effect.acquireRelease(
  Effect.sync(() => nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-telemetry-"))),
  (home) => Effect.sync(() => nodeFs.rmSync(home, { recursive: true, force: true })),
);

describe("Anonymous telemetry identity", () => {
  it.effect("persists a random installation ID and assigns unique anonymous event IDs", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const home = yield* temporaryHome;
        const capture = captureTelemetry();
        yield* invocation(home, capture.client, (telemetry) =>
          telemetry.trackEvent("command_invoked"),
        );
        yield* invocation(home, capture.client, (telemetry) =>
          telemetry.trackEvent("command_completed").pipe(Effect.andThen(reportFailure(telemetry))),
        );

        const events = capture.requests.filter(({ url }) => url.endsWith("/v1/events"));
        const reports = capture.requests.filter(({ url }) => url.endsWith("/v1/errors"));
        expect(events).toHaveLength(2);
        expect(reports).toHaveLength(1);
        const firstEvent = onlyEvent(at(events, 0).body);
        const secondEvent = onlyEvent(at(events, 1).body);
        const report = yield* decodeErrorReport(at(reports, 0).body);
        const firstInstallationId = property(firstEvent, "distinctId");
        expect(typeof firstInstallationId).toBe("string");
        expect(String(firstInstallationId)).toMatch(installationIdPattern);
        expect(property(secondEvent, "distinctId")).toBe(firstInstallationId);
        expect(report.installationId).toBe(firstInstallationId);
        expect(property(firstEvent, "anonymous")).toBe(true);
        expect(property(secondEvent, "anonymous")).toBe(true);
        const eventIds = [
          property(firstEvent, "eventId"),
          property(secondEvent, "eventId"),
          report.eventId,
        ];
        expect(new Set(eventIds).size).toBe(eventIds.length);

        const persisted = nodeFs
          .readFileSync(nodePath.join(home, ".axm", "telemetry", "installation-id"), "utf8")
          .trim();
        expect(persisted).toBe(firstInstallationId);
      }),
    ),
  );

  it.effect("creates no installation identity while telemetry is disabled", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const home = yield* temporaryHome;
        const capture = captureTelemetry();
        yield* invocation(
          home,
          capture.client,
          (telemetry) =>
            telemetry.trackEvent("command_invoked").pipe(Effect.andThen(reportFailure(telemetry))),
          "off",
        );

        expect(capture.requests).toHaveLength(0);
        expect(nodeFs.existsSync(nodePath.join(home, ".axm", "telemetry"))).toBe(false);
      }),
    ),
  );

  it.effect(
    "reports a failure without an installation identity when identity storage is unavailable",
    () =>
      Effect.acquireUseRelease(
        Effect.sync(makeUnavailableIdentityStorage),
        (storage) =>
          Effect.gen(function* () {
            const capture = captureTelemetry();
            // Two invocations over the same unusable storage: neither invents an
            // identity, and nothing links them.
            const invocationIds = yield* Effect.forEach(
              ["first", "second"],
              () =>
                invocation(storage.userHome, capture.client, (telemetry) =>
                  telemetry
                    .trackEvent("command_invoked")
                    .pipe(
                      Effect.andThen(reportFailure(telemetry)),
                      Effect.as(telemetry.invocationId),
                    ),
                ),
              { concurrency: 1 },
            );

            // Usage events are attributed to an installation or not sent.
            expect(capture.requests.map(({ url }) => url.replace(/^.*\/v1\//u, "/v1/"))).toEqual([
              "/v1/errors",
              "/v1/errors",
            ]);
            const reports = [];
            for (const request of capture.requests) {
              const report = yield* decodeErrorReport(request.body);
              expect(report).not.toHaveProperty("installationId");
              reports.push(report);
            }
            expect(reports.map((report) => report.invocationId)).toEqual(invocationIds);
            expect(new Set(invocationIds).size).toBe(2);
            expect(new Set(reports.map((report) => report.eventId)).size).toBe(2);
            expect(JSON.stringify(capture.requests)).not.toContain("distinctId");
          }),
        (storage) => Effect.sync(storage.cleanup),
      ),
  );
});
