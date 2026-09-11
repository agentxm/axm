import * as Cause from "effect/Cause";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { makeAppError } from "../app-error/index.js";
import { PromptCancelled } from "../prompt/prompt-cancelled.js";
import { TelemetryClient, type TelemetryClientService } from "../telemetry/index.js";
import type { TelemetryProperties } from "../telemetry/client.js";
import {
  reportCliDefect,
  reportCliError,
  trackCliCommand,
  trackCliCommandCompleted,
  CommandSemanticProperties,
  CommandSemanticPropertiesLive,
  ProductActivityLive,
  setCommandSemanticProperties,
  getCommandSemanticProperties,
  startProductActivity,
} from "./telemetry.js";

interface Capture {
  readonly events: Array<{ event: string; properties?: TelemetryProperties }>;
  readonly errors: Array<{
    name: string;
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

  it.effect("reports AppError as a handled error", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();

      yield* reportCliError(
        makeAppError({
          code: "not_found",
          detail: "WorkspaceMutations not initialized",
          suggestions: [{ description: "Create a workspace.", cmd: "axm setup" }],
        }),
        "setup",
      ).pipe(Effect.provide(layer));

      expect(capture.errors).toEqual([
        {
          name: "not_found",
          level: "error",
          errorClass: "user",
          handled: true,
          command: "setup",
        },
      ]);
    }),
  );

  it.effect("redacts metadata-derived secrets from handled-error telemetry", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();
      const secret = "AXM_SECRET_SENTINEL_92";

      yield* reportCliError(
        makeAppError({
          code: "internal",
          detail: `registry failed with ${secret}`,
          metadata: {
            response: {
              status: 500,
              body: { access_token: secret },
            },
          },
        }),
        "publish",
      ).pipe(Effect.provide(layer));

      expect(JSON.stringify(capture.errors)).not.toContain(secret);
    }),
  );

  it.effect("skips PromptCancelled", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();

      yield* reportCliError(new PromptCancelled({ message: "cancelled" }), "setup").pipe(
        Effect.provide(layer),
      );

      expect(capture.errors).toHaveLength(0);
    }),
  );

  it.effect("skips interrupt-only causes", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();

      yield* reportCliDefect(Cause.interrupt(), "test").pipe(Effect.provide(layer));

      expect(capture.errors).toHaveLength(0);
    }),
  );

  it.effect("reports defects as fatal errors", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();

      yield* reportCliDefect(Cause.die(new Error("boom")), "skills list").pipe(
        Effect.provide(layer),
      );

      expect(capture.errors).toEqual([
        {
          name: "Defect",
          level: "fatal",
          errorClass: "internal",
          handled: false,
          command: "skills list",
        },
      ]);
    }),
  );

  it.effect("redacts credential-shaped defects from telemetry", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();
      const secret = "ghp_abcdefghijklmnopqrstuvwxyz123456";

      yield* reportCliDefect(Cause.die(new Error(`Bearer ${secret}`)), "skills list").pipe(
        Effect.provide(layer),
      );

      expect(JSON.stringify(capture.errors)).not.toContain(secret);
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
