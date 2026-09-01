/** Unit tests for the authoritative lockfile health gate. */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { augmentPlanWithReconciliation, type AugmentedPlanResult } from "./augment-plan.js";
import type { Plan } from "../../plan/plan.js";

const basePlan: Plan = {
  _tag: "Plan",
  name: "Test plan",
  description: Option.none(),
  jobs: [{ concurrency: 1, steps: [] }],
};

const okLockfileState = () => Effect.succeed("ok" as const);
const missingLockfileState = () => Effect.succeed("missing" as const);
const invalidLockfileState = () => Effect.succeed("invalid" as const);

describe("augmentPlanWithReconciliation", () => {
  it.effect("returns the plan unchanged when the lockfile is readable", () =>
    Effect.gen(function* () {
      const result: AugmentedPlanResult = yield* augmentPlanWithReconciliation(
        basePlan,
        okLockfileState,
      );

      expect(result.plan).toEqual(basePlan);
      expect(result.reconciliationTriggered).toBe(false);
      expect(result.reason).toBeUndefined();
    }),
  );

  it.effect("allows a resolved lifecycle plan to establish a missing lockfile", () =>
    Effect.gen(function* () {
      const result = yield* augmentPlanWithReconciliation(basePlan, missingLockfileState);

      expect(result.plan).toEqual(basePlan);
      expect(result.reconciliationTriggered).toBe(true);
      expect(result.reason).toBe("missing");
    }),
  );

  it.effect("blocks an invalid authoritative lockfile without reconstructing it", () =>
    Effect.gen(function* () {
      const result = yield* augmentPlanWithReconciliation(basePlan, invalidLockfileState);

      expect(result.reconciliationTriggered).toBe(true);
      expect(result.reason).toBe("invalid");
      expect(result.plan.jobs).toEqual([
        {
          concurrency: 1,
          steps: [
            {
              key: "workspace:lockfile-invalid",
              readiness: "error",
              label: "Read accepted external resolutions",
              errorMessage:
                "The authoritative lockfile is invalid and cannot be reconstructed from workspace observation.",
            },
          ],
        },
      ]);
    }),
  );
});
