import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { defineSpecification } from "@agentxm/specification-metadata";

import { expectRecord, property } from "../test-support/test-helpers.js";
import { captureTelemetry, makeTelemetryOperation } from "../test-support/telemetry-harness.js";

export const specification = defineSpecification({
  requirement: "cli/telemetry/product-activity-events-represent-usable-outcomes",
  title: "Product activity events represent usable outcomes",
  statement:
    "When an operator opts in to usage telemetry, an eligible applied product activity shall emit one linked start and finish lifecycle, shall mark activation only after a real usable install or enabling configuration changed durable state, shall exclude preview, no-op, cancellation, failure, and publication from consumer activation, and shall not let a retry reset the cohort boundary.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "privacy-and-consent"],
  methods: ["contract", "decision-table", "example"],
  derivedFrom: ["system/security/telemetry-consent-and-precedence"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

interface CapturedEvent {
  readonly event: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

const capturedEvents = (
  requests: ReadonlyArray<{ readonly body: unknown }>,
): ReadonlyArray<CapturedEvent> =>
  requests.flatMap(({ body }) => {
    const batch = expectRecord(body);
    if (!("events" in batch)) return [];
    const events = batch["events"];
    if (!Array.isArray(events)) throw new Error("Expected telemetry event batch");
    return events.map((event) => {
      const record = expectRecord(event);
      const name = property(record, "event");
      if (typeof name !== "string") throw new Error("Expected telemetry event name");
      return { event: name, properties: expectRecord(property(record, "properties")) };
    });
  });

const byName = (events: ReadonlyArray<CapturedEvent>, name: string): CapturedEvent => {
  const event = events.find((candidate) => candidate.event === name);
  if (event === undefined) throw new Error(`Missing ${name}`);
  return event;
};

describe("Purposeful product activity telemetry", () => {
  it.effect("records a successful install as linked value and activation evidence", () => {
    const operation = makeTelemetryOperation();
    const capture = captureTelemetry();
    return Effect.acquireUseRelease(
      Effect.succeed(operation),
      (operation) =>
        Effect.gen(function* () {
          const result = yield* operation.run({ client: capture.client });
          expect(result.exitCode).toBe(0);

          const events = capturedEvents(capture.requests);
          const started = byName(events, "product_activity_started");
          const finished = byName(events, "product_activity_finished");
          expect(started.properties["product.activity"]).toBe("install");
          expect(started.properties["product.activation_eligible"]).toBe(true);
          expect(finished.properties["product.activity_id"]).toBe(
            started.properties["product.activity_id"],
          );
          expect(finished.properties["product.value_completed"]).toBe(true);
          expect(finished.properties["product.activation_completed"]).toBe(true);
          expect(finished.properties["cli.outcome"]).toBe("applied");
          const appliedCount = finished.properties["cli.applied_count"];
          expect(typeof appliedCount).toBe("number");
          if (typeof appliedCount === "number") expect(appliedCount).toBeGreaterThan(0);
        }),
      (operation) => Effect.sync(operation.cleanup),
    );
  });

  it.effect("does not start a product lifecycle for a preview", () => {
    const operation = makeTelemetryOperation();
    const capture = captureTelemetry();
    return Effect.acquireUseRelease(
      Effect.succeed(operation),
      (operation) =>
        Effect.gen(function* () {
          const result = yield* operation.run({ client: capture.client, preview: true });
          expect(result.exitCode).toBe(0);
          expect(
            capturedEvents(capture.requests)
              .map(({ event }) => event)
              .filter((event) => event.startsWith("product_activity_")),
          ).toEqual([]);
        }),
      (operation) => Effect.sync(operation.cleanup),
    );
  });

  it.effect("retains a failed attempt without reporting value or activation", () => {
    const operation = makeTelemetryOperation();
    const capture = captureTelemetry();
    return Effect.acquireUseRelease(
      Effect.succeed(operation),
      (operation) =>
        Effect.gen(function* () {
          const result = yield* operation.run({ client: capture.client, fail: true });
          expect(result.exitCode).not.toBe(0);

          const events = capturedEvents(capture.requests);
          const started = byName(events, "product_activity_started");
          const finished = byName(events, "product_activity_finished");
          expect(finished.properties["product.activity_id"]).toBe(
            started.properties["product.activity_id"],
          );
          expect(finished.properties["product.value_completed"]).toBe(false);
          expect(finished.properties["product.activation_completed"]).toBe(false);
          expect(finished.properties["cli.result"]).toBe("error");
        }),
      (operation) => Effect.sync(operation.cleanup),
    );
  });
});
