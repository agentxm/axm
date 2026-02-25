/**
 * Unit tests for pack install buildInstallPlan.
 *
 * Tests the pack-specific plan builder that diffs operations against lockfile state.
 */

import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import type { Lockfile } from "../../../lockfile/schema.js";
import type { InstallSkillOperation } from "../../../extensions/skills/operations/install.js";
import type { InstallCommandOperation } from "../../../extensions/commands/operations/install.js";
import type { InstallMcpServerOperation } from "../../../extensions/mcp-servers/operations/install.js";
import type { RegistryPackRef } from "../../../sources/types.js";
import type { PlannedJobStep } from "../../../workspace/plan.js";
import { buildInstallPlan } from "./plan.js";

// Assertion needed: plan builders only produce PlannedJobStep
const planned = <T>(step: { readonly _tag: string }) => step as PlannedJobStep<T>;

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
  source: { type: "registry", location: new URL("file:///tmp/registry"), namespace: Option.none() },
  pack: {
    name,
    skills: opts?.skills ?? {},
    commands: opts?.commands ?? {},
    mcpServers: opts?.mcpServers ?? {},
  },
  namespace: "@acme",
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

const makeRegistrySkillOp = (name: string, version: string): InstallSkillOperation => ({
  name: "install-skill",
  args: {
    ref: {
      type: "skill",
      refType: "registry",
      skill: { name, description: Option.some(`Skill ${name}`), metadata: Option.none() },
      source: {
        type: "registry",
        location: new URL("file:///tmp/registry"),
        namespace: Option.none(),
      },
      namespace: "@acme",
      name,
      version,
      integrity: "",
    },
    force: false,
    versionConstraint: Option.none(),
    skipSettings: Option.some(true),
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
        namespace: "@acme",
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

const makeCommandOp = (name: string): InstallCommandOperation => ({
  name: "install-command",
  args: {
    ref: {
      type: "command",
      refType: "registry",
      command: { name },
      source: {
        type: "registry",
        location: new URL("file:///tmp/registry"),
        namespace: Option.none(),
      },
      namespace: "@acme",
      name,
      version: "1.0.0",
      integrity: "",
    },
    force: false,
    versionConstraint: Option.none(),
    skipSettings: Option.some(true),
  },
});

const makeMcpServerOp = (name: string): InstallMcpServerOperation => ({
  name: "install-mcp-server",
  args: {
    ref: {
      type: "mcp-server",
      refType: "registry",
      server: { name },
      source: {
        type: "registry",
        location: new URL("file:///tmp/registry"),
        namespace: Option.none(),
      },
      namespace: "@acme",
      name,
      version: "1.0.0",
      integrity: "",
    },
    force: false,
    versionConstraint: Option.none(),
    skipSettings: Option.some(true),
  },
});

const lockfileWithCommands = (...names: string[]): Lockfile => ({
  lockfileVersion: 1,
  skills: {},
  commands: Object.fromEntries(
    names.map((name) => [
      name,
      {
        type: "registry" as const,
        namespace: "@acme",
        name,
        resolvedVersion: "1.0.0",
        integrity: "",
        sourceName: "default",
        installedAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
  ),
});

const lockfileWithMcpServers = (...names: string[]): Lockfile => ({
  lockfileVersion: 1,
  skills: {},
  mcpServers: Object.fromEntries(
    names.map((name) => [
      name,
      {
        type: "registry" as const,
        namespace: "@acme",
        name,
        resolvedVersion: "1.0.0",
        integrity: "",
        sourceName: "default",
        installedAt: new Date(),
        updatedAt: new Date(),
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
  it("marks new packs as ready", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [],
      commandOps: [],
      mcpServerOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.steps).toHaveLength(1);
    expect(plan.jobs[0]!.steps[0]!._tag).toBe("PlannedJobStep");
    expect(planned(plan.jobs[0]!.steps[0]!).readiness).toEqual({
      status: "ready",
      message: Option.none(),
    });
  });

  it("marks already-installed packs as skip", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [],
      commandOps: [],
      mcpServerOps: [],
      lockfile: lockfileWithPacks("my-pack"),
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    expect(plan.jobs[0]!.steps[0]!._tag).toBe("PlannedJobStep");
    expect(planned(plan.jobs[0]!.steps[0]!).readiness).toEqual({
      status: "skip",
      message: "already installed",
    });
  });

  it("produces plan with only pack step when no skill ops provided", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [],
      commandOps: [],
      mcpServerOps: [],
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
      commandOps: [],
      mcpServerOps: [],
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
      commandOps: [],
      mcpServerOps: [],
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
      commandOps: [],
      mcpServerOps: [],
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
      commandOps: [],
      mcpServerOps: [],
      lockfile: lockfileNoPacks,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    expect(planned(plan.jobs[0]!.steps[0]!).readiness.status).toBe("ready");
  });

  // ---------------------------------------------------------------------------
  // InstallPackOperation construction from ref
  // ---------------------------------------------------------------------------

  it("constructs InstallPackOperation with exact resolved maps from dependency ops", () => {
    const ref = makePackRef("my-pack", {
      skills: { "@acme/skills/skill-a": "^1.0.0" },
      commands: { "@acme/commands/cmd-b": "^2.0.0" },
      mcpServers: { "@acme/mcp-servers/server-c": "^3.0.0" },
      version: "2.5.0",
    });

    const plan = buildInstallPlan({
      ref,
      skillOps: [makeRegistrySkillOp("skill-a", "1.4.2")],
      commandOps: [makeCommandOp("cmd-b")],
      mcpServerOps: [makeMcpServerOp("server-c")],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.some("^2.0.0"),
    });

    const packStep = plan.jobs[0]!.steps[0]!;
    expect(packStep.operation.name).toBe("install-pack");
    expect(packStep.operation.args).toMatchObject({
      packName: "my-pack",
      namespace: "@acme",
      resolvedVersion: "2.5.0",
      integrity: "sha512-AAAA==",
      sourceName: "default",
      resolvedSkills: { "@acme/skills/skill-a": "1.4.2" },
      resolvedCommands: { "@acme/commands/cmd-b": "1.0.0" },
      resolvedMcpServers: { "@acme/mcp-servers/server-c": "1.0.0" },
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
      commandOps: [],
      mcpServerOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = plan.jobs[0]!.steps;
    expect(steps).toHaveLength(2);
    expect(planned(steps[0]!).readiness).toEqual({
      status: "ready",
      message: Option.none(),
    });
    expect(planned(steps[1]!).readiness).toEqual({
      status: "ready",
      message: Option.none(),
    });
  });

  it("checks lockfile.skills for skill skip detection", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("my-skill")],
      commandOps: [],
      mcpServerOps: [],
      lockfile: lockfileWithSkills("my-skill"),
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = plan.jobs[0]!.steps;
    expect(planned(steps[1]!).readiness).toEqual({
      status: "skip",
      message: "already installed",
    });
  });

  it("marks already-installed skills as skip", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("skill-a"), makeSkillOp("skill-b")],
      commandOps: [],
      mcpServerOps: [],
      lockfile: lockfileWithSkills("skill-a"),
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = plan.jobs[0]!.steps;
    // Step 0 is the pack op
    expect(planned(steps[1]!).readiness.status).toBe("skip");
    expect(planned(steps[2]!).readiness.status).toBe("ready");
  });

  it("places pack steps before skill steps in plan order", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("my-skill")],
      commandOps: [],
      mcpServerOps: [],
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
      commandOps: [],
      mcpServerOps: [],
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
      commandOps: [],
      mcpServerOps: [],
      lockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = plan.jobs[0]!.steps;
    expect(planned(steps[0]!).readiness.status).toBe("skip"); // pack
    expect(steps[0]!.label).toBe("my-pack");
    expect(planned(steps[1]!).readiness.status).toBe("skip"); // skill-a
    expect(planned(steps[2]!).readiness.status).toBe("ready"); // skill-b
  });

  // ---------------------------------------------------------------------------
  // Version constraint pass-through
  // ---------------------------------------------------------------------------

  it("passes version constraint to the pack operation", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [],
      commandOps: [],
      mcpServerOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.some("^2.0.0"),
    });

    const packStep = plan.jobs[0]!.steps[0]!;
    expect(packStep.operation.name).toBe("install-pack");
    expect(packStep.operation.args.versionConstraint).toEqual(Option.some("^2.0.0"));
  });

  // ---------------------------------------------------------------------------
  // Command operations
  // ---------------------------------------------------------------------------

  it("includes command ops in plan", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [],
      commandOps: [makeCommandOp("my-cmd")],
      mcpServerOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = plan.jobs[0]!.steps;
    expect(steps).toHaveLength(2);
    expect(steps[0]!.operation.name).toBe("install-pack");
    expect(steps[1]!.operation.name).toBe("install-command");
    expect(planned(steps[1]!).readiness).toEqual({
      status: "ready",
      message: Option.none(),
    });
  });

  it("marks already-installed commands as skip", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [],
      commandOps: [makeCommandOp("my-cmd")],
      mcpServerOps: [],
      lockfile: lockfileWithCommands("my-cmd"),
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = plan.jobs[0]!.steps;
    expect(planned(steps[1]!).readiness).toEqual({
      status: "skip",
      message: "already installed",
    });
  });

  it("uses command name as label for command steps", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [],
      commandOps: [makeCommandOp("cmd-a"), makeCommandOp("cmd-b")],
      mcpServerOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = plan.jobs[0]!.steps;
    expect(steps[1]!.label).toBe("cmd-a");
    expect(steps[2]!.label).toBe("cmd-b");
  });

  // ---------------------------------------------------------------------------
  // MCP server operations
  // ---------------------------------------------------------------------------

  it("includes mcp-server ops in plan", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [],
      commandOps: [],
      mcpServerOps: [makeMcpServerOp("my-server")],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = plan.jobs[0]!.steps;
    expect(steps).toHaveLength(2);
    expect(steps[0]!.operation.name).toBe("install-pack");
    expect(steps[1]!.operation.name).toBe("install-mcp-server");
    expect(planned(steps[1]!).readiness).toEqual({
      status: "ready",
      message: Option.none(),
    });
  });

  it("marks already-installed mcp-servers as skip", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [],
      commandOps: [],
      mcpServerOps: [makeMcpServerOp("my-server")],
      lockfile: lockfileWithMcpServers("my-server"),
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = plan.jobs[0]!.steps;
    expect(planned(steps[1]!).readiness).toEqual({
      status: "skip",
      message: "already installed",
    });
  });

  // ---------------------------------------------------------------------------
  // Mixed: all extension types
  // ---------------------------------------------------------------------------

  it("orders steps: pack, skills, commands, mcp-servers", () => {
    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("my-skill")],
      commandOps: [makeCommandOp("my-cmd")],
      mcpServerOps: [makeMcpServerOp("my-server")],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = plan.jobs[0]!.steps;
    expect(steps).toHaveLength(4);
    expect(steps[0]!.operation.name).toBe("install-pack");
    expect(steps[1]!.operation.name).toBe("install-skill");
    expect(steps[2]!.operation.name).toBe("install-command");
    expect(steps[3]!.operation.name).toBe("install-mcp-server");
  });

  it("handles mixed no-ops across extension types", () => {
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
      commands: {
        "cmd-a": {
          type: "registry" as const,
          namespace: "@acme",
          name: "cmd-a",
          resolvedVersion: "1.0.0",
          integrity: "",
          sourceName: "default",
          installedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    };

    const plan = buildInstallPlan({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("skill-a")],
      commandOps: [makeCommandOp("cmd-a"), makeCommandOp("cmd-b")],
      mcpServerOps: [makeMcpServerOp("server-a")],
      lockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = plan.jobs[0]!.steps;
    expect(planned(steps[0]!).readiness.status).toBe("skip"); // pack
    expect(planned(steps[1]!).readiness.status).toBe("skip"); // skill-a
    expect(planned(steps[2]!).readiness.status).toBe("skip"); // cmd-a
    expect(planned(steps[3]!).readiness.status).toBe("ready"); // cmd-b
    expect(planned(steps[4]!).readiness.status).toBe("ready"); // server-a
  });
});
