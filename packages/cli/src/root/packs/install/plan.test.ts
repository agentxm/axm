/**
 * Unit tests for pack install buildInstallPlan.
 *
 * Tests the pack-specific plan builder that diffs operations against lockfile state.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "@axm.sh/core/unstable/agents";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { Lockfile } from "@axm.sh/core/unstable/lockfile";
import type { ExactSemverVersion } from "@axm.sh/core/unstable/version-constraints";
import type { InstallSkillOperation } from "@axm.sh/core/unstable/skills";
import type { InstallCommandOperation } from "@axm.sh/core/unstable/commands";
import type { InstallMcpServerOperation } from "@axm.sh/core/unstable/mcp-servers";
import type { PackDependencyConstraintMap, RegistryPackRef } from "@axm.sh/core/unstable/packs";
import { SourceHostProviders } from "@axm.sh/core/unstable/source-resolution";
import type { SourceHostProvidersService } from "@axm.sh/core/unstable/source-resolution";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import {
  exactVersion,
  makeBaseWorkspaceMock,
  makeRegistryPackLockEntry,
} from "../../../test-stubs.js";
import { TestRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { buildInstallPlan } from "./plan.js";
import type { Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makePackRef = (
  name: string,
  opts?: {
    skills?: PackDependencyConstraintMap;
    commands?: PackDependencyConstraintMap;
    mcpServers?: PackDependencyConstraintMap;
    version?: ExactSemverVersion;
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
  version: opts?.version ?? exactVersion("1.0.0"),
  integrity: Option.some("sha512-AAAA=="),
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
    strictUnknownAgents: Option.none(),
    existingInstalledAt: Option.none(),
    sourceName: Option.none(),
  },
});

const lockfileWithPacks = (...names: string[]): Lockfile => ({
  lockfileVersion: 1,
  skills: {},
  packs: Object.fromEntries(
    names.map((name) => [
      name,
      makeRegistryPackLockEntry({ profile: "@acme", name, sourceName: "local" }),
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
      version: exactVersion("1.0.0"),
      integrity: Option.none(),
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
      version: exactVersion("1.0.0"),
      integrity: Option.none(),
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
        resolvedVersion: exactVersion("1.0.0"),
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
        resolvedVersion: exactVersion("1.0.0"),
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
  buildInstallPlan(args).pipe(Effect.provide(testLayer));

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
const isNoOp = (step: PlannedJobStep) =>
  step.readiness !== "ready"
    ? Effect.succeed(false)
    : step.run.pipe(
        Effect.exit,
        Effect.map(
          (exit) =>
            Exit.isSuccess(exit) &&
            exit.value.result === "success" &&
            exit.value.message.includes("already installed"),
        ),
      );

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildInstallPlan", () => {
  it.effect("marks new packs as ready with run closure", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
    }),
  );

  it.effect("marks already-installed packs as ready no-op", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
      expect(yield* isNoOp(getStep(steps, 0))).toBe(true);
    }),
  );

  it.effect("produces plan with only pack step when no skill ops provided", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
    }),
  );

  it.effect("derives label from pack name", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
    }),
  );

  it.effect("passes through caller-provided name and description", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
    }),
  );

  it.effect("creates a single job with serial concurrency", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
    }),
  );

  it.effect("treats lockfile without packs field as empty", () =>
    Effect.gen(function* () {
      const lockfileNoPacks: Lockfile = {
        lockfileVersion: 1,
        skills: {},
      };
      const plan = yield* runBuild({
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
      expect(yield* isNoOp(getStep(steps, 0))).toBe(false);
    }),
  );

  // ---------------------------------------------------------------------------
  // Mixed operations (pack + skill)
  // ---------------------------------------------------------------------------

  it.effect("produces correct steps for mixed pack and skill operations", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
    }),
  );

  it.effect("checks lockfile.skills for skill no-op detection", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
      expect(yield* isNoOp(getStep(steps, 1))).toBe(true);
    }),
  );

  it.effect("marks already-installed skills as ready no-op", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
      expect(yield* isNoOp(getStep(steps, 1))).toBe(true); // skill-a already installed
      expect(yield* isNoOp(getStep(steps, 2))).toBe(false); // skill-b new
    }),
  );

  it.effect("places pack steps before skill steps in plan order", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
    }),
  );

  it.effect("uses skill name as label for skill steps", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
    }),
  );

  // ---------------------------------------------------------------------------
  // Mixed no-op: pack installed, some skills installed
  // ---------------------------------------------------------------------------

  it.effect("handles pack installed + some skills already installed", () =>
    Effect.gen(function* () {
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

      const plan = yield* runBuild({
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
      expect(yield* isNoOp(getStep(steps, 0))).toBe(true); // pack
      expect(getStep(steps, 0).label).toBe("my-pack");
      expect(yield* isNoOp(getStep(steps, 1))).toBe(true); // skill-a
      expect(yield* isNoOp(getStep(steps, 2))).toBe(false); // skill-b
    }),
  );

  // ---------------------------------------------------------------------------
  // Command operations
  // ---------------------------------------------------------------------------

  it.effect("includes command ops in plan", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
    }),
  );

  it.effect("marks already-installed commands as ready no-op", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
      expect(yield* isNoOp(getStep(steps, 1))).toBe(true);
    }),
  );

  it.effect("uses command name as label for command steps", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
    }),
  );

  // ---------------------------------------------------------------------------
  // MCP server operations
  // ---------------------------------------------------------------------------

  it.effect("includes mcp-server ops in plan", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
    }),
  );

  it.effect("marks already-installed mcp-servers as ready no-op", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
      expect(yield* isNoOp(getStep(steps, 1))).toBe(true);
    }),
  );

  // ---------------------------------------------------------------------------
  // Mixed: all extension types
  // ---------------------------------------------------------------------------

  it.effect("orders steps: pack, skills, commands, mcp-servers", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
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
    }),
  );

  it.effect("handles mixed no-ops across extension types", () =>
    Effect.gen(function* () {
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
            resolvedVersion: exactVersion("1.0.0"),
            integrity: "",
            sourceName: "default",
            installedAt: new Date(),
            updatedAt: new Date(),
          },
        },
      };

      const plan = yield* runBuild({
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
      expect(yield* isNoOp(getStep(steps, 0))).toBe(true); // pack
      expect(yield* isNoOp(getStep(steps, 1))).toBe(true); // skill-a
      expect(yield* isNoOp(getStep(steps, 2))).toBe(true); // cmd-a
      expect(yield* isNoOp(getStep(steps, 3))).toBe(false); // cmd-b
      expect(yield* isNoOp(getStep(steps, 4))).toBe(false); // server-a
    }),
  );
});
