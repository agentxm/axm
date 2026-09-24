import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { makeOperationLifecycle } from "@agentxm/workspace/transitions/planning";

import { TelemetryClient, type TelemetryClientService } from "../telemetry/index.js";
import type { TelemetryProperties } from "../telemetry/client.js";
import {
  recordCommandSettlement,
  trackCliCommand,
  trackCliCommandCompleted,
  CommandSemanticProperties,
  CommandSemanticPropertiesLive,
  ProductActivityLive,
  setCommandSemanticProperties,
  getCommandSemanticProperties,
  observeLifecycleForTelemetry,
  startProductActivity,
} from "./telemetry.js";

interface Capture {
  readonly events: Array<{ event: string; properties?: TelemetryProperties }>;
  readonly errors: Array<{
    name: string;
    category?: string;
    level: "error" | "fatal";
    errorClass: "internal" | "user" | "external";
    handled: boolean;
    command: string;
  }>;
}

const makeCaptureLayer = (): readonly [Layer.Layer<TelemetryClient>, Capture] => {
  const capture: Capture = { events: [], errors: [] };
  const layer = Layer.succeed(TelemetryClient, {
    trackEvent: (event, properties) =>
      Effect.sync(() => {
        capture.events.push({ event, ...(properties !== undefined && { properties }) });
      }),
    reportError: (error) =>
      Effect.sync(() => {
        capture.errors.push({
          name: error.name,
          ...(error.category === undefined ? {} : { category: error.category }),
          level: error.level,
          errorClass: error.errorClass,
          handled: error.handled,
          command: error.command,
        });
      }),
  } satisfies TelemetryClientService);

  return [layer, capture] as const;
};

describe("cli telemetry helpers", () => {
  it.effect("tracks command invocation with merged command property", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();

      yield* trackCliCommand({
        command: "skills install",
        properties: { scope: "project" },
      }).pipe(Effect.provide(layer));

      expect(capture.events).toEqual([
        {
          event: "command_invoked",
          properties: { "cli.command": "skills install", scope: "project" },
        },
      ]);
    }),
  );

  it.effect("settles a handled failure as one error report and one completion event", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();

      yield* recordCommandSettlement({
        command: "setup",
        result: "error",
        durationMs: 42,
        failure: { code: "not_found", level: "error", handled: true },
        semanticProperties: { "cli.outcome": "failed" },
      }).pipe(Effect.provide(layer));

      expect(capture.errors).toEqual([
        {
          name: "not_found",
          category: "not_found",
          level: "error",
          errorClass: "user",
          handled: true,
          command: "setup",
        },
      ]);
      expect(capture.events).toEqual([
        {
          event: "command_completed",
          properties: {
            "cli.command": "setup",
            "cli.result": "error",
            "cli.duration_ms": 42,
            "cli.error_code": "not_found",
            "cli.error_category": "not_found",
            "cli.outcome": "failed",
          },
        },
      ]);
    }),
  );

  it.effect("settles a defect as a fatal, unhandled report of its category", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();

      yield* recordCommandSettlement({
        command: "skills list",
        result: "defect",
        durationMs: 7,
        failure: { code: "internal", level: "fatal", handled: false },
      }).pipe(Effect.provide(layer));

      expect(capture.errors).toEqual([
        {
          name: "Defect",
          level: "fatal",
          errorClass: "internal",
          handled: false,
          command: "skills list",
        },
      ]);
      expect(
        capture.events.map(({ event, properties }) => [event, properties?.["cli.result"]]),
      ).toEqual([["command_completed", "defect"]]);
    }),
  );

  it.effect("settles a cancellation and a success without an error report", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();

      yield* recordCommandSettlement({ command: "setup", result: "cancelled", durationMs: 1 }).pipe(
        Effect.provide(layer),
      );
      yield* recordCommandSettlement({ command: "setup", result: "success", durationMs: 1 }).pipe(
        Effect.provide(layer),
      );

      expect(capture.errors).toHaveLength(0);
      expect(capture.events.map(({ properties }) => properties?.["cli.result"])).toEqual([
        "cancelled",
        "success",
      ]);
    }),
  );

  it.effect("swallows a reporting failure so the settlement never fails the command", () =>
    Effect.gen(function* () {
      const layer = Layer.succeed(TelemetryClient, {
        trackEvent: () => Effect.die(new Error("transport down")),
        reportError: () => Effect.die(new Error("transport down")),
      } satisfies TelemetryClientService);

      yield* recordCommandSettlement({
        command: "setup",
        result: "error",
        durationMs: 1,
        failure: { code: "network", level: "error", handled: true },
      }).pipe(Effect.provide(layer));
    }),
  );

  it.effect("trackCliCommandCompleted emits success event", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();

      yield* trackCliCommandCompleted({
        command: "skills install",
        result: "success",
        durationMs: 1234,
      }).pipe(Effect.provide(layer));

      expect(capture.events).toEqual([
        {
          event: "command_completed",
          properties: {
            "cli.command": "skills install",
            "cli.result": "success",
            "cli.duration_ms": 1234,
          },
        },
      ]);
    }),
  );

  it.effect("trackCliCommandCompleted includes error_code on failure", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();

      yield* trackCliCommandCompleted({
        command: "skills install",
        result: "error",
        durationMs: 567,
        errorCode: "SOURCE_CLONE_FAILED",
      }).pipe(Effect.provide(layer));

      expect(capture.events).toEqual([
        {
          event: "command_completed",
          properties: {
            "cli.command": "skills install",
            "cli.result": "error",
            "cli.duration_ms": 567,
            "cli.error_code": "SOURCE_CLONE_FAILED",
          },
        },
      ]);
    }),
  );

  it.effect("trackCliCommandCompleted omits error_code when absent", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();

      yield* trackCliCommandCompleted({
        command: "setup",
        result: "cancelled",
        durationMs: 100,
      }).pipe(Effect.provide(layer));

      expect(capture.events[0]?.properties).not.toHaveProperty("cli.error_code");
    }),
  );

  it.effect("trackCliCommandCompleted sends cli.duration_ms as a number", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();

      yield* trackCliCommandCompleted({
        command: "skills list",
        result: "success",
        durationMs: 789,
      }).pipe(Effect.provide(layer));

      expect(capture.events).toHaveLength(1);
      const props = capture.events[0]?.properties;
      expect(props?.["cli.duration_ms"]).toBe(789);
      expect(typeof props?.["cli.duration_ms"]).toBe("number");
    }),
  );

  it.effect("trackCliCommandCompleted merges semantic properties when provided", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();

      yield* trackCliCommandCompleted({
        command: "skills install",
        result: "success",
        durationMs: 500,
        semanticProperties: {
          "cli.outcome": "applied",
          "cli.subject_type": "skill",
          "cli.applied_count": 2,
        },
      }).pipe(Effect.provide(layer));

      expect(capture.events).toHaveLength(1);
      const props = capture.events[0]?.properties;
      expect(props?.["cli.outcome"]).toBe("applied");
      expect(props?.["cli.subject_type"]).toBe("skill");
      expect(props?.["cli.applied_count"]).toBe(2);
      // Standard fields still present
      expect(props?.["cli.command"]).toBe("skills install");
      expect(props?.["cli.result"]).toBe("success");
      expect(props?.["cli.duration_ms"]).toBe(500);
    }),
  );
});

describe("purposeful product lifecycle", () => {
  it.effect("links an eligible install start to a genuine usable completion", () =>
    Effect.gen(function* () {
      const [captureLayer, capture] = makeCaptureLayer();
      const layer = Layer.mergeAll(captureLayer, ProductActivityLive);

      yield* Effect.gen(function* () {
        yield* startProductActivity({ activity: "install", activationEligible: true });
        yield* trackCliCommandCompleted({
          command: "skills install",
          result: "success",
          durationMs: 250,
          semanticProperties: { "cli.outcome": "applied", "cli.applied_count": 1 },
        });
      }).pipe(Effect.provide(layer));

      expect(capture.events.map(({ event }) => event)).toEqual([
        "product_activity_started",
        "product_activity_finished",
      ]);
      const started = capture.events[0]?.properties;
      const finished = capture.events[1]?.properties;
      expect(started?.["product.contract_version"]).toBe(1);
      expect(started?.["product.activity"]).toBe("install");
      expect(started?.["product.activation_eligible"]).toBe(true);
      expect(typeof started?.["product.activity_id"]).toBe("string");
      expect(finished?.["product.activity_id"]).toBe(started?.["product.activity_id"]);
      expect(finished?.["product.value_completed"]).toBe(true);
      expect(finished?.["product.activation_completed"]).toBe(true);
    }),
  );

  it.effect("does not relabel no-op, cancellation, or failure as value", () =>
    Effect.forEach(
      [
        { result: "success", outcome: "no-op", appliedCount: 0 },
        { result: "cancelled", outcome: "cancelled", appliedCount: 0 },
        { result: "error", outcome: "failed", appliedCount: 0 },
      ] satisfies ReadonlyArray<{
        readonly result: "success" | "cancelled" | "error";
        readonly outcome: "no-op" | "cancelled" | "failed";
        readonly appliedCount: number;
      }>,
      ({ result, outcome, appliedCount }) =>
        Effect.gen(function* () {
          const [captureLayer, capture] = makeCaptureLayer();
          yield* Effect.gen(function* () {
            yield* startProductActivity({ activity: "configure", activationEligible: true });
            yield* trackCliCommandCompleted({
              command: "skills enable",
              result,
              durationMs: 25,
              semanticProperties: {
                "cli.outcome": outcome,
                "cli.applied_count": appliedCount,
              },
            });
          }).pipe(Effect.provide(Layer.mergeAll(captureLayer, ProductActivityLive)));

          const finished = capture.events[1]?.properties;
          expect(finished?.["product.value_completed"]).toBe(false);
          expect(finished?.["product.activation_completed"]).toBe(false);
        }),
      { concurrency: 1 },
    ),
  );

  it.effect("keeps publication as value without treating it as consumer activation", () =>
    Effect.gen(function* () {
      const [captureLayer, capture] = makeCaptureLayer();
      yield* Effect.gen(function* () {
        yield* startProductActivity({ activity: "publish", activationEligible: false });
        yield* startProductActivity({ activity: "install", activationEligible: true });
        yield* trackCliCommandCompleted({
          command: "publish",
          result: "success",
          durationMs: 100,
          semanticProperties: { "cli.outcome": "applied", "cli.applied_count": 2 },
        });
      }).pipe(Effect.provide(Layer.mergeAll(captureLayer, ProductActivityLive)));

      expect(capture.events).toHaveLength(2);
      expect(capture.events[0]?.properties?.["product.activity"]).toBe("publish");
      expect(capture.events[1]?.properties?.["product.value_completed"]).toBe(true);
      expect(capture.events[1]?.properties?.["product.activation_completed"]).toBe(false);
    }),
  );
});

describe("lifecycle observation", () => {
  it.effect("records counts and keeps a producer's failure text out of them", () =>
    Effect.gen(function* () {
      const failureDetail = "SYNTHETIC_FAILURE_DETAIL_81";
      yield* Effect.scoped(
        Effect.gen(function* () {
          const lifecycle = yield* makeOperationLifecycle({ name: "Updating", mode: "apply" });
          yield* observeLifecycleForTelemetry(lifecycle);
          yield* lifecycle.publish((seq, atMs) => ({
            _tag: "OperationStarted",
            seq,
            atMs,
            operationId: lifecycle.operationId,
            name: "Updating",
            mode: "apply",
          }));
          yield* lifecycle.publish((seq, atMs) => ({
            _tag: "UnitResolved",
            seq,
            atMs,
            unitId: "skill:review",
            label: "review",
            state: "failed",
            index: 0,
            failure: { category: "auth", detail: `The registry refused ${failureDetail}.` },
          }));
          yield* lifecycle.settle("failed");
          yield* lifecycle.drained.await;
        }),
      );
      // The observer folds the stream into counts; the sentence a producer
      // settled a unit with is not one of them.
      const properties = yield* getCommandSemanticProperties;
      expect(JSON.stringify(properties)).not.toContain(failureDetail);
    }).pipe(Effect.provide(CommandSemanticPropertiesLive)),
  );
});

describe("CommandSemanticProperties service", () => {
  it.effect("starts with empty properties", () =>
    Effect.gen(function* () {
      const svc = yield* CommandSemanticProperties;
      const value = yield* Ref.get(svc.ref);
      expect(value).toEqual({});
    }).pipe(Effect.provide(CommandSemanticPropertiesLive)),
  );

  it.effect("setCommandSemanticProperties stores properties in the Ref", () =>
    Effect.gen(function* () {
      yield* setCommandSemanticProperties({
        "cli.outcome": "applied",
        "cli.subject_type": "skill",
        "cli.applied_count": 3,
      });

      const svc = yield* CommandSemanticProperties;
      const value = yield* Ref.get(svc.ref);
      expect(value).toEqual({
        "cli.outcome": "applied",
        "cli.subject_type": "skill",
        "cli.applied_count": 3,
      });
    }).pipe(Effect.provide(CommandSemanticPropertiesLive)),
  );

  it.effect("getCommandSemanticProperties reads stored properties", () =>
    Effect.gen(function* () {
      yield* setCommandSemanticProperties({
        "cli.outcome": "previewed",
        "cli.source_kind": "registry",
      });

      const properties = yield* getCommandSemanticProperties;
      expect(properties).toEqual({
        "cli.outcome": "previewed",
        "cli.source_kind": "registry",
      });
    }).pipe(Effect.provide(CommandSemanticPropertiesLive)),
  );

  it.effect("getCommandSemanticProperties returns empty record when service is absent", () =>
    Effect.gen(function* () {
      const properties = yield* getCommandSemanticProperties;
      expect(properties).toEqual({});
    }),
  );

  it.effect("setCommandSemanticProperties overwrites previous properties", () =>
    Effect.gen(function* () {
      yield* setCommandSemanticProperties({ "cli.outcome": "applied" });
      yield* setCommandSemanticProperties({ "cli.outcome": "previewed" });

      const properties = yield* getCommandSemanticProperties;
      expect(properties).toEqual({ "cli.outcome": "previewed" });
    }).pipe(Effect.provide(CommandSemanticPropertiesLive)),
  );

  it.effect("setCommandSemanticProperties is safe when service is absent", () =>
    setCommandSemanticProperties({ "cli.outcome": "applied" }),
  );
});
