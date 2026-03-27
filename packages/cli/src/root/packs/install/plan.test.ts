/**
 * Unit tests for pack install buildInstallPlan.
 *
 * Tests the pack-specific plan builder that diffs operations against lockfile state.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "@axm.sh/core/unstable/agents";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { Lockfile } from "@axm.sh/core/unstable/lockfile";
import type { InstallSkillOperation } from "@axm.sh/core/unstable/skills";
import type { InstallCommandOperation } from "@axm.sh/core/unstable/commands";
import type { InstallMcpServerOperation } from "@axm.sh/core/unstable/mcp-servers";
import type { RegistryPackRef } from "@axm.sh/core/unstable/packs";
import { SourceHostProviders } from "@axm.sh/core/unstable/source-resolution";
import type { SourceHostProvidersService } from "@axm.sh/core/unstable/source-resolution";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import { makeBaseWorkspaceMock } from "../../../test-stubs.js";
import { TestRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { buildInstallPlan } from "./plan.js";
import type { Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";

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
  source: { type: "registry", location: new URL("file:///tmp/registry"), profile: Option.none() },
  pack: {
    name,
    skills: opts?.skills ?? {},
    commands: opts?.commands ?? {},
    mcpServers: opts?.mcpServers ?? {},
  },
  profile: "@acme",
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
    sourceName: Option.none(),
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
        profile: "@acme",
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
        profile: Option.none(),
      },
      profile: "@acme",
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
        profile: Option.none(),
      },
      profile: "@acme",
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
        profile: "@acme",
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
        profile: "@acme",
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

// Mock services needed for plan construction
const { layer: RendererTestLayer } = TestRenderer.make();
const sourceHostProvidersStub: SourceHostProvidersService = {
  find: () => Effect.succeed([]),
  fetch: () => Effect.die("unexpected fetch in plan test"),
  cloneUrl: () => Option.none(),
  origin: () => "test",
};
const defaultAgentRepo: CodingAgentRepositoryService = {
  get: () => Effect.die(new Error("not implemented")),
  all: Effect.succeed([]),
  getConfiguredAgents: () => Effect.succeed([]),
  getUnknownConfiguredAgentIds: () => Effect.succeed([]),
};
const testLayer = Layer.mergeAll(
  RendererTestLayer,
  Layer.succeed(Workspace, makeBaseWorkspaceMock("/tmp/axm")),
  Layer.succeed(SourceHostProviders, sourceHostProvidersStub),
  NodeServices.layer,
  Layer.succeed(CodingAgentRepository, defaultAgentRepo),
);

const runBuild = (args: Parameters<typeof buildInstallPlan>[0]) =>
  Effect.runSync(buildInstallPlan(args).pipe(Effect.provide(testLayer)));

const getItem = <T>(items: ReadonlyArray<T>, index: number, label: string): T => {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Missing ${label} at index ${index}`);
  }
  return item;
};

const getJob = (plan: Plan) => getItem(plan.jobs, 0, "job");

const getSteps = (plan: Plan) => getJob(plan).steps;

const getStep = (steps: ReadonlyArray<PlannedJobStep>, index: number) =>
  getItem(steps, index, "step");

/** Check if a ready step's run returns "already installed" (no-op detection). */
const isNoOp = (step: PlannedJobStep) => {
  if (step.readiness !== "ready") return false;
  try {
    const result = Effect.runSync(step.run);
    return result.result === "success" && result.message.includes("already installed");
  } catch {
    return false;
  }
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildInstallPlan", () => {
  it("marks new packs as ready with run closure", () => {
    const plan = runBuild({
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
    expect(getSteps(plan)).toHaveLength(1);
    expect(getStep(getSteps(plan), 0).readiness).toBe("ready");
    expect("run" in getStep(getSteps(plan), 0)).toBe(true);
  });

  it("marks already-installed packs as ready no-op", () => {
    const plan = runBuild({
      ref: makePackRef("my-pack"),
      skillOps: [],
      commandOps: [],
      mcpServerOps: [],
      lockfile: lockfileWithPacks("my-pack"),
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = getSteps(plan);
    expect(getStep(steps, 0).readiness).toBe("ready");
    expect(isNoOp(getStep(steps, 0))).toBe(true);
  });

  it("produces plan with only pack step when no skill ops provided", () => {
    const plan = runBuild({
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
    expect(getSteps(plan)).toHaveLength(1);
    expect(getStep(getSteps(plan), 0).label).toBe("my-pack");
  });

  it("derives label from pack name", () => {
    const plan = runBuild({
      ref: makePackRef("pack-a"),
      skillOps: [],
      commandOps: [],
      mcpServerOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    expect(getStep(getSteps(plan), 0).label).toBe("pack-a");
  });

  it("passes through caller-provided name and description", () => {
    const plan = runBuild({
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
    const plan = runBuild({
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
    expect(getJob(plan).concurrency).toBe(1);
  });

  it("treats lockfile without packs field as empty", () => {
    const lockfileNoPacks: Lockfile = {
      lockfileVersion: 1,
      skills: {},
    };
    const plan = runBuild({
      ref: makePackRef("my-pack"),
      skillOps: [],
      commandOps: [],
      mcpServerOps: [],
      lockfile: lockfileNoPacks,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = getSteps(plan);
    expect(getStep(steps, 0).readiness).toBe("ready");
    expect(isNoOp(getStep(steps, 0))).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Mixed operations (pack + skill)
  // ---------------------------------------------------------------------------

  it("produces correct steps for mixed pack and skill operations", () => {
    const plan = runBuild({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("my-skill")],
      commandOps: [],
      mcpServerOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = getSteps(plan);
    expect(steps).toHaveLength(2);
    expect(getStep(steps, 0).readiness).toBe("ready");
    expect(getStep(steps, 1).readiness).toBe("ready");
  });

  it("checks lockfile.skills for skill no-op detection", () => {
    const plan = runBuild({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("my-skill")],
      commandOps: [],
      mcpServerOps: [],
      lockfile: lockfileWithSkills("my-skill"),
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = getSteps(plan);
    expect(isNoOp(getStep(steps, 1))).toBe(true);
  });

  it("marks already-installed skills as ready no-op", () => {
    const plan = runBuild({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("skill-a"), makeSkillOp("skill-b")],
      commandOps: [],
      mcpServerOps: [],
      lockfile: lockfileWithSkills("skill-a"),
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = getSteps(plan);
    // Step 0 is the pack op
    expect(isNoOp(getStep(steps, 1))).toBe(true); // skill-a already installed
    expect(isNoOp(getStep(steps, 2))).toBe(false); // skill-b new
  });

  it("places pack steps before skill steps in plan order", () => {
    const plan = runBuild({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("my-skill")],
      commandOps: [],
      mcpServerOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = getSteps(plan);
    expect(getStep(steps, 0).label).toBe("my-pack");
    expect(getStep(steps, 1).label).toBe("my-skill");
  });

  it("uses skill name as label for skill steps", () => {
    const plan = runBuild({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("skill-a"), makeSkillOp("skill-b")],
      commandOps: [],
      mcpServerOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = getSteps(plan);
    expect(getStep(steps, 1).label).toBe("skill-a");
    expect(getStep(steps, 2).label).toBe("skill-b");
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

    const plan = runBuild({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("skill-a"), makeSkillOp("skill-b")],
      commandOps: [],
      mcpServerOps: [],
      lockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = getSteps(plan);
    expect(isNoOp(getStep(steps, 0))).toBe(true); // pack
    expect(getStep(steps, 0).label).toBe("my-pack");
    expect(isNoOp(getStep(steps, 1))).toBe(true); // skill-a
    expect(isNoOp(getStep(steps, 2))).toBe(false); // skill-b
  });

  // ---------------------------------------------------------------------------
  // Command operations
  // ---------------------------------------------------------------------------

  it("includes command ops in plan", () => {
    const plan = runBuild({
      ref: makePackRef("my-pack"),
      skillOps: [],
      commandOps: [makeCommandOp("my-cmd")],
      mcpServerOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = getSteps(plan);
    expect(steps).toHaveLength(2);
    expect(getStep(steps, 0).label).toBe("my-pack");
    expect(getStep(steps, 1).label).toBe("my-cmd");
    expect(getStep(steps, 1).readiness).toBe("ready");
  });

  it("marks already-installed commands as ready no-op", () => {
    const plan = runBuild({
      ref: makePackRef("my-pack"),
      skillOps: [],
      commandOps: [makeCommandOp("my-cmd")],
      mcpServerOps: [],
      lockfile: lockfileWithCommands("my-cmd"),
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = getSteps(plan);
    expect(isNoOp(getStep(steps, 1))).toBe(true);
  });

  it("uses command name as label for command steps", () => {
    const plan = runBuild({
      ref: makePackRef("my-pack"),
      skillOps: [],
      commandOps: [makeCommandOp("cmd-a"), makeCommandOp("cmd-b")],
      mcpServerOps: [],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = getSteps(plan);
    expect(getStep(steps, 1).label).toBe("cmd-a");
    expect(getStep(steps, 2).label).toBe("cmd-b");
  });

  // ---------------------------------------------------------------------------
  // MCP server operations
  // ---------------------------------------------------------------------------

  it("includes mcp-server ops in plan", () => {
    const plan = runBuild({
      ref: makePackRef("my-pack"),
      skillOps: [],
      commandOps: [],
      mcpServerOps: [makeMcpServerOp("my-server")],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = getSteps(plan);
    expect(steps).toHaveLength(2);
    expect(getStep(steps, 0).label).toBe("my-pack");
    expect(getStep(steps, 1).label).toBe("my-server");
    expect(getStep(steps, 1).readiness).toBe("ready");
  });

  it("marks already-installed mcp-servers as ready no-op", () => {
    const plan = runBuild({
      ref: makePackRef("my-pack"),
      skillOps: [],
      commandOps: [],
      mcpServerOps: [makeMcpServerOp("my-server")],
      lockfile: lockfileWithMcpServers("my-server"),
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = getSteps(plan);
    expect(isNoOp(getStep(steps, 1))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Mixed: all extension types
  // ---------------------------------------------------------------------------

  it("orders steps: pack, skills, commands, mcp-servers", () => {
    const plan = runBuild({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("my-skill")],
      commandOps: [makeCommandOp("my-cmd")],
      mcpServerOps: [makeMcpServerOp("my-server")],
      lockfile: emptyLockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = getSteps(plan);
    expect(steps).toHaveLength(4);
    expect(getStep(steps, 0).label).toBe("my-pack");
    expect(getStep(steps, 1).label).toBe("my-skill");
    expect(getStep(steps, 2).label).toBe("my-cmd");
    expect(getStep(steps, 3).label).toBe("my-server");
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
          profile: "@acme",
          name: "cmd-a",
          resolvedVersion: "1.0.0",
          integrity: "",
          sourceName: "default",
          installedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    };

    const plan = runBuild({
      ref: makePackRef("my-pack"),
      skillOps: [makeSkillOp("skill-a")],
      commandOps: [makeCommandOp("cmd-a"), makeCommandOp("cmd-b")],
      mcpServerOps: [makeMcpServerOp("server-a")],
      lockfile,
      name: "Install pack",
      description: Option.none(),
      versionConstraint: Option.none(),
    });

    const steps = getSteps(plan);
    expect(isNoOp(getStep(steps, 0))).toBe(true); // pack
    expect(isNoOp(getStep(steps, 1))).toBe(true); // skill-a
    expect(isNoOp(getStep(steps, 2))).toBe(true); // cmd-a
    expect(isNoOp(getStep(steps, 3))).toBe(false); // cmd-b
    expect(isNoOp(getStep(steps, 4))).toBe(false); // server-a
  });
});
