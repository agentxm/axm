/**
 * Unit tests for pack uninstall buildUninstallPlan.
 *
 * Tests the uninstall-specific plan builder including skill removal steps.
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
import { normalizeHandle } from "@axm.sh/core/unstable/extensions";
import type {
  Lockfile,
  ExtensionPackLockEntry,
  ResolvedExtensionMap,
} from "@axm.sh/core/unstable/lockfile";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import {
  exactVersion,
  extensionName,
  makeBaseWorkspaceMock,
  resolvedExtensionMap,
} from "../../../test-stubs.js";
import { TestRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { buildUninstallPlan, type BuildUninstallPlanArgs } from "./plan.js";
import type { Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";

const ACME = normalizeHandle("@acme");

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makePackLockEntry = (
  name: string,
  overrides?: {
    resolvedSkills?: ResolvedExtensionMap;
    resolvedCommands?: ResolvedExtensionMap;
    resolvedMcpServers?: ResolvedExtensionMap;
    resolvedSubagents?: ResolvedExtensionMap;
  },
): ExtensionPackLockEntry => ({
  type: "registry",
  owner: ACME,
  name: extensionName(name),
  resolvedVersion: exactVersion("1.0.0"),
  integrity: "sha512-AAAA==",
  sourceName: "local",
  installedAt: new Date(),
  updatedAt: new Date(),
  resolvedSkills: overrides?.resolvedSkills ?? {},
  resolvedCommands: overrides?.resolvedCommands ?? {},
  resolvedMcpServers: overrides?.resolvedMcpServers ?? {},
  resolvedSubagents: overrides?.resolvedSubagents ?? {},
});

const resolved = resolvedExtensionMap;

const emptyLockfile: Lockfile = {
  lockfileVersion: 1,
  skills: {},
};

const lockfileWithPacks = (...entries: [string, ExtensionPackLockEntry][]): Lockfile => ({
  lockfileVersion: 1,
  skills: {},
  packs: Object.fromEntries(entries),
});

const makePlanArgs = (
  overrides: Partial<BuildUninstallPlanArgs> & Pick<BuildUninstallPlanArgs, "ops" | "lockfile">,
): BuildUninstallPlanArgs => ({
  configuredSkills: [],
  name: "Uninstall pack",
  description: Option.none(),
  configuredCommands: [],
  configuredMcpServers: [],
  ...overrides,
});

const makeOp = (name: string) => ({
  name: "uninstall-pack" as const,
  args: { packName: name },
});

const { layer: RendererTestLayer } = TestRenderer.make();
const defaultAgentRepo: CodingAgentRepositoryService = {
  get: () => Effect.die(new Error("not implemented")),
  all: Effect.succeed([]),
  getConfiguredAgents: () => Effect.succeed([]),
  getUnknownConfiguredAgentIds: () => Effect.succeed([]),
};
const testLayer = Layer.mergeAll(
  RendererTestLayer,
  Layer.succeed(Workspace, makeBaseWorkspaceMock("/tmp/axm")),
  NodeServices.layer,
  Layer.succeed(CodingAgentRepository, defaultAgentRepo),
);

const runBuildPlan = (args: BuildUninstallPlanArgs) =>
  buildUninstallPlan(args).pipe(Effect.provide(testLayer));

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

const findStep = (
  steps: ReadonlyArray<PlannedJobStep>,
  predicate: (step: PlannedJobStep) => boolean,
  label: string,
): PlannedJobStep => {
  const step = steps.find(predicate);
  if (step === undefined) {
    throw new Error(`Missing ${label}`);
  }
  return step;
};

const isNoOp = (step: PlannedJobStep, keyword: string) =>
  step.readiness === "error"
    ? Effect.succeed(false)
    : step.run.pipe(
        Effect.exit,
        Effect.map(
          (exit) =>
            Exit.isSuccess(exit) &&
            exit.value.result === "success" &&
            exit.value.message.includes(keyword),
        ),
      );

// -----------------------------------------------------------------------------
// buildUninstallPlan Tests
// -----------------------------------------------------------------------------

describe("buildUninstallPlan", () => {
  it.effect("marks installed packs as ready", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks(["my-pack", makePackLockEntry("my-pack")]);
      const plan = yield* runBuildPlan(makePlanArgs({ ops: [makeOp("my-pack")], lockfile }));

      expect(plan.jobs).toHaveLength(1);
      expect(getSteps(plan)).toHaveLength(1);
      expect(getStep(getSteps(plan), 0).readiness).toBe("ready");
    }),
  );

  it.effect("marks packs not in lockfile as ready with not-installed no-op", () =>
    Effect.gen(function* () {
      const plan = yield* runBuildPlan(
        makePlanArgs({ ops: [makeOp("my-pack")], lockfile: emptyLockfile }),
      );

      const step = getStep(getSteps(plan), 0);
      expect(step.readiness).toBe("ready");
      expect(yield* isNoOp(step, "not installed")).toBe(true);
    }),
  );

  it.effect("produces empty plan from empty operations", () =>
    Effect.gen(function* () {
      const plan = yield* runBuildPlan(makePlanArgs({ ops: [], lockfile: emptyLockfile }));

      expect(plan.jobs).toHaveLength(1);
      expect(getSteps(plan)).toHaveLength(0);
    }),
  );

  it.effect("derives label from pack name", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks(
        ["pack-a", makePackLockEntry("pack-a")],
        ["pack-b", makePackLockEntry("pack-b")],
      );
      const plan = yield* runBuildPlan(
        makePlanArgs({ ops: [makeOp("pack-a"), makeOp("pack-b")], lockfile }),
      );

      const steps = getSteps(plan);
      expect(getStep(steps, 0).label).toBe("pack-a");
      expect(getStep(steps, 1).label).toBe("pack-b");
    }),
  );

  it.effect("passes through caller-provided name and description", () =>
    Effect.gen(function* () {
      const plan = yield* runBuildPlan(
        makePlanArgs({
          ops: [makeOp("my-pack")],
          lockfile: emptyLockfile,
          name: "Uninstall pack(s)",
          description: Option.some("Uninstall packs from workspace"),
        }),
      );

      expect(plan.name).toBe("Uninstall pack(s)");
      expect(plan.description).toEqual(Option.some("Uninstall packs from workspace"));
    }),
  );

  it.effect("creates a single job with serial concurrency", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks(
        ["a", makePackLockEntry("a")],
        ["b", makePackLockEntry("b")],
      );
      const plan = yield* runBuildPlan(makePlanArgs({ ops: [makeOp("a"), makeOp("b")], lockfile }));

      expect(plan.jobs).toHaveLength(1);
      expect(getJob(plan).concurrency).toBe(1);
    }),
  );

  it.effect("handles mixed ready and not-installed steps", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks(
        ["pack-a", makePackLockEntry("pack-a")],
        ["pack-c", makePackLockEntry("pack-c")],
      );
      const plan = yield* runBuildPlan(
        makePlanArgs({
          ops: [makeOp("pack-a"), makeOp("pack-b"), makeOp("pack-c")],
          lockfile,
        }),
      );

      const steps = getSteps(plan);
      expect(getStep(steps, 0).readiness).toBe("ready");
      expect(getStep(steps, 0).label).toBe("pack-a");
      // pack-b not installed, becomes ready no-op
      expect(getStep(steps, 1).readiness).toBe("ready");
      expect(getStep(steps, 1).label).toBe("pack-b");
      expect(yield* isNoOp(getStep(steps, 1), "not installed")).toBe(true);
      expect(getStep(steps, 2).readiness).toBe("ready");
      expect(getStep(steps, 2).label).toBe("pack-c");
    }),
  );

  // ---------------------------------------------------------------------------
  // Skill removal steps
  // ---------------------------------------------------------------------------

  it.effect("emits skill removal steps for removable skills", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks([
        "my-pack",
        makePackLockEntry("my-pack", {
          resolvedSkills: resolved({
            "@acme/skills/skill-a": "1.0.0",
            "@acme/skills/skill-b": "1.0.0",
          }),
        }),
      ]);
      const plan = yield* runBuildPlan(makePlanArgs({ ops: [makeOp("my-pack")], lockfile }));

      const steps = getSteps(plan);
      // 1 pack step + 2 skill steps
      expect(steps).toHaveLength(3);

      const skillSteps = steps.filter((s) => s.label.startsWith("@acme/skills/"));
      expect(skillSteps).toHaveLength(2);
      expect(skillSteps.map((s) => s.label).sort()).toEqual([
        "@acme/skills/skill-a",
        "@acme/skills/skill-b",
      ]);
    }),
  );

  it.effect("creates skill removal steps as ready with run closure", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks([
        "my-pack",
        makePackLockEntry("my-pack", {
          resolvedSkills: resolved({ "@acme/skills/skill-a": "1.0.0" }),
        }),
      ]);
      const plan = yield* runBuildPlan(makePlanArgs({ ops: [makeOp("my-pack")], lockfile }));

      const skillStep = findStep(
        getSteps(plan),
        (step) => step.label.startsWith("@acme/skills/"),
        "skill removal step",
      );
      expect(skillStep.readiness).toBe("ready");
      expect(skillStep.label).toBe("@acme/skills/skill-a");
    }),
  );

  it.effect("places pack steps before skill steps", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks([
        "my-pack",
        makePackLockEntry("my-pack", {
          resolvedSkills: resolved({ "@acme/skills/skill-a": "1.0.0" }),
        }),
      ]);
      const plan = yield* runBuildPlan(makePlanArgs({ ops: [makeOp("my-pack")], lockfile }));

      const steps = getSteps(plan);
      expect(getStep(steps, 0).label).toBe("my-pack");
      expect(getStep(steps, 1).label).toBe("@acme/skills/skill-a");
    }),
  );

  it.effect("excludes skills shared with a remaining pack", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks(
        [
          "removing-pack",
          makePackLockEntry("removing-pack", {
            resolvedSkills: resolved({
              "@acme/skills/shared": "1.0.0",
              "@acme/skills/orphaned": "1.0.0",
            }),
          }),
        ],
        [
          "staying-pack",
          makePackLockEntry("staying-pack", {
            resolvedSkills: resolved({ "@acme/skills/shared": "1.0.0" }),
          }),
        ],
      );
      const plan = yield* runBuildPlan(makePlanArgs({ ops: [makeOp("removing-pack")], lockfile }));

      const skillSteps = getSteps(plan).filter((s) => s.label.startsWith("@acme/skills/"));
      expect(skillSteps).toHaveLength(1);
      expect(getStep(skillSteps, 0).label).toBe("@acme/skills/orphaned");
    }),
  );

  it.effect("marks directly-installed skills as preserved no-op steps", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks([
        "my-pack",
        makePackLockEntry("my-pack", {
          resolvedSkills: resolved({
            "@acme/skills/code-review": "1.0.0",
            "@acme/skills/orphaned": "1.0.0",
          }),
        }),
      ]);
      const plan = yield* runBuildPlan(
        makePlanArgs({ ops: [makeOp("my-pack")], lockfile, configuredSkills: ["code-review"] }),
      );

      // Orphaned step is ready with run closure (not no-op)
      const steps = getSteps(plan);
      const orphanedStep = findStep(
        steps,
        (step) => step.label === "@acme/skills/orphaned",
        "orphaned skill step",
      );
      expect(orphanedStep.readiness).toBe("ready");

      // Preserved step is ready no-op
      const preservedStep = findStep(
        steps,
        (step) => step.label === "@acme/skills/code-review",
        "preserved skill step",
      );
      expect(preservedStep.readiness).toBe("ready");
      expect(yield* isNoOp(preservedStep, "preserved")).toBe(true);
    }),
  );

  it.effect("handles glob batch: skill shared between TWO removed packs is removable", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks(
        [
          "pack-a",
          makePackLockEntry("pack-a", {
            resolvedSkills: resolved({ "@acme/skills/shared-skill": "1.0.0" }),
          }),
        ],
        [
          "pack-b",
          makePackLockEntry("pack-b", {
            resolvedSkills: resolved({ "@acme/skills/shared-skill": "1.0.0" }),
          }),
        ],
      );
      const plan = yield* runBuildPlan(
        makePlanArgs({
          ops: [makeOp("pack-a"), makeOp("pack-b")],
          lockfile,
          name: "Uninstall packs",
        }),
      );

      const skillSteps = getSteps(plan).filter((s) => s.label.startsWith("@acme/skills/"));
      expect(skillSteps).toHaveLength(1);
      expect(getStep(skillSteps, 0).label).toBe("@acme/skills/shared-skill");
    }),
  );

  it.effect("handles glob batch: remaining packs computed correctly", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks(
        [
          "pack-a",
          makePackLockEntry("pack-a", {
            resolvedSkills: resolved({ "@acme/skills/skill-a": "1.0.0" }),
          }),
        ],
        [
          "pack-b",
          makePackLockEntry("pack-b", {
            resolvedSkills: resolved({ "@acme/skills/skill-a": "1.0.0" }),
          }),
        ],
        [
          "pack-c",
          makePackLockEntry("pack-c", {
            resolvedSkills: resolved({ "@acme/skills/skill-a": "1.0.0" }),
          }),
        ],
      );
      // Remove pack-a and pack-b, pack-c remains and references skill-a
      const plan = yield* runBuildPlan(
        makePlanArgs({
          ops: [makeOp("pack-a"), makeOp("pack-b")],
          lockfile,
          name: "Uninstall packs",
        }),
      );

      const skillSteps = getSteps(plan).filter((s) => s.label.startsWith("@acme/skills/"));
      // skill-a is still referenced by pack-c, so no skill removal
      expect(skillSteps).toHaveLength(0);
    }),
  );

  it.effect("does not emit skill steps for packs not in lockfile", () =>
    Effect.gen(function* () {
      const plan = yield* runBuildPlan(
        makePlanArgs({ ops: [makeOp("nonexistent-pack")], lockfile: emptyLockfile }),
      );

      const skillSteps = getSteps(plan).filter((s) => s.label.startsWith("@acme/skills/"));
      expect(skillSteps).toHaveLength(0);
    }),
  );

  it.effect("deduplicates skills across multiple packs being removed", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks(
        [
          "pack-a",
          makePackLockEntry("pack-a", {
            resolvedSkills: resolved({
              "@acme/skills/shared": "1.0.0",
              "@acme/skills/only-a": "1.0.0",
            }),
          }),
        ],
        [
          "pack-b",
          makePackLockEntry("pack-b", {
            resolvedSkills: resolved({
              "@acme/skills/shared": "1.0.0",
              "@acme/skills/only-b": "1.0.0",
            }),
          }),
        ],
      );
      const plan = yield* runBuildPlan(
        makePlanArgs({
          ops: [makeOp("pack-a"), makeOp("pack-b")],
          lockfile,
          name: "Uninstall packs",
        }),
      );

      const skillSteps = getSteps(plan).filter((s) => s.label.startsWith("@acme/skills/"));
      // 3 unique skills: shared, only-a, only-b
      expect(skillSteps).toHaveLength(3);
      const labels = skillSteps.map((s) => s.label).sort();
      expect(labels).toEqual(["@acme/skills/only-a", "@acme/skills/only-b", "@acme/skills/shared"]);
    }),
  );

  // ---------------------------------------------------------------------------
  // Command removal steps
  // ---------------------------------------------------------------------------

  it.effect("emits command removal steps for orphaned commands", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks([
        "my-pack",
        makePackLockEntry("my-pack", {
          resolvedCommands: resolved({
            "@acme/commands/cmd-a": "1.0.0",
            "@acme/commands/cmd-b": "1.0.0",
          }),
        }),
      ]);
      const plan = yield* runBuildPlan(makePlanArgs({ ops: [makeOp("my-pack")], lockfile }));

      const commandSteps = getSteps(plan).filter((s) => s.label.startsWith("@acme/commands/"));
      expect(commandSteps).toHaveLength(2);
      expect(commandSteps.map((s) => s.label).sort()).toEqual([
        "@acme/commands/cmd-a",
        "@acme/commands/cmd-b",
      ]);
    }),
  );

  it.effect("creates command removal steps as ready with run closure", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks([
        "my-pack",
        makePackLockEntry("my-pack", {
          resolvedCommands: resolved({ "@acme/commands/cmd-a": "1.0.0" }),
        }),
      ]);
      const plan = yield* runBuildPlan(makePlanArgs({ ops: [makeOp("my-pack")], lockfile }));

      const cmdStep = findStep(
        getSteps(plan),
        (step) => step.label.startsWith("@acme/commands/"),
        "command removal step",
      );
      expect(cmdStep.readiness).toBe("ready");
      expect(cmdStep.label).toBe("@acme/commands/cmd-a");
    }),
  );

  it.effect("excludes commands shared with a remaining pack", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks(
        [
          "removing-pack",
          makePackLockEntry("removing-pack", {
            resolvedCommands: resolved({
              "@acme/commands/shared": "1.0.0",
              "@acme/commands/orphaned": "1.0.0",
            }),
          }),
        ],
        [
          "staying-pack",
          makePackLockEntry("staying-pack", {
            resolvedCommands: resolved({ "@acme/commands/shared": "1.0.0" }),
          }),
        ],
      );
      const plan = yield* runBuildPlan(makePlanArgs({ ops: [makeOp("removing-pack")], lockfile }));

      const commandSteps = getSteps(plan).filter((s) => s.label.startsWith("@acme/commands/"));
      expect(commandSteps).toHaveLength(1);
      expect(getStep(commandSteps, 0).label).toBe("@acme/commands/orphaned");
    }),
  );

  it.effect("marks directly-configured commands as preserved no-op steps", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks([
        "my-pack",
        makePackLockEntry("my-pack", {
          resolvedCommands: resolved({
            "@acme/commands/direct-cmd": "1.0.0",
            "@acme/commands/orphaned": "1.0.0",
          }),
        }),
      ]);
      const plan = yield* runBuildPlan(
        makePlanArgs({ ops: [makeOp("my-pack")], lockfile, configuredCommands: ["direct-cmd"] }),
      );

      const steps = getSteps(plan);
      const orphanedStep = findStep(
        steps,
        (step) => step.label === "@acme/commands/orphaned",
        "orphaned command step",
      );
      const preservedStep = findStep(
        steps,
        (step) => step.label === "@acme/commands/direct-cmd",
        "preserved command step",
      );
      expect(orphanedStep.readiness).toBe("ready");
      expect(preservedStep.readiness).toBe("ready");
      expect(yield* isNoOp(preservedStep, "preserved")).toBe(true);
    }),
  );

  it.effect("glob: command shared between two removed packs produces one step", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks(
        [
          "pack-a",
          makePackLockEntry("pack-a", {
            resolvedCommands: resolved({ "@acme/commands/shared-cmd": "1.0.0" }),
          }),
        ],
        [
          "pack-b",
          makePackLockEntry("pack-b", {
            resolvedCommands: resolved({ "@acme/commands/shared-cmd": "1.0.0" }),
          }),
        ],
      );
      const plan = yield* runBuildPlan(
        makePlanArgs({
          ops: [makeOp("pack-a"), makeOp("pack-b")],
          lockfile,
          name: "Uninstall packs",
        }),
      );

      const commandSteps = getSteps(plan).filter((s) => s.label.startsWith("@acme/commands/"));
      expect(commandSteps).toHaveLength(1);
      expect(getStep(commandSteps, 0).label).toBe("@acme/commands/shared-cmd");
    }),
  );

  // ---------------------------------------------------------------------------
  // MCP server removal steps
  // ---------------------------------------------------------------------------

  it.effect("emits mcp-server removal steps for orphaned MCP servers", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks([
        "my-pack",
        makePackLockEntry("my-pack", {
          resolvedMcpServers: resolved({
            "@acme/mcp-servers/srv-a": "1.0.0",
            "@acme/mcp-servers/srv-b": "1.0.0",
          }),
        }),
      ]);
      const plan = yield* runBuildPlan(makePlanArgs({ ops: [makeOp("my-pack")], lockfile }));

      const mcpSteps = getSteps(plan).filter((s) => s.label.startsWith("@acme/mcp-servers/"));
      expect(mcpSteps).toHaveLength(2);
      expect(mcpSteps.map((s) => s.label).sort()).toEqual([
        "@acme/mcp-servers/srv-a",
        "@acme/mcp-servers/srv-b",
      ]);
    }),
  );

  it.effect("creates mcp-server removal steps as ready with run closure", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks([
        "my-pack",
        makePackLockEntry("my-pack", {
          resolvedMcpServers: resolved({ "@acme/mcp-servers/srv-a": "1.0.0" }),
        }),
      ]);
      const plan = yield* runBuildPlan(makePlanArgs({ ops: [makeOp("my-pack")], lockfile }));

      const mcpStep = findStep(
        getSteps(plan),
        (step) => step.label.startsWith("@acme/mcp-servers/"),
        "mcp-server removal step",
      );
      expect(mcpStep.readiness).toBe("ready");
      expect(mcpStep.label).toBe("@acme/mcp-servers/srv-a");
    }),
  );

  it.effect("excludes MCP servers shared with a remaining pack", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks(
        [
          "removing-pack",
          makePackLockEntry("removing-pack", {
            resolvedMcpServers: resolved({
              "@acme/mcp-servers/shared": "1.0.0",
              "@acme/mcp-servers/orphaned": "1.0.0",
            }),
          }),
        ],
        [
          "staying-pack",
          makePackLockEntry("staying-pack", {
            resolvedMcpServers: resolved({ "@acme/mcp-servers/shared": "1.0.0" }),
          }),
        ],
      );
      const plan = yield* runBuildPlan(makePlanArgs({ ops: [makeOp("removing-pack")], lockfile }));

      const mcpSteps = getSteps(plan).filter((s) => s.label.startsWith("@acme/mcp-servers/"));
      expect(mcpSteps).toHaveLength(1);
      expect(getStep(mcpSteps, 0).label).toBe("@acme/mcp-servers/orphaned");
    }),
  );

  it.effect("marks directly-configured MCP servers as preserved no-op steps", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks([
        "my-pack",
        makePackLockEntry("my-pack", {
          resolvedMcpServers: resolved({
            "@acme/mcp-servers/direct-srv": "1.0.0",
            "@acme/mcp-servers/orphaned": "1.0.0",
          }),
        }),
      ]);
      const plan = yield* runBuildPlan(
        makePlanArgs({
          ops: [makeOp("my-pack")],
          lockfile,
          configuredMcpServers: ["direct-srv"],
        }),
      );

      const steps = getSteps(plan);
      const orphanedStep = findStep(
        steps,
        (step) => step.label === "@acme/mcp-servers/orphaned",
        "orphaned mcp-server step",
      );
      const preservedStep = findStep(
        steps,
        (step) => step.label === "@acme/mcp-servers/direct-srv",
        "preserved mcp-server step",
      );
      expect(orphanedStep.readiness).toBe("ready");
      expect(preservedStep.readiness).toBe("ready");
      expect(yield* isNoOp(preservedStep, "preserved")).toBe(true);
    }),
  );

  it.effect("glob: MCP server shared between two removed packs produces one step", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks(
        [
          "pack-a",
          makePackLockEntry("pack-a", {
            resolvedMcpServers: resolved({ "@acme/mcp-servers/shared-srv": "1.0.0" }),
          }),
        ],
        [
          "pack-b",
          makePackLockEntry("pack-b", {
            resolvedMcpServers: resolved({ "@acme/mcp-servers/shared-srv": "1.0.0" }),
          }),
        ],
      );
      const plan = yield* runBuildPlan(
        makePlanArgs({
          ops: [makeOp("pack-a"), makeOp("pack-b")],
          lockfile,
          name: "Uninstall packs",
        }),
      );

      const mcpSteps = getSteps(plan).filter((s) => s.label.startsWith("@acme/mcp-servers/"));
      expect(mcpSteps).toHaveLength(1);
      expect(getStep(mcpSteps, 0).label).toBe("@acme/mcp-servers/shared-srv");
    }),
  );

  // ---------------------------------------------------------------------------
  // Mixed extension types
  // ---------------------------------------------------------------------------

  it.effect("places pack steps before skill/command/mcp-server steps", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks([
        "my-pack",
        makePackLockEntry("my-pack", {
          resolvedSkills: resolved({ "@acme/skills/skill-a": "1.0.0" }),
          resolvedCommands: resolved({ "@acme/commands/cmd-a": "1.0.0" }),
          resolvedMcpServers: resolved({ "@acme/mcp-servers/srv-a": "1.0.0" }),
        }),
      ]);
      const plan = yield* runBuildPlan(makePlanArgs({ ops: [makeOp("my-pack")], lockfile }));

      const steps = getSteps(plan);
      expect(steps).toHaveLength(4);
      // Pack step is first
      expect(getStep(steps, 0).label).toBe("my-pack");
      // Extension steps follow
      const extensionLabels = steps.slice(1).map((s) => s.label);
      expect(extensionLabels).toContain("@acme/skills/skill-a");
      expect(extensionLabels).toContain("@acme/commands/cmd-a");
      expect(extensionLabels).toContain("@acme/mcp-servers/srv-a");
    }),
  );

  it.effect("returns plan with steps covering all four extension types", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks([
        "my-pack",
        makePackLockEntry("my-pack", {
          resolvedSkills: resolved({ "@acme/skills/skill-a": "1.0.0" }),
          resolvedCommands: resolved({ "@acme/commands/cmd-a": "1.0.0" }),
          resolvedMcpServers: resolved({ "@acme/mcp-servers/srv-a": "1.0.0" }),
        }),
      ]);
      const plan = yield* runBuildPlan(makePlanArgs({ ops: [makeOp("my-pack")], lockfile }));

      const labels = getSteps(plan).map((s) => s.label);
      expect(labels).toContain("my-pack");
      expect(labels.some((l) => l.startsWith("@acme/skills/"))).toBe(true);
      expect(labels.some((l) => l.startsWith("@acme/commands/"))).toBe(true);
      expect(labels.some((l) => l.startsWith("@acme/mcp-servers/"))).toBe(true);
    }),
  );

  it.effect("glob removing multiple packs that share extensions across all types", () =>
    Effect.gen(function* () {
      const lockfile = lockfileWithPacks(
        [
          "pack-a",
          makePackLockEntry("pack-a", {
            resolvedSkills: resolved({ "@acme/skills/shared": "1.0.0" }),
            resolvedCommands: resolved({
              "@acme/commands/shared": "1.0.0",
              "@acme/commands/only-a": "1.0.0",
            }),
            resolvedMcpServers: resolved({ "@acme/mcp-servers/shared": "1.0.0" }),
          }),
        ],
        [
          "pack-b",
          makePackLockEntry("pack-b", {
            resolvedSkills: resolved({
              "@acme/skills/shared": "1.0.0",
              "@acme/skills/only-b": "1.0.0",
            }),
            resolvedCommands: resolved({ "@acme/commands/shared": "1.0.0" }),
            resolvedMcpServers: resolved({
              "@acme/mcp-servers/shared": "1.0.0",
              "@acme/mcp-servers/only-b": "1.0.0",
            }),
          }),
        ],
      );
      const plan = yield* runBuildPlan(
        makePlanArgs({
          ops: [makeOp("pack-a"), makeOp("pack-b")],
          lockfile,
          name: "Uninstall packs",
        }),
      );

      const steps = getSteps(plan);
      const skillSteps = steps.filter((s) => s.label.startsWith("@acme/skills/"));
      const commandSteps = steps.filter((s) => s.label.startsWith("@acme/commands/"));
      const mcpSteps = steps.filter((s) => s.label.startsWith("@acme/mcp-servers/"));

      // All shared extensions are removable since both packs are being removed
      expect(skillSteps).toHaveLength(2); // shared + only-b
      expect(commandSteps).toHaveLength(2); // shared + only-a
      expect(mcpSteps).toHaveLength(2); // shared + only-b
    }),
  );
});
