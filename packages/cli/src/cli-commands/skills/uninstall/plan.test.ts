/**
 * Unit tests for buildSkillUninstallPlan.
 *
 * Tests the uninstall-specific plan builder that diffs operations against lockfile state.
 */

import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import type { UninstallSkillOperation } from "../../../extensions/skills/operations/uninstall.js";
import type { PlannedJobStep } from "../../../workspace/plan.js";
import { buildSkillUninstallPlan, type InstalledSkills } from "./plan.js";

// Assertion needed: plan builders only produce PlannedJobStep
const planned = <T>(step: { readonly _tag: string }) => step as PlannedJobStep<T>;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeOp = (name: string): UninstallSkillOperation => ({
  name: "uninstall-skill",
  args: { skillName: name, agents: [] },
});

const emptyInstalled: InstalledSkills = {};

const installedWith = (...names: string[]): InstalledSkills =>
  Object.fromEntries(names.map((name) => [name, { referencingPacks: [] }]));

const installedWithPacks = (entries: Record<string, ReadonlyArray<string>>): InstalledSkills =>
  Object.fromEntries(
    Object.entries(entries).map(([name, packs]) => [name, { referencingPacks: packs }]),
  );

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildSkillUninstallPlan", () => {
  it("marks installed skills as ready", () => {
    const plan = buildSkillUninstallPlan(
      [makeOp("commit")],
      installedWith("commit"),
      "Uninstall",
      Option.none(),
    );

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.steps).toHaveLength(1);
    expect(plan.jobs[0]!.steps[0]!._tag).toBe("PlannedJobStep");
    expect(planned(plan.jobs[0]!.steps[0]!).readiness).toEqual({
      status: "ready",
      message: Option.none(),
    });
  });

  it("marks skills not installed as skip", () => {
    const plan = buildSkillUninstallPlan(
      [makeOp("commit")],
      emptyInstalled,
      "Uninstall",
      Option.none(),
    );

    expect(plan.jobs[0]!.steps[0]!._tag).toBe("PlannedJobStep");
    expect(planned(plan.jobs[0]!.steps[0]!).readiness).toEqual({
      status: "skip",
      message: "not installed",
    });
  });

  it("produces empty plan from empty operations", () => {
    const plan = buildSkillUninstallPlan([], emptyInstalled, "Uninstall", Option.none());

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.steps).toHaveLength(0);
  });

  it("derives label from skillName", () => {
    const plan = buildSkillUninstallPlan(
      [makeOp("commit"), makeOp("review-pr")],
      installedWith("commit", "review-pr"),
      "Uninstall",
      Option.none(),
    );

    expect(plan.jobs[0]!.steps[0]!.label).toBe("commit");
    expect(plan.jobs[0]!.steps[1]!.label).toBe("review-pr");
  });

  it("passes through caller-provided name and description", () => {
    const plan = buildSkillUninstallPlan(
      [makeOp("commit")],
      installedWith("commit"),
      "Uninstall skill(s)",
      Option.some("Uninstall skills from workspace"),
    );

    expect(plan.name).toBe("Uninstall skill(s)");
    expect(plan.description).toEqual(Option.some("Uninstall skills from workspace"));
  });

  it("creates a single job with serial concurrency", () => {
    const plan = buildSkillUninstallPlan(
      [makeOp("a"), makeOp("b")],
      installedWith("a", "b"),
      "Uninstall",
      Option.none(),
    );

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.concurrency).toBe(1);
  });

  it("handles mixed ready and skip readiness", () => {
    const plan = buildSkillUninstallPlan(
      [makeOp("commit"), makeOp("review-pr"), makeOp("debug")],
      installedWith("commit", "debug"),
      "Uninstall",
      Option.none(),
    );

    const steps = plan.jobs[0]!.steps;
    expect(planned(steps[0]!).readiness.status).toBe("ready");
    expect(steps[0]!.label).toBe("commit");
    expect(planned(steps[1]!).readiness.status).toBe("skip");
    expect(steps[1]!.label).toBe("review-pr");
    expect(planned(steps[2]!).readiness.status).toBe("ready");
    expect(steps[2]!.label).toBe("debug");
  });

  it("marks pack-dependent skill (single pack) as error", () => {
    const plan = buildSkillUninstallPlan(
      [makeOp("commit")],
      installedWithPacks({ commit: ["my-pack"] }),
      "Uninstall",
      Option.none(),
    );

    const step = planned(plan.jobs[0]!.steps[0]!);
    expect(step.readiness).toEqual({
      status: "error",
      message: "required by pack my-pack. Use 'axm skills disable <skill>' instead",
    });
  });

  it("marks pack-dependent skill (multiple packs) as error", () => {
    const plan = buildSkillUninstallPlan(
      [makeOp("commit")],
      installedWithPacks({ commit: ["pack-a", "pack-b"] }),
      "Uninstall",
      Option.none(),
    );

    const step = planned(plan.jobs[0]!.steps[0]!);
    expect(step.readiness).toEqual({
      status: "error",
      message: "required by pack pack-a, pack-b. Use 'axm skills disable <skill>' instead",
    });
  });
});
