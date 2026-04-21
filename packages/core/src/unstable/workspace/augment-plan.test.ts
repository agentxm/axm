/**
 * Unit tests for augmentPlanWithReconciliation.
 *
 * Tests that the function returns an AugmentedPlanResult with the correct
 * reconciliation state, without requiring a CLI renderer.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { augmentPlanWithReconciliation, type AugmentedPlanResult } from "./augment-plan.js";
import type { Plan } from "../plan/plan.js";
import type { Settings } from "../settings/index.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const basePlan: Plan = {
  _tag: "Plan",
  name: "Test plan",
  description: Option.none(),
  jobs: [{ concurrency: 1, steps: [] }],
};

const okLockfileState = () => Effect.succeed("ok" as const);
const missingLockfileState = () => Effect.succeed("missing" as const);
const invalidLockfileState = () => Effect.succeed("invalid" as const);

const defaultSettings: Settings = {
  skills: {},
  agents: ["claude-code"],
};
const readSettingsSafe = (_dir: string) => Effect.succeed(defaultSettings);

describe("augmentPlanWithReconciliation", () => {
  it.effect("returns plan unchanged when lockfile is ok", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const fsLayer = Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, fs),
        Layer.succeed(Path.Path, path),
      );

      const result: AugmentedPlanResult = yield* augmentPlanWithReconciliation(
        basePlan,
        okLockfileState,
        "/tmp",
        "/tmp/.axm",
        readSettingsSafe,
        fsLayer,
      );

      expect(result.plan).toEqual(basePlan);
      expect(result.reconciliationTriggered).toBe(false);
      expect(result.reason).toBeUndefined();
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("prepends reconciliation jobs and sets reason for missing lockfile", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const fsLayer = Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, fs),
        Layer.succeed(Path.Path, path),
      );

      const result = yield* augmentPlanWithReconciliation(
        basePlan,
        missingLockfileState,
        "/tmp",
        "/tmp/.axm",
        readSettingsSafe,
        fsLayer,
      );

      expect(result.reconciliationTriggered).toBe(true);
      expect(result.reason).toBe("missing");
      // The plan should have more jobs than the original (reconciliation job prepended)
      expect(result.plan.jobs.length).toBeGreaterThan(basePlan.jobs.length);
      // First job should have 2 reconciliation steps
      expect(result.plan.jobs[0]?.steps).toHaveLength(2);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("prepends reconciliation jobs and sets reason for invalid lockfile", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const fsLayer = Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, fs),
        Layer.succeed(Path.Path, path),
      );

      const result = yield* augmentPlanWithReconciliation(
        basePlan,
        invalidLockfileState,
        "/tmp",
        "/tmp/.axm",
        readSettingsSafe,
        fsLayer,
      );

      expect(result.reconciliationTriggered).toBe(true);
      expect(result.reason).toBe("invalid");
      expect(result.plan.jobs.length).toBeGreaterThan(basePlan.jobs.length);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
