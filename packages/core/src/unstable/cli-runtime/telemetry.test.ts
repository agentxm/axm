import * as Cause from "effect/Cause";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeAppError } from "../app-error/index.js";
import { PromptCancelled } from "../prompt-cancelled.js";
import { TelemetryClient, type TelemetryClientService } from "../telemetry/index.js";
import {
  reportCliDefect,
  reportCliError,
  trackCliCommand,
  trackCliCommandCompleted,
} from "./telemetry.js";

interface Capture {
  readonly events: Array<{ event: string; properties?: Record<string, string> }>;
  readonly errors: Array<{
    name: string;
    message: string;
    level: "error" | "fatal";
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
          message: error.message,
          level: error.level,
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
          code: "WORKSPACE_NOT_FOUND",
          what: "Workspace not initialized",
          howToFix: "Run axm init",
        }),
        "init",
      ).pipe(Effect.provide(layer));

      expect(capture.errors).toEqual([
        {
          name: "WORKSPACE_NOT_FOUND",
          message: "Workspace not initialized",
          level: "error",
          handled: true,
          command: "init",
        },
      ]);
    }),
  );

  it.effect("skips PromptCancelled", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();

      yield* reportCliError(new PromptCancelled({ message: "cancelled" }), "init").pipe(
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
          message: "boom",
          level: "fatal",
          handled: false,
          command: "skills list",
        },
      ]);
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
            "cli.duration_ms": "1234",
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
            "cli.duration_ms": "567",
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
        command: "init",
        result: "cancelled",
        durationMs: 100,
      }).pipe(Effect.provide(layer));

      expect(capture.events[0]?.properties).not.toHaveProperty("cli.error_code");
    }),
  );
});
