/**
 * Unit tests for pack install buildInstallPlan.
 *
 * Tests the pack-specific plan builder that diffs operations against lockfile state.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "@agentxm/client-core/unstable/agents";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import {
  normalizeHandle,
  type ExtensionDependencyConstraintMap,
} from "@agentxm/client-core/unstable/extensions";
import type { Lockfile } from "@agentxm/client-core/unstable/lockfile";
import type { Version } from "@agentxm/client-core/unstable/version-constraints";
import type { InstallSkillOperation } from "@agentxm/client-core/unstable/skills";
import type { InstallCommandOperation } from "@agentxm/client-core/unstable/commands";
import type { InstallMcpServerOperation } from "@agentxm/client-core/unstable/mcps";
import type { RegistryPackRef } from "@agentxm/client-core/unstable/packs";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import type { SourceHostProvidersService } from "@agentxm/client-core/unstable/source-resolution";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import {
  extensionName,
  exactVersion,
  makeBaseWorkspaceMock,
  makeRegistryPackLockEntry,
} from "../../../test-stubs.js";
import { decodeRelativePathSync } from "@agentxm/client-core/unstable/utils";
import { TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { buildInstallPlan } from "./plan.js";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";

const ACME = normalizeHandle("@acme");

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makePackRef = (
  name: string,
  opts?: {
    skills?: ExtensionDependencyConstraintMap;
    commands?: ExtensionDependencyConstraintMap;
    mcpServers?: ExtensionDependencyConstraintMap;
    subagents?: ExtensionDependencyConstraintMap;
    version?: Version;
  },
): RegistryPackRef => ({
  type: "pack",
  refType: "registry",
  source: { type: "registry", location: new URL("file:///tmp/registry"), owner: Option.none() },
  pack: {
    name: extensionName(name),
    dependencies: {
      ...(opts?.skills ?? {}),
      ...(opts?.commands ?? {}),
      ...(opts?.mcpServers ?? {}),
      ...(opts?.subagents ?? {}),
    },
  },
  owner: ACME,
  name: extensionName(name),
  version: opts?.version ?? exactVersion("1.0.0"),
  integrity: Option.some("sha512-AAAA=="),
  publisherBindingId: "hbnd_test",
  packages: [],
});

const emptyLockfile: Lockfile = {
  lockfileVersion: 3,
  skills: {},
};

const makeSkillOp = (name: string): InstallSkillOperation => ({
  name: "install-skill",
  args: {
    ref: {
      type: "skill",
      refType: "local",
      skill: {
        name: extensionName(name),
        description: Option.some(`Skill ${name}`),
        metadata: Option.none(),
      },
      source: { type: "local", path: `/tmp/skills/${name}` },
      location: `file:///tmp/skills/${name}`,
    },
    force: false,
    versionRange: Option.none(),
    skipSettings: Option.none(),
    strictUnknownAgents: Option.none(),
    existingInstalledAt: Option.none(),
    sourceName: Option.none(),
  },
});

const lockfileWithPacks = (...names: string[]): Lockfile => ({
  lockfileVersion: 3,
  skills: {},
  packs: Object.fromEntries(
    names.map((name) => [
      name,
      makeRegistryPackLockEntry({
        owner: ACME,
        name: extensionName(name),
        sourceName: "local",
        publisherBindingId: "hbnd_test",
      }),
    ]),
  ),
});

const makeCommandOp = (name: string): InstallCommandOperation => ({
  name: "install-command",
  args: {
    ref: {
      type: "command",
      refType: "registry",
      command: { name: extensionName(name) },
      source: {
        type: "registry",
        location: new URL("file:///tmp/registry"),
        owner: Option.none(),
      },
      owner: ACME,
      name: extensionName(name),
      version: exactVersion("1.0.0"),
      integrity: Option.none(),
      publisherBindingId: "hbnd_test",
      packages: [],
    },
    force: false,
    versionRange: Option.none(),
    skipSettings: Option.some(true),
  },
});

const makeMcpServerOp = (name: string): InstallMcpServerOperation => ({
  name: "install-mcp-server",
  args: {
    ref: {
      type: "mcp-server",
      refType: "registry",
      server: { name: extensionName(name) },
      source: {
        type: "registry",
        location: new URL("file:///tmp/registry"),
        owner: Option.none(),
      },
      owner: ACME,
      name: extensionName(name),
      version: exactVersion("1.0.0"),
      integrity: Option.none(),
      publisherBindingId: "hbnd_test",
      packages: [],
    },
    force: false,
    versionRange: Option.none(),
    skipSettings: Option.some(true),
  },
});

const lockfileWithCommands = (...names: string[]): Lockfile => ({
  lockfileVersion: 3,
  skills: {},
  commands: Object.fromEntries(
    names.map((name) => [
      name,
      {
        type: "registry" as const,
        owner: ACME,
        name: extensionName(name),
        resolvedVersion: exactVersion("1.0.0"),
        integrity: "",
        sourceName: "default",
        publisherBindingId: "hbnd_test",
        agents: [] as ReadonlyArray<string>,
        installedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
        updatedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
      },
    ]),
  ),
});

const lockfileWithMcpServers = (...names: string[]): Lockfile => ({
  lockfileVersion: 3,
  skills: {},
  mcpServers: Object.fromEntries(
    names.map((name) => [
      name,
      {
        type: "registry" as const,
        owner: ACME,
        name: extensionName(name),
        resolvedVersion: exactVersion("1.0.0"),
        integrity: "",
        sourceName: "default",
        publisherBindingId: "hbnd_test",
        installedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
        updatedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
      },
    ]),
  ),
});

const lockfileWithSkills = (...names: string[]): Lockfile => ({
  lockfileVersion: 3,
  skills: Object.fromEntries(
    names.map((name) => [
      name,
      {
        type: "local" as const,
        path: decodeRelativePathSync(`tmp/skills/${name}`),
        agents: [],
        installedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
        updatedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
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
  getMaterializationAgents: () => Effect.succeed([]),
  getUnknownConfiguredAgentIds: () => Effect.succeed([]),
};
const testLayer = Layer.mergeAll(
  RendererTestLayer,
  Layer.succeed(WorkspaceMutations, makeBaseWorkspaceMock("/tmp/axm")),
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
        versionRange: Option.none(),
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
        versionRange: Option.none(),
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
        versionRange: Option.none(),
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
        versionRange: Option.none(),
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
        name: "Install packs",
        description: Option.some("Install packs from registry"),
        versionRange: Option.none(),
      });

      expect(plan.name).toBe("Install packs");
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
        versionRange: Option.none(),
      });

      expect(plan.jobs).toHaveLength(1);
      expect(getJob(plan).concurrency).toBe(1);
    }),
  );

  it.effect("treats lockfile without packs field as empty", () =>
    Effect.gen(function* () {
      const lockfileNoPacks: Lockfile = {
        lockfileVersion: 3,
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
        versionRange: Option.none(),
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
        versionRange: Option.none(),
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
        versionRange: Option.none(),
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
        versionRange: Option.none(),
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
        versionRange: Option.none(),
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
        versionRange: Option.none(),
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
            path: decodeRelativePathSync("tmp/skills/skill-a"),
            installedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
            updatedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
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
        versionRange: Option.none(),
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
        versionRange: Option.none(),
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
        versionRange: Option.none(),
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
        versionRange: Option.none(),
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
        versionRange: Option.none(),
      });

      const steps = getSteps(plan);
      expect(steps).toHaveLength(2);
      expect(getStep(steps, 0).label).toBe("my-pack");
      expect(getStep(steps, 1).label).toBe("my-server");
      expect(getStep(steps, 1).readiness).toBe("ready");
    }),
  );

  it.effect("marks already-installed mcps as ready no-op", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
        ref: makePackRef("my-pack"),
        skillOps: [],
        commandOps: [],
        mcpServerOps: [makeMcpServerOp("my-server")],
        lockfile: lockfileWithMcpServers("my-server"),
        name: "Install pack",
        description: Option.none(),
        versionRange: Option.none(),
      });

      const steps = getSteps(plan);
      expect(yield* isNoOp(getStep(steps, 1))).toBe(true);
    }),
  );

  // ---------------------------------------------------------------------------
  // Mixed: all extension types
  // ---------------------------------------------------------------------------

  it.effect("orders steps: pack, skills, commands, mcps", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
        ref: makePackRef("my-pack"),
        skillOps: [makeSkillOp("my-skill")],
        commandOps: [makeCommandOp("my-cmd")],
        mcpServerOps: [makeMcpServerOp("my-server")],
        lockfile: emptyLockfile,
        name: "Install pack",
        description: Option.none(),
        versionRange: Option.none(),
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
            path: decodeRelativePathSync("tmp/skills/skill-a"),
            installedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
            updatedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
          },
        },
        commands: {
          "cmd-a": {
            type: "registry" as const,
            owner: ACME,
            name: extensionName("cmd-a"),
            resolvedVersion: exactVersion("1.0.0"),
            integrity: "",
            sourceName: "default",
            publisherBindingId: "hbnd_test",
            installedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
            updatedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
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
        versionRange: Option.none(),
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
