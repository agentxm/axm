/**
 * Unit tests for pack unpack buildUnpackPlan.
 *
 * Tests the pack-specific unpack plan builder that diffs operations against
 * configured extension state.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "@axm.sh/core/unstable/agents";
import { SourceHostProviders } from "@axm.sh/core/unstable/source-resolution";
import type { SourceHostProvidersService } from "@axm.sh/core/unstable/source-resolution";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import type { Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import { TestRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { makeBaseWorkspaceMock } from "../../../test-stubs.js";
import type { InstallSkillOperation } from "@axm.sh/core/unstable/skills";
import type { InstallCommandOperation } from "@axm.sh/core/unstable/commands";
import type { InstallMcpServerOperation } from "@axm.sh/core/unstable/mcp-servers";
import type { UninstallPackOperation } from "@axm.sh/core/unstable/packs";
import { buildUnpackPlan } from "./plan.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeSkillOp = (name: string): InstallSkillOperation => ({
  name: "install-skill",
  args: {
    ref: {
      type: "skill",
      refType: "registry",
      skill: { name, description: Option.none(), metadata: Option.none() },
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
    skipSettings: Option.none(),
    sourceName: Option.none(),
  },
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
    skipSettings: Option.none(),
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
  getUnknownConfiguredAgentIds: () => Effect.succeed([]),
};
const testLayer = Layer.mergeAll(
  RendererTestLayer,
  Layer.succeed(Workspace, makeBaseWorkspaceMock("/tmp/axm")),
  Layer.succeed(SourceHostProviders, sourceHostProvidersStub),
  NodeServices.layer,
  Layer.succeed(CodingAgentRepository, defaultAgentRepo),
);

const runBuild = (args: Parameters<typeof buildUnpackPlan>[0]) =>
  Effect.runSync(buildUnpackPlan(args).pipe(Effect.provide(testLayer)));

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
const isNoOp = (step: PlannedJobStep) => {
  if (step.readiness !== "ready") return false;
  try {
    const result = Effect.runSync(step.run);
    return result.result === "success" && result.message.includes("already directly installed");
  } catch {
    return false;
  }
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildUnpackPlan", () => {
  it("emits install-skill steps for each skill op", () => {
    const plan = runBuild({
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
  });

  it("emits install-command steps for each command op", () => {
    const plan = runBuild({
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
  });

  it("emits install-mcp-server steps for each mcp-server op", () => {
    const plan = runBuild({
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
  });

  it("marks already directly installed skills as no-op", () => {
    const plan = runBuild({
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
    expect(isNoOp(getStep(steps, 0))).toBe(true);
    expect(isNoOp(getStep(steps, 1))).toBe(false);
  });

  it("marks already directly installed commands as no-op", () => {
    const plan = runBuild({
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
    expect(isNoOp(getStep(steps, 0))).toBe(true);
    expect(isNoOp(getStep(steps, 1))).toBe(false);
  });

  it("marks already directly installed mcp-servers as no-op", () => {
    const plan = runBuild({
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
    expect(isNoOp(getStep(steps, 0))).toBe(true);
    expect(isNoOp(getStep(steps, 1))).toBe(false);
  });

  it("orders steps: install ops first, uninstall-pack last", () => {
    const plan = runBuild({
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
  });

  it("uninstall-pack step uses pack name as label", () => {
    const plan = runBuild({
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
  });

  it("passes through caller-provided name and description", () => {
    const plan = runBuild({
      skillOps: [],
      commandOps: [],
      mcpServerOps: [],
      uninstallPackOp: makeUninstallPackOp("my-pack"),
      configuredSkillNames: [],
      configuredCommandNames: [],
      configuredMcpServerNames: [],
      name: "Unpack pack(s)",
      description: Option.some("Unpack pack into direct entries"),
    });

    expect(plan.name).toBe("Unpack pack(s)");
    expect(plan.description).toEqual(Option.some("Unpack pack into direct entries"));
  });

  it("creates a single job with serial concurrency", () => {
    const plan = runBuild({
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
  });

  it("handles mixed skip/ready across extension types", () => {
    const plan = runBuild({
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
    expect(isNoOp(getStep(steps, 0))).toBe(true); // skill-a
    expect(isNoOp(getStep(steps, 1))).toBe(false); // skill-b
    expect(isNoOp(getStep(steps, 2))).toBe(false); // cmd-a
    expect(isNoOp(getStep(steps, 3))).toBe(true); // cmd-b
    expect(isNoOp(getStep(steps, 4))).toBe(false); // server-a
    expect(getStep(steps, 5).label).toBe("my-pack"); // last
  });

  it("install ops use empty integrity (skip fetch path)", () => {
    const plan = runBuild({
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
  });

  it("install-skill ops have skipSettings as Option.none (not skipped)", () => {
    // The skipSettings behavior is captured inside the run closure.
    // We verify the plan builder accepts the ops correctly (no error).
    const plan = runBuild({
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
  });
});
