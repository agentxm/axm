/**
 * Unit tests for the shared single-step plan builder.
 */

import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import type { Operation } from "../../workspace/plan.js";
import { buildSingleStepPlan } from "./plan-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

type TestOp = Operation<"test-op", { readonly value: string }>;

const makeOp = (value: string): TestOp => ({
  name: "test-op",
  args: { value },
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildSingleStepPlan", () => {
  it("produces a plan with one job containing one step", () => {
    const plan = buildSingleStepPlan({
      operation: makeOp("a"),
      name: "Test plan",
      description: "Do a test",
      label: "my-skill",
      expectedMessage: "Done",
    });

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.steps).toHaveLength(1);
  });

  it("sets the plan name and description", () => {
    const plan = buildSingleStepPlan({
      operation: makeOp("a"),
      name: "Enable skill",
      description: "Enable my-skill",
      label: "my-skill",
      expectedMessage: "Enabled my-skill",
    });

    expect(plan.name).toBe("Enable skill");
    expect(plan.description).toEqual(Option.some("Enable my-skill"));
  });

  it("sets the step label", () => {
    const plan = buildSingleStepPlan({
      operation: makeOp("a"),
      name: "Test",
      description: "desc",
      label: "step-label",
      expectedMessage: "Done",
    });

    expect(plan.jobs[0]!.steps[0]!.label).toBe("step-label");
  });

  it("sets the expected result with success and provided message", () => {
    const plan = buildSingleStepPlan({
      operation: makeOp("a"),
      name: "Test",
      description: "desc",
      label: "lbl",
      expectedMessage: "Enabled foo",
    });

    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "success",
      message: "Enabled foo",
    });
  });

  it("attaches the operation to the step", () => {
    const op = makeOp("xyz");
    const plan = buildSingleStepPlan({
      operation: op,
      name: "Test",
      description: "desc",
      label: "lbl",
      expectedMessage: "Done",
    });

    expect(plan.jobs[0]!.steps[0]!.operation).toBe(op);
  });

  it("tags the step as PlannedJobStep", () => {
    const plan = buildSingleStepPlan({
      operation: makeOp("a"),
      name: "Test",
      description: "desc",
      label: "lbl",
      expectedMessage: "Done",
    });

    expect(plan.jobs[0]!.steps[0]!._tag).toBe("PlannedJobStep");
  });

  it("sets job concurrency to 1", () => {
    const plan = buildSingleStepPlan({
      operation: makeOp("a"),
      name: "Test",
      description: "desc",
      label: "lbl",
      expectedMessage: "Done",
    });

    expect(plan.jobs[0]!.concurrency).toBe(1);
  });
});
