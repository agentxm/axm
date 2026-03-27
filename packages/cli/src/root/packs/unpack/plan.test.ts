/**
 * Unit tests for pack unpack buildUnpackPlan.
 *
 * Tests the pack-specific unpack plan builder that diffs operations against
 * configured extension state.
 */

import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import type { InstallSkillOperation } from "@axm.sh/core/unstable/skills";
import type { InstallCommandOperation } from "@axm.sh/core/unstable/commands";
import type { InstallMcpServerOperation } from "@axm.sh/core/unstable/mcp-servers";
import type { UninstallPackOperation } from "@axm.sh/core/unstable/packs";
import type { LegacyPlan, LegacyPlannedStep } from "@axm.sh/core/unstable/workspace";
import { buildUnpackPlan } from "./plan.js";

const isPlannedStep = <T>(step: { readonly _tag: string }): step is LegacyPlannedStep<T> =>
  step._tag === "PlannedJobStep";

const planned = <T>(step: { readonly _tag: string }): LegacyPlannedStep<T> => {
  if (!isPlannedStep<T>(step)) {
    throw new Error("Expected PlannedJobStep");
  }

  return step;
};

type PackUnpackOperation =
  | InstallSkillOperation
  | InstallCommandOperation
  | InstallMcpServerOperation
  | UninstallPackOperation;
type PackUnpackPlan = LegacyPlan<PackUnpackOperation>;
type PackUnpackStep = LegacyPlannedStep<PackUnpackOperation>;

const getItem = <T>(items: ReadonlyArray<T>, index: number, label: string): T => {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Missing ${label} at index ${index}`);
  }
  return item;
};

const getJob = (plan: PackUnpackPlan) => getItem(plan.jobs, 0, "job");

const getSteps = (plan: PackUnpackPlan) => getJob(plan).steps;

const getStep = (steps: ReadonlyArray<PackUnpackStep>, index: number) =>
  getItem(steps, index, "step");

function expectOperation(
  operation: PackUnpackOperation,
  name: "install-skill",
): InstallSkillOperation;
function expectOperation(
  operation: PackUnpackOperation,
  name: "install-command",
): InstallCommandOperation;
function expectOperation(
  operation: PackUnpackOperation,
  name: "install-mcp-server",
): InstallMcpServerOperation;
function expectOperation(
  operation: PackUnpackOperation,
  name: "uninstall-pack",
): UninstallPackOperation;
function expectOperation(
  operation: PackUnpackOperation,
  name: PackUnpackOperation["name"],
): PackUnpackOperation {
  if (operation.name !== name) {
    throw new Error(`Expected operation ${name}, received ${operation.name}`);
  }

  return operation;
}

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

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildUnpackPlan", () => {
  it("emits install-skill steps for each skill op", () => {
    const plan = buildUnpackPlan({
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
    expect(getStep(steps, 0).operation.name).toBe("install-skill");
    expect(getStep(steps, 0).label).toBe("skill-a");
    expect(planned(getStep(steps, 0)).readiness.status).toBe("ready");
    expect(getStep(steps, 1).operation.name).toBe("install-skill");
    expect(getStep(steps, 1).label).toBe("skill-b");
    expect(planned(getStep(steps, 1)).readiness.status).toBe("ready");
  });

  it("emits install-command steps for each command op", () => {
    const plan = buildUnpackPlan({
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
    expect(getStep(steps, 0).operation.name).toBe("install-command");
    expect(getStep(steps, 0).label).toBe("cmd-a");
    expect(planned(getStep(steps, 0)).readiness.status).toBe("ready");
  });

  it("emits install-mcp-server steps for each mcp-server op", () => {
    const plan = buildUnpackPlan({
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
    expect(getStep(steps, 0).operation.name).toBe("install-mcp-server");
    expect(getStep(steps, 0).label).toBe("server-a");
    expect(planned(getStep(steps, 0)).readiness.status).toBe("ready");
  });

  it("marks already directly installed skills as skip", () => {
    const plan = buildUnpackPlan({
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
    expect(planned(getStep(steps, 0)).readiness).toEqual({
      status: "skip",
      message: "already directly installed",
    });
    expect(planned(getStep(steps, 1)).readiness.status).toBe("ready");
  });

  it("marks already directly installed commands as skip", () => {
    const plan = buildUnpackPlan({
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
    expect(planned(getStep(steps, 0)).readiness.status).toBe("skip");
    expect(planned(getStep(steps, 1)).readiness.status).toBe("ready");
  });

  it("marks already directly installed mcp-servers as skip", () => {
    const plan = buildUnpackPlan({
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
    expect(planned(getStep(steps, 0)).readiness.status).toBe("skip");
    expect(planned(getStep(steps, 1)).readiness.status).toBe("ready");
  });

  it("orders steps: install ops first, uninstall-pack last", () => {
    const plan = buildUnpackPlan({
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
    expect(getStep(steps, 0).operation.name).toBe("install-skill");
    expect(getStep(steps, 1).operation.name).toBe("install-command");
    expect(getStep(steps, 2).operation.name).toBe("install-mcp-server");
    expect(getStep(steps, 3).operation.name).toBe("uninstall-pack");
  });

  it("uninstall-pack step uses pack name as label", () => {
    const plan = buildUnpackPlan({
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
    expect(getStep(steps, 0).operation.name).toBe("uninstall-pack");
    expect(getStep(steps, 0).label).toBe("my-pack");
    expect(planned(getStep(steps, 0)).readiness.status).toBe("ready");
  });

  it("passes through caller-provided name and description", () => {
    const plan = buildUnpackPlan({
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
    const plan = buildUnpackPlan({
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
    const plan = buildUnpackPlan({
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
    expect(planned(getStep(steps, 0)).readiness.status).toBe("skip"); // skill-a
    expect(planned(getStep(steps, 1)).readiness.status).toBe("ready"); // skill-b
    expect(planned(getStep(steps, 2)).readiness.status).toBe("ready"); // cmd-a
    expect(planned(getStep(steps, 3)).readiness.status).toBe("skip"); // cmd-b
    expect(planned(getStep(steps, 4)).readiness.status).toBe("ready"); // server-a
    expect(getStep(steps, 5).operation.name).toBe("uninstall-pack"); // last
  });

  it("install ops use empty integrity (skip fetch path)", () => {
    const plan = buildUnpackPlan({
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
    const skillOp = expectOperation(getStep(steps, 0).operation, "install-skill");
    expect(skillOp.args.ref.refType === "registry" && skillOp.args.ref.integrity).toBe("");

    const cmdOp = expectOperation(getStep(steps, 1).operation, "install-command");
    expect(cmdOp.args.ref.refType === "registry" && cmdOp.args.ref.integrity).toBe("");

    const serverOp = expectOperation(getStep(steps, 2).operation, "install-mcp-server");
    expect(serverOp.args.ref.refType === "registry" && serverOp.args.ref.integrity).toBe("");
  });

  it("install-skill ops have skipSettings as Option.none (not skipped)", () => {
    const plan = buildUnpackPlan({
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
    const skillOp = expectOperation(getStep(steps, 0).operation, "install-skill");
    expect(Option.isNone(skillOp.args.skipSettings)).toBe(true);
  });
});
