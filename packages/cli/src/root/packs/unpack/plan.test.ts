/**
 * Unit tests for pack unpack buildUnpackPlan.
 *
 * Tests the pack-specific unpack plan builder that diffs operations against
 * configured extension state.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { normalizeHandle } from "@agentxm/client-core/unstable/extensions";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "@agentxm/client-core/unstable/agents";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import type { SourceHostProvidersService } from "@agentxm/client-core/unstable/source-resolution";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { exactVersion, extensionName, makeBaseWorkspaceMock } from "../../../test-stubs.js";
import type { InstallSkillOperation } from "@agentxm/client-core/unstable/skills";
import type { InstallCommandOperation } from "@agentxm/client-core/unstable/commands";
import type { InstallMcpServerOperation } from "@agentxm/client-core/unstable/mcps";
import type { UninstallPackOperation } from "@agentxm/client-core/unstable/packs";
import { buildUnpackPlan } from "./plan.js";

const ACME = normalizeHandle("@acme");

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeSkillOp = (name: string): InstallSkillOperation => ({
  name: "install-skill",
  args: {
    ref: {
      type: "skill",
      refType: "registry",
      skill: { name: extensionName(name), description: Option.none(), metadata: Option.none() },
      source: {
        type: "registry",
        location: new URL("file:///tmp/registry"),
        owner: Option.none(),
      },
      owner: ACME,
      name: extensionName(name),
      version: exactVersion("1.0.0"),
      integrity: Option.none(),
      packages: [],
    },
    force: false,
    versionRange: Option.none(),
    skipSettings: Option.none(),
    sourceName: Option.none(),
    strictUnknownAgents: Option.none(),
    existingInstalledAt: Option.none(),
  },
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
      packages: [],
    },
    force: false,
    versionRange: Option.none(),
    skipSettings: Option.none(),
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
      packages: [],
    },
    force: false,
    versionRange: Option.none(),
    skipSettings: Option.none(),
  },
});

const makeUninstallPackOp = (name: string): UninstallPackOperation => ({
  name: "uninstall-pack",
  args: { packName: name },
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

const runBuild = (args: Parameters<typeof buildUnpackPlan>[0]) =>
  buildUnpackPlan(args).pipe(Effect.provide(testLayer));

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

/** Check if a ready step's run returns a no-op message. */
const isNoOp = (step: PlannedJobStep) =>
  step.readiness !== "ready"
    ? Effect.succeed(false)
    : step.run.pipe(
        Effect.exit,
        Effect.map(
          (exit) =>
            Exit.isSuccess(exit) &&
            exit.value.result === "success" &&
            exit.value.message.includes("already directly installed"),
        ),
      );

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildUnpackPlan", () => {
  it.effect("emits install-skill steps for each skill op", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
        skillOps: [makeSkillOp("skill-a"), makeSkillOp("skill-b")],
        commandOps: [],
        mcpServerOps: [],
        uninstallPackOp: makeUninstallPackOp("my-pack"),
        configuredSkillNames: [],
        configuredCommandNames: [],
        configuredMcpServerNames: [],
        name: "Unpack pack",
        description: Option.none(),
      });

      const steps = getSteps(plan);
      expect(getStep(steps, 0).label).toBe("skill-a");
      expect(getStep(steps, 0).readiness).toBe("ready");
      expect(getStep(steps, 1).label).toBe("skill-b");
      expect(getStep(steps, 1).readiness).toBe("ready");
    }),
  );

  it.effect("emits install-command steps for each command op", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
        skillOps: [],
        commandOps: [makeCommandOp("cmd-a")],
        mcpServerOps: [],
        uninstallPackOp: makeUninstallPackOp("my-pack"),
        configuredSkillNames: [],
        configuredCommandNames: [],
        configuredMcpServerNames: [],
        name: "Unpack pack",
        description: Option.none(),
      });

      const steps = getSteps(plan);
      expect(getStep(steps, 0).label).toBe("cmd-a");
      expect(getStep(steps, 0).readiness).toBe("ready");
    }),
  );

  it.effect("emits install-mcp-server steps for each mcp-server op", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
        skillOps: [],
        commandOps: [],
        mcpServerOps: [makeMcpServerOp("server-a")],
        uninstallPackOp: makeUninstallPackOp("my-pack"),
        configuredSkillNames: [],
        configuredCommandNames: [],
        configuredMcpServerNames: [],
        name: "Unpack pack",
        description: Option.none(),
      });

      const steps = getSteps(plan);
      expect(getStep(steps, 0).label).toBe("server-a");
      expect(getStep(steps, 0).readiness).toBe("ready");
    }),
  );

  it.effect("marks already directly installed skills as no-op", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
        skillOps: [makeSkillOp("skill-a"), makeSkillOp("skill-b")],
        commandOps: [],
        mcpServerOps: [],
        uninstallPackOp: makeUninstallPackOp("my-pack"),
        configuredSkillNames: ["skill-a"],
        configuredCommandNames: [],
        configuredMcpServerNames: [],
        name: "Unpack pack",
        description: Option.none(),
      });

      const steps = getSteps(plan);
      expect(yield* isNoOp(getStep(steps, 0))).toBe(true);
      expect(yield* isNoOp(getStep(steps, 1))).toBe(false);
    }),
  );

  it.effect("marks already directly installed commands as no-op", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
        skillOps: [],
        commandOps: [makeCommandOp("cmd-a"), makeCommandOp("cmd-b")],
        mcpServerOps: [],
        uninstallPackOp: makeUninstallPackOp("my-pack"),
        configuredSkillNames: [],
        configuredCommandNames: ["cmd-a"],
        configuredMcpServerNames: [],
        name: "Unpack pack",
        description: Option.none(),
      });

      const steps = getSteps(plan);
      expect(yield* isNoOp(getStep(steps, 0))).toBe(true);
      expect(yield* isNoOp(getStep(steps, 1))).toBe(false);
    }),
  );

  it.effect("marks already directly installed mcps as no-op", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
        skillOps: [],
        commandOps: [],
        mcpServerOps: [makeMcpServerOp("server-a"), makeMcpServerOp("server-b")],
        uninstallPackOp: makeUninstallPackOp("my-pack"),
        configuredSkillNames: [],
        configuredCommandNames: [],
        configuredMcpServerNames: ["server-a"],
        name: "Unpack pack",
        description: Option.none(),
      });

      const steps = getSteps(plan);
      expect(yield* isNoOp(getStep(steps, 0))).toBe(true);
      expect(yield* isNoOp(getStep(steps, 1))).toBe(false);
    }),
  );

  it.effect("orders steps: install ops first, uninstall-pack last", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
        skillOps: [makeSkillOp("my-skill")],
        commandOps: [makeCommandOp("my-cmd")],
        mcpServerOps: [makeMcpServerOp("my-server")],
        uninstallPackOp: makeUninstallPackOp("my-pack"),
        configuredSkillNames: [],
        configuredCommandNames: [],
        configuredMcpServerNames: [],
        name: "Unpack pack",
        description: Option.none(),
      });

      const steps = getSteps(plan);
      expect(steps).toHaveLength(4);
      expect(getStep(steps, 0).label).toBe("my-skill");
      expect(getStep(steps, 1).label).toBe("my-cmd");
      expect(getStep(steps, 2).label).toBe("my-server");
      expect(getStep(steps, 3).label).toBe("my-pack");
    }),
  );

  it.effect("uninstall-pack step uses pack name as label", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
        skillOps: [],
        commandOps: [],
        mcpServerOps: [],
        uninstallPackOp: makeUninstallPackOp("my-pack"),
        configuredSkillNames: [],
        configuredCommandNames: [],
        configuredMcpServerNames: [],
        name: "Unpack pack",
        description: Option.none(),
      });

      const steps = getSteps(plan);
      expect(steps).toHaveLength(1);
      expect(getStep(steps, 0).label).toBe("my-pack");
      expect(getStep(steps, 0).readiness).toBe("ready");
    }),
  );

  it.effect("passes through caller-provided name and description", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
        skillOps: [],
        commandOps: [],
        mcpServerOps: [],
        uninstallPackOp: makeUninstallPackOp("my-pack"),
        configuredSkillNames: [],
        configuredCommandNames: [],
        configuredMcpServerNames: [],
        name: "Unpack packs",
        description: Option.some("Unpack pack into direct entries"),
      });

      expect(plan.name).toBe("Unpack packs");
      expect(plan.description).toEqual(Option.some("Unpack pack into direct entries"));
    }),
  );

  it.effect("creates a single job with serial concurrency", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
        skillOps: [],
        commandOps: [],
        mcpServerOps: [],
        uninstallPackOp: makeUninstallPackOp("my-pack"),
        configuredSkillNames: [],
        configuredCommandNames: [],
        configuredMcpServerNames: [],
        name: "Unpack pack",
        description: Option.none(),
      });

      expect(plan.jobs).toHaveLength(1);
      expect(getJob(plan).concurrency).toBe(1);
    }),
  );

  it.effect("handles mixed skip/ready across extension types", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
        skillOps: [makeSkillOp("skill-a"), makeSkillOp("skill-b")],
        commandOps: [makeCommandOp("cmd-a"), makeCommandOp("cmd-b")],
        mcpServerOps: [makeMcpServerOp("server-a")],
        uninstallPackOp: makeUninstallPackOp("my-pack"),
        configuredSkillNames: ["skill-a"],
        configuredCommandNames: ["cmd-b"],
        configuredMcpServerNames: [],
        name: "Unpack pack",
        description: Option.none(),
      });

      const steps = getSteps(plan);
      expect(steps).toHaveLength(6);
      expect(yield* isNoOp(getStep(steps, 0))).toBe(true); // skill-a
      expect(yield* isNoOp(getStep(steps, 1))).toBe(false); // skill-b
      expect(yield* isNoOp(getStep(steps, 2))).toBe(false); // cmd-a
      expect(yield* isNoOp(getStep(steps, 3))).toBe(true); // cmd-b
      expect(yield* isNoOp(getStep(steps, 4))).toBe(false); // server-a
      expect(getStep(steps, 5).label).toBe("my-pack"); // last
    }),
  );

  it.effect("install ops use empty integrity (skip fetch path)", () =>
    Effect.gen(function* () {
      const plan = yield* runBuild({
        skillOps: [makeSkillOp("my-skill")],
        commandOps: [makeCommandOp("my-cmd")],
        mcpServerOps: [makeMcpServerOp("my-server")],
        uninstallPackOp: makeUninstallPackOp("my-pack"),
        configuredSkillNames: [],
        configuredCommandNames: [],
        configuredMcpServerNames: [],
        name: "Unpack pack",
        description: Option.none(),
      });

      const steps = getSteps(plan);
      // We can verify the plan built correctly; the operations are captured in closures
      // so we verify step count and readiness
      expect(steps).toHaveLength(4);
      expect(getStep(steps, 0).readiness).toBe("ready");
      expect(getStep(steps, 1).readiness).toBe("ready");
      expect(getStep(steps, 2).readiness).toBe("ready");
      expect(getStep(steps, 3).readiness).toBe("ready");
    }),
  );

  it.effect("install-skill ops have skipSettings as Option.none (not skipped)", () =>
    Effect.gen(function* () {
      // The skipSettings behavior is captured inside the run closure.
      // We verify the plan builder accepts the ops correctly (no error).
      const plan = yield* runBuild({
        skillOps: [makeSkillOp("my-skill")],
        commandOps: [],
        mcpServerOps: [],
        uninstallPackOp: makeUninstallPackOp("my-pack"),
        configuredSkillNames: [],
        configuredCommandNames: [],
        configuredMcpServerNames: [],
        name: "Unpack pack",
        description: Option.none(),
      });

      const steps = getSteps(plan);
      expect(getStep(steps, 0).readiness).toBe("ready");
      expect(getStep(steps, 0).label).toBe("my-skill");
    }),
  );
});
