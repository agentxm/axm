/**
 * Spec test for lint-engine Phase 1: the plan pipeline primitives MUST be
 * reachable from the stable kernel export path `@agentxm/client-core/unstable/plan`
 * so that both this CLI and registry-side consumers can compose workspace
 * Operations without reaching into `@agentxm/client-core/unstable/workspace`.
 *
 * Requirement: "Plan pipeline primitives available in shared kernel"
 */

import { describe, expect, it } from "@effect/vitest";
import * as Plan from "@agentxm/client-core/unstable/plan";

describe("Plan pipeline primitives available in shared kernel", () => {
  it("exports applyPlan from the stable kernel path", () => {
    expect(typeof Plan.applyPlan).toBe("function");
  });

  it("exports previewOrApplyPlan from the stable kernel path", () => {
    expect(typeof Plan.previewOrApplyPlan).toBe("function");
  });

  it("exports Plan type machinery (runtime-visible union discriminants) from the stable kernel path", () => {
    // Plan, PlannedJobStep, JobStepResult, Operation, OperationHandler are types —
    // their presence is asserted by consumer imports compiling, plus the barrel
    // re-exporting them (see plan/index.ts). This test exercises the bindings
    // used at runtime so the package.json exports map is actually wired.
    expect(Plan).toHaveProperty("applyPlan");
    expect(Plan).toHaveProperty("previewOrApplyPlan");
  });
});
