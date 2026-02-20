/**
 * Unit tests for pack unpack buildUnpackPlan.
 *
 * Tests the pack-specific unpack plan builder that diffs operations against
 * configured extension state.
 */

import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import type { InstallSkillOperation } from "../../../extensions/skills/operations/install.js";
import type { InstallCommandOperation } from "../../../extensions/commands/operations/install.js";
import type { InstallMcpServerOperation } from "../../../extensions/mcp-servers/operations/install.js";
import type { UninstallPackOperation } from "../../../extensions/packs/operations/uninstall.js";
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
        namespace: Option.none(),
      },
      namespace: "@acme",
      name,
      version: "1.0.0",
      integrity: "",
    },
    force: false,
    versionConstraint: Option.none(),
    skipSettings: Option.none(),
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
        namespace: Option.none(),
      },
      namespace: "@acme",
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
        namespace: Option.none(),
      },
      namespace: "@acme",
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

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.operation.name).toBe("install-skill");
    expect(steps[0]!.label).toBe("skill-a");
    expect(steps[0]!.expectedResult.result).toBe("success");
    expect(steps[1]!.operation.name).toBe("install-skill");
    expect(steps[1]!.label).toBe("skill-b");
    expect(steps[1]!.expectedResult.result).toBe("success");
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

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.operation.name).toBe("install-command");
    expect(steps[0]!.label).toBe("cmd-a");
    expect(steps[0]!.expectedResult.result).toBe("success");
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

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.operation.name).toBe("install-mcp-server");
    expect(steps[0]!.label).toBe("server-a");
    expect(steps[0]!.expectedResult.result).toBe("success");
  });

  it("marks already directly installed skills as no-op", () => {
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

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.expectedResult.result).toBe("no-op");
    expect(steps[0]!.expectedResult.message).toBe("already directly installed");
    expect(steps[1]!.expectedResult.result).toBe("success");
  });

  it("marks already directly installed commands as no-op", () => {
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

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.expectedResult.result).toBe("no-op");
    expect(steps[1]!.expectedResult.result).toBe("success");
  });

  it("marks already directly installed mcp-servers as no-op", () => {
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

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.expectedResult.result).toBe("no-op");
    expect(steps[1]!.expectedResult.result).toBe("success");
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

    const steps = plan.jobs[0]!.steps;
    expect(steps).toHaveLength(4);
    expect(steps[0]!.operation.name).toBe("install-skill");
    expect(steps[1]!.operation.name).toBe("install-command");
    expect(steps[2]!.operation.name).toBe("install-mcp-server");
    expect(steps[3]!.operation.name).toBe("uninstall-pack");
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

    const steps = plan.jobs[0]!.steps;
    expect(steps).toHaveLength(1);
    expect(steps[0]!.operation.name).toBe("uninstall-pack");
    expect(steps[0]!.label).toBe("my-pack");
    expect(steps[0]!.expectedResult.result).toBe("success");
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
    expect(plan.jobs[0]!.concurrency).toBe(1);
  });

  it("handles mixed no-ops across extension types", () => {
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

    const steps = plan.jobs[0]!.steps;
    expect(steps).toHaveLength(6);
    expect(steps[0]!.expectedResult.result).toBe("no-op"); // skill-a
    expect(steps[1]!.expectedResult.result).toBe("success"); // skill-b
    expect(steps[2]!.expectedResult.result).toBe("success"); // cmd-a
    expect(steps[3]!.expectedResult.result).toBe("no-op"); // cmd-b
    expect(steps[4]!.expectedResult.result).toBe("success"); // server-a
    expect(steps[5]!.operation.name).toBe("uninstall-pack"); // last
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

    const steps = plan.jobs[0]!.steps;
    const skillOp = steps[0]!.operation as InstallSkillOperation;
    expect(skillOp.args.ref.refType === "registry" && skillOp.args.ref.integrity).toBe("");

    const cmdOp = steps[1]!.operation as InstallCommandOperation;
    expect(cmdOp.args.ref.refType === "registry" && cmdOp.args.ref.integrity).toBe("");

    const serverOp = steps[2]!.operation as InstallMcpServerOperation;
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

    const steps = plan.jobs[0]!.steps;
    const skillOp = steps[0]!.operation as InstallSkillOperation;
    expect(Option.isNone(skillOp.args.skipSettings)).toBe(true);
  });
});
