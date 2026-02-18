/**
 * Unit tests for pack install buildInstallPlan.
 *
 * Tests the pack-specific plan builder that diffs operations against lockfile state.
 */

import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import type { Lockfile } from "../../../lockfile/schema.js";
import type { InstallSkillOperation } from "../../skills/operations.js";
import type { InstallPackOperation } from "../operations.js";
import { buildInstallPlan } from "./build-plan.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeOp = (name: string): InstallPackOperation => ({
  name: "install-pack",
  args: {
    packName: name,
    scope: "@acme",
    resolvedVersion: "1.0.0",
    integrity: "sha512-AAAA==",
    sourceName: "local",
    resolvedSkills: { [`@acme/skill-a`]: "1.0.0" },
    resolvedCommands: {},
    resolvedMcpServers: {},
    versionConstraint: Option.none(),
  },
});

const emptyLockfile: Lockfile = {
  lockfileVersion: 1,
  skills: {},
};

const makeSkillOp = (name: string): InstallSkillOperation => ({
  name: "install-skill",
  args: {
    ref: {
      type: "skill",
      refType: "local",
      skill: { name, description: Option.some(`Skill ${name}`), metadata: Option.none() },
      source: { type: "local", path: `/tmp/skills/${name}` },
      location: `file:///tmp/skills/${name}`,
    },
    force: false,
    versionConstraint: Option.none(),
  },
});

const lockfileWithPacks = (...names: string[]): Lockfile => ({
  lockfileVersion: 1,
  skills: {},
  packs: Object.fromEntries(
    names.map((name) => [
      name,
      {
        type: "registry" as const,
        scope: "@acme",
        name,
        resolvedVersion: "1.0.0",
        integrity: "sha512-AAAA==",
        sourceName: "local",
        installedAt: new Date(),
        updatedAt: new Date(),
        resolvedSkills: {},
        resolvedCommands: {},
        resolvedMcpServers: {},
      },
    ]),
  ),
});

const lockfileWithSkills = (...names: string[]): Lockfile => ({
  lockfileVersion: 1,
  skills: Object.fromEntries(
    names.map((name) => [
      name,
      {
        type: "local" as const,
        path: `/tmp/skills/${name}`,
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

describe("buildInstallPlan", () => {
  it("marks new packs as expected success", () => {
    const plan = buildInstallPlan(
      [makeOp("my-pack")],
      emptyLockfile,
      "Install pack",
      Option.none(),
    );

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.steps).toHaveLength(1);
    expect(plan.jobs[0]!.steps[0]!._tag).toBe("PlannedJobStep");
    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "success",
      message: "Installed pack my-pack",
    });
  });

  it("marks already-installed packs as expected no-op", () => {
    const plan = buildInstallPlan(
      [makeOp("my-pack")],
      lockfileWithPacks("my-pack"),
      "Install pack",
      Option.none(),
    );

    expect(plan.jobs[0]!.steps[0]!._tag).toBe("PlannedJobStep");
    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "no-op",
      message: "already installed",
    });
  });

  it("produces empty plan from empty operations", () => {
    const plan = buildInstallPlan([], emptyLockfile, "Install pack", Option.none());

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.steps).toHaveLength(0);
  });

  it("derives label from pack name", () => {
    const plan = buildInstallPlan(
      [makeOp("pack-a"), makeOp("pack-b")],
      emptyLockfile,
      "Install pack",
      Option.none(),
    );

    expect(plan.jobs[0]!.steps[0]!.label).toBe("pack-a");
    expect(plan.jobs[0]!.steps[1]!.label).toBe("pack-b");
  });

  it("passes through caller-provided name and description", () => {
    const plan = buildInstallPlan(
      [makeOp("my-pack")],
      emptyLockfile,
      "Install pack(s)",
      Option.some("Install packs from registry"),
    );

    expect(plan.name).toBe("Install pack(s)");
    expect(plan.description).toEqual(Option.some("Install packs from registry"));
  });

  it("creates a single job with serial concurrency", () => {
    const plan = buildInstallPlan(
      [makeOp("a"), makeOp("b")],
      emptyLockfile,
      "Install pack",
      Option.none(),
    );

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.concurrency).toBe(1);
  });

  it("handles mixed success and no-op expected results", () => {
    const plan = buildInstallPlan(
      [makeOp("pack-a"), makeOp("pack-b"), makeOp("pack-c")],
      lockfileWithPacks("pack-b"),
      "Install pack",
      Option.none(),
    );

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.expectedResult.result).toBe("success");
    expect(steps[0]!.label).toBe("pack-a");
    expect(steps[1]!.expectedResult.result).toBe("no-op");
    expect(steps[1]!.label).toBe("pack-b");
    expect(steps[2]!.expectedResult.result).toBe("success");
    expect(steps[2]!.label).toBe("pack-c");
  });

  it("treats lockfile without packs field as empty", () => {
    const lockfileNoPacks: Lockfile = {
      lockfileVersion: 1,
      skills: {},
    };
    const plan = buildInstallPlan(
      [makeOp("my-pack")],
      lockfileNoPacks,
      "Install pack",
      Option.none(),
    );

    expect(plan.jobs[0]!.steps[0]!.expectedResult.result).toBe("success");
  });

  // ---------------------------------------------------------------------------
  // Mixed operations (pack + skill)
  // ---------------------------------------------------------------------------

  it("produces correct steps for mixed pack and skill operations", () => {
    const plan = buildInstallPlan(
      [makeOp("my-pack"), makeSkillOp("my-skill")],
      emptyLockfile,
      "Install pack",
      Option.none(),
    );

    const steps = plan.jobs[0]!.steps;
    expect(steps).toHaveLength(2);
    expect(steps[0]!.expectedResult).toEqual({
      result: "success",
      message: "Installed pack my-pack",
    });
    expect(steps[1]!.expectedResult).toEqual({
      result: "success",
      message: "Installed skill my-skill",
    });
  });

  it("checks lockfile.skills for skill no-op detection", () => {
    const plan = buildInstallPlan(
      [makeSkillOp("my-skill")],
      lockfileWithSkills("my-skill"),
      "Install pack",
      Option.none(),
    );

    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "no-op",
      message: "already installed",
    });
  });

  it("marks already-installed skills as no-op", () => {
    const plan = buildInstallPlan(
      [makeSkillOp("skill-a"), makeSkillOp("skill-b")],
      lockfileWithSkills("skill-a"),
      "Install pack",
      Option.none(),
    );

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.expectedResult.result).toBe("no-op");
    expect(steps[1]!.expectedResult.result).toBe("success");
  });

  it("places pack steps before skill steps in plan order", () => {
    const plan = buildInstallPlan(
      [makeOp("my-pack"), makeSkillOp("my-skill")],
      emptyLockfile,
      "Install pack",
      Option.none(),
    );

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.operation.name).toBe("install-pack");
    expect(steps[1]!.operation.name).toBe("install-skill");
  });

  it("uses skill name as label for skill steps", () => {
    const plan = buildInstallPlan(
      [makeSkillOp("skill-a"), makeSkillOp("skill-b")],
      emptyLockfile,
      "Install pack",
      Option.none(),
    );

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.label).toBe("skill-a");
    expect(steps[1]!.label).toBe("skill-b");
  });
});
