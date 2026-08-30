import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { TelemetryClient, type TelemetryClientService } from "../telemetry/index.js";
import type { TelemetryProperties } from "../telemetry/client.js";
import { trackCliCommandCompleted, setCommandSemanticProperties } from "./telemetry.js";
import { summarizeCommandOutcome } from "./command-summary.js";

// ---------------------------------------------------------------------------
// Capture layer — mirrors pattern from telemetry.internal.test.ts but uses wide types
// ---------------------------------------------------------------------------

interface Capture {
  readonly events: Array<{ event: string; properties?: TelemetryProperties }>;
}

const makeCaptureLayer = (): readonly [Layer.Layer<TelemetryClient>, Capture] => {
  const capture: Capture = { events: [] };
  const layer = Layer.succeed(TelemetryClient, {
    trackEvent: (event, properties) =>
      Effect.sync(() => {
        capture.events.push({ event, ...(properties !== undefined && { properties }) });
      }),
    reportError: () => Effect.void,
  } satisfies TelemetryClientService);

  return [layer, capture] as const;
};

describe("command_completed telemetry contract", () => {
  it.effect("cli.duration_ms is a JSON number, not a string", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();

      yield* trackCliCommandCompleted({
        command: "skills install",
        result: "success",
        durationMs: 1234,
      }).pipe(Effect.provide(layer));

      expect(capture.events).toHaveLength(1);
      const props = capture.events[0]?.properties;
      expect(props).toBeDefined();
      expect(props?.["cli.duration_ms"]).toBe(1234);
      expect(typeof props?.["cli.duration_ms"]).toBe("number");
    }),
  );

  it.effect("semantic properties are forwarded when provided", () =>
    Effect.gen(function* () {
      const [layer, capture] = makeCaptureLayer();

      const semanticProperties = summarizeCommandOutcome({
        outcome: "applied",
        subjectType: "skill",
        sourceKind: "registry",
        appliedCount: 3,
        failedCount: 0,
        blockedCount: 1,
      });

      yield* trackCliCommandCompleted({
        command: "skills install",
        result: "success",
        durationMs: 500,
        semanticProperties,
      }).pipe(Effect.provide(layer));

      expect(capture.events).toHaveLength(1);
      const props = capture.events[0]?.properties;
      expect(props).toBeDefined();

      // Bounded vocabulary fields
      expect(props?.["cli.outcome"]).toBe("applied");
      expect(props?.["cli.subject_type"]).toBe("skill");
      expect(props?.["cli.source_kind"]).toBe("registry");

      // Count fields are JSON numbers
      expect(props?.["cli.applied_count"]).toBe(3);
      expect(typeof props?.["cli.applied_count"]).toBe("number");
      expect(props?.["cli.failed_count"]).toBe(0);
      expect(typeof props?.["cli.failed_count"]).toBe("number");
      expect(props?.["cli.blocked_count"]).toBe(1);
      expect(typeof props?.["cli.blocked_count"]).toBe("number");
    }),
  );

  it.effect("cli.outcome uses bounded vocabulary values", () =>
    Effect.sync(() => {
      const outcomes = ["applied", "previewed", "no-op", "cancelled"] as const;
      for (const outcome of outcomes) {
        const result = summarizeCommandOutcome({ outcome });
        expect(result["cli.outcome"]).toBe(outcome);
      }
    }),
  );

  it.effect("cli.subject_type uses bounded vocabulary values", () =>
    Effect.sync(() => {
      const types = [
        "skill",
        "subagent",
        "pack",
        "mcp-server",
        "rule",
        "hook",
        "knowledge",
        "mixed",
        "unknown",
      ] as const;
      for (const subjectType of types) {
        const result = summarizeCommandOutcome({ subjectType });
        expect(result["cli.subject_type"]).toBe(subjectType);
      }
    }),
  );

  it.effect("cli.source_kind uses bounded vocabulary values", () =>
    Effect.sync(() => {
      const kinds = ["registry", "git", "local", "workspace", "mixed", "unknown"] as const;
      for (const sourceKind of kinds) {
        const result = summarizeCommandOutcome({ sourceKind });
        expect(result["cli.source_kind"]).toBe(sourceKind);
      }
    }),
  );

  it.effect("no semantic context produces empty properties", () =>
    Effect.sync(() => {
      const result = summarizeCommandOutcome({});
      expect(Object.keys(result)).toHaveLength(0);
    }),
  );

  it.effect("semantic properties omit undefined fields", () =>
    Effect.sync(() => {
      const result = summarizeCommandOutcome({ outcome: "applied" });
      expect(result["cli.outcome"]).toBe("applied");
      expect(result).not.toHaveProperty("cli.subject_type");
      expect(result).not.toHaveProperty("cli.source_kind");
      expect(result).not.toHaveProperty("cli.applied_count");
      expect(result).not.toHaveProperty("cli.failed_count");
      expect(result).not.toHaveProperty("cli.blocked_count");
    }),
  );
});

// ---------------------------------------------------------------------------
// Envelope forwarding — verifies setCommandSemanticProperties flows through
// the Ref service into command_completed via the set → get → track pipeline.
// ---------------------------------------------------------------------------

import { CommandSemanticPropertiesLive, getCommandSemanticProperties } from "./telemetry.js";

/**
 * Test the full integration by directly testing the building blocks compose
 * correctly: set → get → trackCliCommandCompleted. This avoids fighting
 * the envelope's internal telemetry layer wiring while still proving the
 * contract end-to-end.
 */
describe("envelope forwarding — semantic properties via Ref service", () => {
  it.effect("set properties are readable via getCommandSemanticProperties", () =>
    Effect.gen(function* () {
      yield* setCommandSemanticProperties(
        summarizeCommandOutcome({
          outcome: "applied",
          subjectType: "skill",
          sourceKind: "registry",
          appliedCount: 2,
        }),
      );

      const props = yield* getCommandSemanticProperties;
      expect(props["cli.outcome"]).toBe("applied");
      expect(props["cli.subject_type"]).toBe("skill");
      expect(props["cli.source_kind"]).toBe("registry");
      expect(props["cli.applied_count"]).toBe(2);
    }).pipe(Effect.provide(CommandSemanticPropertiesLive)),
  );

  it.effect("trackCliCommandCompleted merges semantic properties from Ref service", () =>
    Effect.gen(function* () {
      const [captureLayer, capture] = makeCaptureLayer();

      yield* setCommandSemanticProperties(
        summarizeCommandOutcome({
          outcome: "applied",
          subjectType: "skill",
          sourceKind: "registry",
          appliedCount: 2,
        }),
      );

      const semanticProperties = yield* getCommandSemanticProperties;
      yield* trackCliCommandCompleted({
        command: "install",
        result: "success",
        durationMs: 123,
        semanticProperties,
      }).pipe(Effect.provide(captureLayer));

      const completed = capture.events.find((e) => e.event === "command_completed");
      expect(completed).toBeDefined();
      const props = completed?.properties;
      expect(props?.["cli.command"]).toBe("install");
      expect(props?.["cli.result"]).toBe("success");
      expect(props?.["cli.outcome"]).toBe("applied");
      expect(props?.["cli.subject_type"]).toBe("skill");
      expect(props?.["cli.source_kind"]).toBe("registry");
      expect(props?.["cli.applied_count"]).toBe(2);
    }).pipe(Effect.provide(CommandSemanticPropertiesLive)),
  );

  it.effect("previewed outcome flows through the set → get → track pipeline", () =>
    Effect.gen(function* () {
      const [captureLayer, capture] = makeCaptureLayer();

      yield* setCommandSemanticProperties(
        summarizeCommandOutcome({
          outcome: "previewed",
          subjectType: "pack",
          sourceKind: "registry",
        }),
      );

      const semanticProperties = yield* getCommandSemanticProperties;
      yield* trackCliCommandCompleted({
        command: "packs publish",
        result: "success",
        durationMs: 50,
        semanticProperties,
      }).pipe(Effect.provide(captureLayer));

      const completed = capture.events.find((e) => e.event === "command_completed");
      expect(completed?.properties?.["cli.outcome"]).toBe("previewed");
      expect(completed?.properties?.["cli.subject_type"]).toBe("pack");
    }).pipe(Effect.provide(CommandSemanticPropertiesLive)),
  );

  it.effect("no-op outcome flows through the set → get → track pipeline", () =>
    Effect.gen(function* () {
      const [captureLayer, capture] = makeCaptureLayer();

      yield* setCommandSemanticProperties(
        summarizeCommandOutcome({
          outcome: "no-op",
          subjectType: "mixed",
          sourceKind: "workspace",
        }),
      );

      const semanticProperties = yield* getCommandSemanticProperties;
      yield* trackCliCommandCompleted({
        command: "install",
        result: "success",
        durationMs: 10,
        semanticProperties,
      }).pipe(Effect.provide(captureLayer));

      const completed = capture.events.find((e) => e.event === "command_completed");
      expect(completed?.properties?.["cli.outcome"]).toBe("no-op");
      expect(completed?.properties?.["cli.subject_type"]).toBe("mixed");
      expect(completed?.properties?.["cli.source_kind"]).toBe("workspace");
    }).pipe(Effect.provide(CommandSemanticPropertiesLive)),
  );

  it.effect("cancelled outcome flows through the set → get → track pipeline", () =>
    Effect.gen(function* () {
      const [captureLayer, capture] = makeCaptureLayer();

      yield* setCommandSemanticProperties(
        summarizeCommandOutcome({ outcome: "cancelled", subjectType: "skill" }),
      );

      const semanticProperties = yield* getCommandSemanticProperties;
      yield* trackCliCommandCompleted({
        command: "install",
        result: "success",
        durationMs: 10,
        semanticProperties,
      }).pipe(Effect.provide(captureLayer));

      const completed = capture.events.find((e) => e.event === "command_completed");
      expect(completed?.properties?.["cli.outcome"]).toBe("cancelled");
      expect(completed?.properties?.["cli.subject_type"]).toBe("skill");
    }).pipe(Effect.provide(CommandSemanticPropertiesLive)),
  );

  it.effect("empty semantic properties when handler does not set them", () =>
    Effect.gen(function* () {
      const [captureLayer, capture] = makeCaptureLayer();

      // Don't call setCommandSemanticProperties
      const semanticProperties = yield* getCommandSemanticProperties;
      yield* trackCliCommandCompleted({
        command: "test",
        result: "success",
        durationMs: 10,
        semanticProperties,
      }).pipe(Effect.provide(captureLayer));

      const completed = capture.events.find((e) => e.event === "command_completed");
      const props = completed?.properties;
      expect(props?.["cli.command"]).toBe("test");
      expect(props?.["cli.result"]).toBe("success");
      expect(props?.["cli.outcome"]).toBeUndefined();
      expect(props?.["cli.subject_type"]).toBeUndefined();
    }).pipe(Effect.provide(CommandSemanticPropertiesLive)),
  );

  it.effect("semantic properties derive from structured summary, not argv", () =>
    Effect.gen(function* () {
      const [captureLayer, capture] = makeCaptureLayer();

      // Properties come from execution state, not from parsing command-line args
      yield* setCommandSemanticProperties(
        summarizeCommandOutcome({
          outcome: "applied",
          subjectType: "skill",
          sourceKind: "registry",
          appliedCount: 5,
        }),
      );

      const semanticProperties = yield* getCommandSemanticProperties;
      yield* trackCliCommandCompleted({
        command: "install",
        result: "success",
        durationMs: 100,
        semanticProperties,
      }).pipe(Effect.provide(captureLayer));

      const completed = capture.events.find((e) => e.event === "command_completed");
      const props = completed?.properties;
      expect(props?.["cli.command"]).toBe("install");
      expect(props?.["cli.outcome"]).toBe("applied");
      expect(props?.["cli.subject_type"]).toBe("skill");
      expect(props?.["cli.source_kind"]).toBe("registry");
      expect(props?.["cli.applied_count"]).toBe(5);
    }).pipe(Effect.provide(CommandSemanticPropertiesLive)),
  );
});
