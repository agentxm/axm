/**
 * Unit tests for buildSkillUninstallPlan.
 *
 * Tests the uninstall-specific plan builder that diffs operations against installed state.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { UninstallSkillOperation } from "@axm.sh/core/unstable/extension-managers";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import { makeBaseWorkspaceMock } from "../../../test-stubs.js";
import { at } from "../../../test-helpers.js";
import { buildSkillUninstallPlan, type InstalledSkills } from "./plan.js";

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

const testLayer = Layer.mergeAll(
  NodeServices.layer,
  Layer.succeed(Workspace, makeBaseWorkspaceMock("/tmp/axm")),
);

const runBuildPlan = (
  ops: ReadonlyArray<UninstallSkillOperation>,
  installed: InstalledSkills,
  name: string,
  description: Option.Option<string>,
) =>
  Effect.runSync(
    buildSkillUninstallPlan(ops, installed, name, description).pipe(Effect.provide(testLayer)),
  );

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildSkillUninstallPlan", () => {
  it("marks installed skills as ready", () => {
    const plan = runBuildPlan(
      [makeOp("commit")],
      installedWith("commit"),
      "Uninstall",
      Option.none(),
    );

    expect(plan.jobs).toHaveLength(1);
    expect(at(plan.jobs, 0).steps).toHaveLength(1);
    expect(at(at(plan.jobs, 0).steps, 0).readiness).toBe("ready");
  });

  it("marks skills not installed as ready with no-op run", () => {
    const plan = runBuildPlan([makeOp("commit")], emptyInstalled, "Uninstall", Option.none());

    const step = at(at(plan.jobs, 0).steps, 0);
    expect(step.readiness).toBe("ready");
    if (step.readiness === "ready") {
      const result = Effect.runSync(step.run);
      expect(result.result).toBe("success");
      expect(result.message).toContain("not installed");
    }
  });

  it("produces empty plan from empty operations", () => {
    const plan = runBuildPlan([], emptyInstalled, "Uninstall", Option.none());

    expect(plan.jobs).toHaveLength(1);
    expect(at(plan.jobs, 0).steps).toHaveLength(0);
  });

  it("derives label from skillName", () => {
    const plan = runBuildPlan(
      [makeOp("commit"), makeOp("review-pr")],
      installedWith("commit", "review-pr"),
      "Uninstall",
      Option.none(),
    );

    expect(at(at(plan.jobs, 0).steps, 0).label).toBe("commit");
    expect(at(at(plan.jobs, 0).steps, 1).label).toBe("review-pr");
  });

  it("passes through caller-provided name and description", () => {
    const plan = runBuildPlan(
      [makeOp("commit")],
      installedWith("commit"),
      "Uninstall skill(s)",
      Option.some("Uninstall skills from workspace"),
    );

    expect(plan.name).toBe("Uninstall skill(s)");
    expect(plan.description).toEqual(Option.some("Uninstall skills from workspace"));
  });

  it("creates a single job with serial concurrency", () => {
    const plan = runBuildPlan(
      [makeOp("a"), makeOp("b")],
      installedWith("a", "b"),
      "Uninstall",
      Option.none(),
    );

    expect(plan.jobs).toHaveLength(1);
    expect(at(plan.jobs, 0).concurrency).toBe(1);
  });

  it("handles mixed ready and error readiness", () => {
    const installed = {
      ...installedWith("commit", "debug"),
    };
    const plan = runBuildPlan(
      [makeOp("commit"), makeOp("review-pr"), makeOp("debug")],
      installed,
      "Uninstall",
      Option.none(),
    );

    const steps = at(plan.jobs, 0).steps;
    expect(at(steps, 0).readiness).toBe("ready");
    expect(at(steps, 0).label).toBe("commit");
    // review-pr is not installed: becomes ready no-op
    expect(at(steps, 1).readiness).toBe("ready");
    expect(at(steps, 1).label).toBe("review-pr");
    expect(at(steps, 2).readiness).toBe("ready");
    expect(at(steps, 2).label).toBe("debug");
  });

  it("marks pack-dependent skill (single pack) as error", () => {
    const plan = runBuildPlan(
      [makeOp("commit")],
      installedWithPacks({ commit: ["my-pack"] }),
      "Uninstall",
      Option.none(),
    );

    const step = at(at(plan.jobs, 0).steps, 0);
    expect(step.readiness).toBe("error");
    if (step.readiness === "error") {
      expect(step.errorMessage).toContain("required by pack my-pack");
    }
  });

  it("marks pack-dependent skill (multiple packs) as error", () => {
    const plan = runBuildPlan(
      [makeOp("commit")],
      installedWithPacks({ commit: ["pack-a", "pack-b"] }),
      "Uninstall",
      Option.none(),
    );

    const step = at(at(plan.jobs, 0).steps, 0);
    expect(step.readiness).toBe("error");
    if (step.readiness === "error") {
      expect(step.errorMessage).toContain("required by pack pack-a, pack-b");
    }
  });
});
