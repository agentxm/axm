import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Tracer from "effect/Tracer";
import { afterEach, beforeEach } from "vitest";

import type { NativeLocationOutcome } from "../locations/index.js";
import { NativePlatformTest } from "../locations/testing.js";
import { WorkspaceFileWriteLocksLive } from "../settlement/live.js";
import { SettingsIoError, WorkspaceReadViews } from "../workspace-state/index.js";
import {
  ConfiguredAgentOutcomesProviderTest,
  WorkspaceStateTest,
} from "../workspace-state/testing.js";
import { syncRefused } from "./errors.js";
import {
  captureNativeOutputRetention,
  validateNativeOutputPostconditions,
} from "./native-output-postconditions.js";

/**
 * The closure postcondition over a real temporary workspace and the
 * production read views. Each case calls the validator directly, as a
 * closure's `validate` does after its last write.
 */
let root: string;

beforeEach(() => {
  root = nodeFs.realpathSync(nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-postcond-")));
});

afterEach(() => {
  nodeFs.rmSync(root, { recursive: true, force: true });
});

const retainedFile = (path: string): NativeLocationOutcome => ({
  scope: "project",
  address: { kind: "file", path },
  aliases: [path],
  configuredConsumers: ["claude-code"],
  potentialReaders: [],
  policyReasons: [],
  ownership: "owned",
  state: "retained",
  availability: [],
});

const observed = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  return {
    phases: () => spans.filter((span) => span.name === "axm.observation.phase").length,
    effect: effect.pipe(Effect.withTracer(tracer), Effect.withTracerEnabled(true)),
  };
};

const grounded = <A, E, R>(
  effect: Effect.Effect<
    A,
    E,
    R | Effect.Services<ReturnType<typeof validateNativeOutputPostconditions>>
  >,
) =>
  effect.pipe(
    Effect.provide(
      Layer.mergeAll(
        WorkspaceStateTest({
          scope: "project",
          projectRoot: decodeAbsolutePathSync(root),
          allowUninitialized: true,
        }),
        ConfiguredAgentOutcomesProviderTest,
      ).pipe(
        Layer.provideMerge(Layer.provideMerge(WorkspaceFileWriteLocksLive, NativePlatformTest)),
      ),
    ),
  );

describe("native output postconditions", () => {
  it.effect("opens no read phase when nothing is retained or required", () =>
    Effect.gen(function* () {
      const removed: NativeLocationOutcome = {
        ...retainedFile(nodePath.join(root, ".claude", "agents", "reviewer.md")),
        state: "removed",
      };
      const run = observed(validateNativeOutputPostconditions([], [removed], []));
      yield* run.effect;
      expect(run.phases()).toBe(0);
    }).pipe(grounded),
  );

  it.effect("checks retained witnesses in one phase when nothing is required", () =>
    Effect.gen(function* () {
      const file = nodePath.join(root, ".claude", "agents", "reviewer.md");
      nodeFs.mkdirSync(nodePath.dirname(file), { recursive: true });
      nodeFs.writeFileSync(file, "Retained reviewer.\n");
      const retained = yield* captureNativeOutputRetention([retainedFile(file)]);
      expect(retained).toHaveLength(1);
      const unchanged = observed(validateNativeOutputPostconditions([], [], retained));
      yield* unchanged.effect;
      expect(unchanged.phases()).toBe(1);

      nodeFs.writeFileSync(file, "Changed by another writer.\n");
      const changed = observed(validateNativeOutputPostconditions([], [], retained));
      const failure = yield* Effect.flip(changed.effect);
      expect(changed.phases()).toBe(1);
      expect(failure).toMatchObject({
        _tag: "OperationRefused",
        category: "conflict",
        detail: "Cannot verify final native output postconditions",
        cause: { _tag: "ProjectionIoFailed", path: file, cause: "retained-native-unit-changed" },
      });
    }).pipe(grounded),
  );

  it.effect("refuses with the unverifiable postcondition when its read phase cannot start", () =>
    Effect.gen(function* () {
      const file = nodePath.join(root, ".claude", "agents", "reviewer.md");
      nodeFs.mkdirSync(nodePath.dirname(file), { recursive: true });
      nodeFs.writeFileSync(file, "Retained reviewer.\n");
      const retained = yield* captureNativeOutputRetention([retainedFile(file)]);
      const unreadable = new SettingsIoError({
        path: nodePath.join(root, "axm.json"),
        cause: "EIO",
      });
      const views = yield* WorkspaceReadViews;
      const failure = yield* validateNativeOutputPostconditions([], [], retained).pipe(
        Effect.provideService(WorkspaceReadViews, {
          ...views,
          capture: () => Effect.fail(unreadable),
        }),
        Effect.flip,
      );
      expect(failure).toEqual(
        syncRefused({
          category: "conflict",
          detail: "Cannot verify final native output postconditions",
          cause: unreadable,
        }),
      );
    }).pipe(grounded),
  );
});
