/**
 * Unit tests for pack install buildInstallPlan.
 *
 * Tests the pack-specific plan builder that diffs operations against lockfile state.
 */

import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import type { Lockfile } from "../../../lockfile/schema.js";
import type { InstallSkillOperation } from "../../skills/operations.js";
import type { RegistryPackRef } from "../../../sources/types.js";
import { buildInstallPlan } from "./build-plan.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makePackRef = (
  name: string,
  opts?: {
    skills?: Readonly<Record<string, string>>;
    commands?: Readonly<Record<string, string>>;
    mcpServers?: Readonly<Record<string, string>>;
    version?: string;
  },
): RegistryPackRef => ({
  type: "pack",
  refType: "registry",
  source: { type: "registry", location: new URL("file:///tmp/registry") },
  pack: {
    name,
    skills: opts?.skills ?? {},
    commands: opts?.commands ?? {},
    mcpServers: opts?.mcpServers ?? {},
  },
  scope: "@acme",
  name,
  version: opts?.version ?? "1.0.0",
  integrity: "sha512-AAAA==",
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
    skipSettings: Option.none(),
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
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.steps).toHaveLength(1);
    expect(plan.jobs[0]!.steps[0]!._tag).toBe("PlannedJobStep");
    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "success",
      message: "Installed pack my-pack",
    });
  });

  it("marks already-installed packs as expected no-op", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [],
      lockfile: lockfileWithPacks("my-pack"),
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    expect(plan.jobs[0]!.steps[0]!._tag).toBe("PlannedJobStep");
    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "no-op",
      message: "already installed",
    });
  });

  it("produces plan with only pack step when no skill ops provided", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.steps).toHaveLength(1);
    expect(plan.jobs[0]!.steps[0]!.operation.name).toBe("install-pack");
  });

  it("derives label from pack name", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("pack-a"),
      skillOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    expect(plan.jobs[0]!.steps[0]!.label).toBe("pack-a");
  });

  it("passes through caller-provided name and description", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [],
      lockfile: emptyLockfile,
      name: "Install pack(s)",
      description: Option.some("Install packs from registry"),
      versionConstraint: Option.none(),
    });

    expect(plan.name).toBe("Install pack(s)");
    expect(plan.description).toEqual(Option.some("Install packs from registry"));
  });

  it("creates a single job with serial concurrency", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.concurrency).toBe(1);
  });

  it("treats lockfile without packs field as empty", () => {
    const lockfileNoPacks: Lockfile = {
      lockfileVersion: 1,
      skills: {},
    };
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [],
      lockfile: lockfileNoPacks,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    expect(plan.jobs[0]!.steps[0]!.expectedResult.result).toBe("success");
  });

  // ---------------------------------------------------------------------------
  // InstallPackOperation construction from ref
  // ---------------------------------------------------------------------------

  it("constructs InstallPackOperation from the ref", () => {
    const ref = makePackRef("my-pack", {
      skills: { "@acme/skills/skill-a": "^1.0.0" },
      commands: { "@acme/commands/cmd-b": "^2.0.0" },
      mcpServers: { "@acme/mcp-servers/server-c": "^3.0.0" },
      version: "2.5.0",
    });

    const plan = buildInstallPlan({
      ref,
      skillOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.some("^2.0.0"),
    });

    const packStep = plan.jobs[0]!.steps[0]!;
    expect(packStep.operation.name).toBe("install-pack");
    expect(packStep.operation.args).toMatchObject({
      packName: "my-pack",
      scope: "@acme",
      resolvedVersion: "2.5.0",
      integrity: "sha512-AAAA==",
      sourceName: "default",
      resolvedSkills: { "@acme/skills/skill-a": "^1.0.0" },
      resolvedCommands: { "@acme/commands/cmd-b": "^2.0.0" },
      resolvedMcpServers: { "@acme/mcp-servers/server-c": "^3.0.0" },
      versionConstraint: Option.some("^2.0.0"),
    });
    expect(packStep.operation.args.ref).toBe(ref);
  });

  // ---------------------------------------------------------------------------
  // Mixed operations (pack + skill)
  // ---------------------------------------------------------------------------

  it("produces correct steps for mixed pack and skill operations", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("my-skill")],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

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
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("my-skill")],
      lockfile: lockfileWithSkills("my-skill"),
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = plan.jobs[0]!.steps;
    expect(steps[1]!.expectedResult).toEqual({
      result: "no-op",
      message: "already installed",
    });
  });

  it("marks already-installed skills as no-op", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("skill-a"), makeSkillOp("skill-b")],
      lockfile: lockfileWithSkills("skill-a"),
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = plan.jobs[0]!.steps;
    // Step 0 is the pack op
    expect(steps[1]!.expectedResult.result).toBe("no-op");
    expect(steps[2]!.expectedResult.result).toBe("success");
  });

  it("places pack steps before skill steps in plan order", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("my-skill")],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.operation.name).toBe("install-pack");
    expect(steps[1]!.operation.name).toBe("install-skill");
  });

  it("uses skill name as label for skill steps", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("skill-a"), makeSkillOp("skill-b")],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = plan.jobs[0]!.steps;
    expect(steps[1]!.label).toBe("skill-a");
    expect(steps[2]!.label).toBe("skill-b");
  });

  // ---------------------------------------------------------------------------
  // Mixed no-op: pack installed, some skills installed
  // ---------------------------------------------------------------------------

  it("handles pack installed + some skills already installed", () => {
    const lockfile: Lockfile = {
      ...lockfileWithPacks("my-pack"),
      skills: {
        "skill-a": {
          type: "local" as const,
          path: "/tmp/skills/skill-a",
          agents: [],
          installedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    };

    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("skill-a"), makeSkillOp("skill-b")],
      lockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.expectedResult.result).toBe("no-op"); // pack
    expect(steps[0]!.label).toBe("my-pack");
    expect(steps[1]!.expectedResult.result).toBe("no-op"); // skill-a
    expect(steps[2]!.expectedResult.result).toBe("success"); // skill-b
  });

  // ---------------------------------------------------------------------------
  // Version constraint pass-through
  // ---------------------------------------------------------------------------

  it("passes version constraint to the pack operation", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.some("^2.0.0"),
    });

    const packStep = plan.jobs[0]!.steps[0]!;
    expect(packStep.operation.name).toBe("install-pack");
    expect(packStep.operation.args.versionConstraint).toEqual(Option.some("^2.0.0"));
  });
});
