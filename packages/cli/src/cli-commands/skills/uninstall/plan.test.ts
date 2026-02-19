/**
 * Unit tests for uninstall buildPlan.
 *
 * Tests the uninstall-specific plan builder that diffs operations against lockfile state.
 */

import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import type { Lockfile } from "../../../lockfile/schema.js";
import type { UninstallSkillOperation } from "../../../extensions/skills/operations/uninstall.js";
import { buildPlan } from "./plan.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeOp = (name: string): UninstallSkillOperation => ({
  name: "uninstall-skill",
  args: { skillName: name, agents: [] },
});

const emptyLockfile: Lockfile = {
  lockfileVersion: 1,
  skills: {},
};

const lockfileWith = (...names: string[]): Lockfile => ({
  lockfileVersion: 1,
  skills: Object.fromEntries(
    names.map((name) => [
      name,
      {
        type: "local" as const,
        path: "/installed",
        agents: [],
        installedAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
  ),
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildPlan", () => {
  it("marks installed skills as expected success", () => {
    const plan = buildPlan([makeOp("commit")], lockfileWith("commit"), "Uninstall", Option.none());

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.steps).toHaveLength(1);
    expect(plan.jobs[0]!.steps[0]!._tag).toBe("PlannedJobStep");
    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "success",
      message: "Uninstalled commit",
    });
  });

  it("marks skills not in lockfile as expected no-op", () => {
    const plan = buildPlan([makeOp("commit")], emptyLockfile, "Uninstall", Option.none());

    expect(plan.jobs[0]!.steps[0]!._tag).toBe("PlannedJobStep");
    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "no-op",
      message: "not installed",
    });
  });

  it("produces empty plan from empty operations", () => {
    const plan = buildPlan([], emptyLockfile, "Uninstall", Option.none());

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.steps).toHaveLength(0);
  });

  it("derives label from skillName", () => {
    const plan = buildPlan(
      [makeOp("commit"), makeOp("review-pr")],
      lockfileWith("commit", "review-pr"),
      "Uninstall",
      Option.none(),
    );

    expect(plan.jobs[0]!.steps[0]!.label).toBe("commit");
    expect(plan.jobs[0]!.steps[1]!.label).toBe("review-pr");
  });

  it("passes through caller-provided name and description", () => {
    const plan = buildPlan(
      [makeOp("commit")],
      lockfileWith("commit"),
      "Uninstall skill(s)",
      Option.some("Uninstall skills from workspace"),
    );

    expect(plan.name).toBe("Uninstall skill(s)");
    expect(plan.description).toEqual(Option.some("Uninstall skills from workspace"));
  });

  it("creates a single job with serial concurrency", () => {
    const plan = buildPlan(
      [makeOp("a"), makeOp("b")],
      lockfileWith("a", "b"),
      "Uninstall",
      Option.none(),
    );

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.concurrency).toBe(1);
  });

  it("handles mixed success and no-op expected results", () => {
    const plan = buildPlan(
      [makeOp("commit"), makeOp("review-pr"), makeOp("debug")],
      lockfileWith("commit", "debug"),
      "Uninstall",
      Option.none(),
    );

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.expectedResult.result).toBe("success");
    expect(steps[0]!.label).toBe("commit");
    expect(steps[1]!.expectedResult.result).toBe("no-op");
    expect(steps[1]!.label).toBe("review-pr");
    expect(steps[2]!.expectedResult.result).toBe("success");
    expect(steps[2]!.label).toBe("debug");
  });
});
