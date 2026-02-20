/**
 * Unit tests for pack uninstall buildUninstallPlan.
 *
 * Tests the uninstall-specific plan builder including skill removal steps.
 */

import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import type { Lockfile, PackLockEntry } from "../../../lockfile/schema.js";
import type { UninstallPackOperation } from "../../../extensions/packs/operations/uninstall.js";
import { buildUninstallPlan } from "./plan.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeOp = (name: string): UninstallPackOperation => ({
  name: "uninstall-pack",
  args: { packName: name },
});

const makePackLockEntry = (
  name: string,
  overrides?: {
    resolvedSkills?: Record<string, string>;
    resolvedCommands?: Record<string, string>;
    resolvedMcpServers?: Record<string, string>;
  },
): PackLockEntry => ({
  type: "registry",
  namespace: "@acme",
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  sourceName: "local",
  installedAt: new Date(),
  updatedAt: new Date(),
  resolvedSkills: overrides?.resolvedSkills ?? {},
  resolvedCommands: overrides?.resolvedCommands ?? {},
  resolvedMcpServers: overrides?.resolvedMcpServers ?? {},
});

const emptyLockfile: Lockfile = {
  lockfileVersion: 1,
  skills: {},
};

const lockfileWithPacks = (...entries: [string, PackLockEntry][]): Lockfile => ({
  lockfileVersion: 1,
  skills: {},
  packs: Object.fromEntries(entries),
});

// -----------------------------------------------------------------------------
// buildUninstallPlan Tests
// -----------------------------------------------------------------------------

describe("buildUninstallPlan", () => {
  it("marks installed packs as expected success", () => {
    const lockfile = lockfileWithPacks(["my-pack", makePackLockEntry("my-pack")]);
    const plan = buildUninstallPlan(
      [makeOp("my-pack")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.steps).toHaveLength(1);
    expect(plan.jobs[0]!.steps[0]!._tag).toBe("PlannedJobStep");
    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "success",
      message: "Uninstalled pack my-pack",
    });
  });

  it("marks packs not in lockfile as expected no-op", () => {
    const plan = buildUninstallPlan(
      [makeOp("my-pack")],
      emptyLockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    expect(plan.jobs[0]!.steps[0]!._tag).toBe("PlannedJobStep");
    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "no-op",
      message: "not installed",
    });
  });

  it("produces empty plan from empty operations", () => {
    const plan = buildUninstallPlan([], emptyLockfile, [], "Uninstall pack", Option.none());

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.steps).toHaveLength(0);
  });

  it("derives label from pack name", () => {
    const lockfile = lockfileWithPacks(
      ["pack-a", makePackLockEntry("pack-a")],
      ["pack-b", makePackLockEntry("pack-b")],
    );
    const plan = buildUninstallPlan(
      [makeOp("pack-a"), makeOp("pack-b")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    expect(plan.jobs[0]!.steps[0]!.label).toBe("pack-a");
    expect(plan.jobs[0]!.steps[1]!.label).toBe("pack-b");
  });

  it("passes through caller-provided name and description", () => {
    const plan = buildUninstallPlan(
      [makeOp("my-pack")],
      emptyLockfile,
      [],
      "Uninstall pack(s)",
      Option.some("Uninstall packs from workspace"),
    );

    expect(plan.name).toBe("Uninstall pack(s)");
    expect(plan.description).toEqual(Option.some("Uninstall packs from workspace"));
  });

  it("creates a single job with serial concurrency", () => {
    const lockfile = lockfileWithPacks(
      ["a", makePackLockEntry("a")],
      ["b", makePackLockEntry("b")],
    );
    const plan = buildUninstallPlan(
      [makeOp("a"), makeOp("b")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.concurrency).toBe(1);
  });

  it("handles mixed success and no-op expected results", () => {
    const lockfile = lockfileWithPacks(
      ["pack-a", makePackLockEntry("pack-a")],
      ["pack-c", makePackLockEntry("pack-c")],
    );
    const plan = buildUninstallPlan(
      [makeOp("pack-a"), makeOp("pack-b"), makeOp("pack-c")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.expectedResult.result).toBe("success");
    expect(steps[0]!.label).toBe("pack-a");
    expect(steps[1]!.expectedResult.result).toBe("no-op");
    expect(steps[1]!.label).toBe("pack-b");
    expect(steps[2]!.expectedResult.result).toBe("success");
    expect(steps[2]!.label).toBe("pack-c");
  });

  // ---------------------------------------------------------------------------
  // Skill removal steps
  // ---------------------------------------------------------------------------

  it("emits uninstall-skill steps for removable skills", () => {
    const lockfile = lockfileWithPacks([
      "my-pack",
      makePackLockEntry("my-pack", {
        resolvedSkills: { "@acme/skills/skill-a": "1.0.0", "@acme/skills/skill-b": "1.0.0" },
      }),
    ]);
    const plan = buildUninstallPlan(
      [makeOp("my-pack")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    const steps = plan.jobs[0]!.steps;
    // 1 pack step + 2 skill steps
    expect(steps).toHaveLength(3);

    const skillSteps = steps.filter((s) => s.operation.name === "uninstall-skill");
    expect(skillSteps).toHaveLength(2);
    expect(skillSteps.map((s) => s.label).sort()).toEqual([
      "@acme/skills/skill-a",
      "@acme/skills/skill-b",
    ]);
  });

  it("creates uninstall-skill steps with agents: [] and correct expected result", () => {
    const lockfile = lockfileWithPacks([
      "my-pack",
      makePackLockEntry("my-pack", {
        resolvedSkills: { "@acme/skills/skill-a": "1.0.0" },
      }),
    ]);
    const plan = buildUninstallPlan(
      [makeOp("my-pack")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    const skillStep = plan.jobs[0]!.steps.find((s) => s.operation.name === "uninstall-skill");
    expect(skillStep).toBeDefined();
    expect(skillStep!.operation.name).toBe("uninstall-skill");

    const args = skillStep!.operation.args;
    expect(args).toEqual({
      skillName: "skill-a",
      agents: [],
    });
    expect(skillStep!.expectedResult).toEqual({
      result: "success",
      message: "Uninstalled skill skill-a",
    });
  });

  it("places pack steps before skill steps", () => {
    const lockfile = lockfileWithPacks([
      "my-pack",
      makePackLockEntry("my-pack", {
        resolvedSkills: { "@acme/skills/skill-a": "1.0.0" },
      }),
    ]);
    const plan = buildUninstallPlan(
      [makeOp("my-pack")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.operation.name).toBe("uninstall-pack");
    expect(steps[1]!.operation.name).toBe("uninstall-skill");
  });

  it("excludes skills shared with a remaining pack", () => {
    const lockfile = lockfileWithPacks(
      [
        "removing-pack",
        makePackLockEntry("removing-pack", {
          resolvedSkills: {
            "@acme/skills/shared": "1.0.0",
            "@acme/skills/orphaned": "1.0.0",
          },
        }),
      ],
      [
        "staying-pack",
        makePackLockEntry("staying-pack", {
          resolvedSkills: { "@acme/skills/shared": "1.0.0" },
        }),
      ],
    );
    const plan = buildUninstallPlan(
      [makeOp("removing-pack")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    const skillSteps = plan.jobs[0]!.steps.filter((s) => s.operation.name === "uninstall-skill");
    expect(skillSteps).toHaveLength(1);
    expect(skillSteps[0]!.label).toBe("@acme/skills/orphaned");
  });

  it("excludes directly-installed skills (simple name match)", () => {
    const lockfile = lockfileWithPacks([
      "my-pack",
      makePackLockEntry("my-pack", {
        resolvedSkills: {
          "@acme/skills/code-review": "1.0.0",
          "@acme/skills/orphaned": "1.0.0",
        },
      }),
    ]);
    const plan = buildUninstallPlan(
      [makeOp("my-pack")],
      lockfile,
      ["code-review"],
      "Uninstall pack",
      Option.none(),
    );

    const skillSteps = plan.jobs[0]!.steps.filter((s) => s.operation.name === "uninstall-skill");
    expect(skillSteps).toHaveLength(1);
    expect(skillSteps[0]!.label).toBe("@acme/skills/orphaned");
  });

  it("handles glob batch: skill shared between TWO removed packs is removable", () => {
    const lockfile = lockfileWithPacks(
      [
        "pack-a",
        makePackLockEntry("pack-a", {
          resolvedSkills: { "@acme/skills/shared-skill": "1.0.0" },
        }),
      ],
      [
        "pack-b",
        makePackLockEntry("pack-b", {
          resolvedSkills: { "@acme/skills/shared-skill": "1.0.0" },
        }),
      ],
    );
    const plan = buildUninstallPlan(
      [makeOp("pack-a"), makeOp("pack-b")],
      lockfile,
      [],
      "Uninstall packs",
      Option.none(),
    );

    const skillSteps = plan.jobs[0]!.steps.filter((s) => s.operation.name === "uninstall-skill");
    expect(skillSteps).toHaveLength(1);
    expect(skillSteps[0]!.label).toBe("@acme/skills/shared-skill");
  });

  it("handles glob batch: remaining packs computed correctly", () => {
    const lockfile = lockfileWithPacks(
      [
        "pack-a",
        makePackLockEntry("pack-a", {
          resolvedSkills: { "@acme/skills/skill-a": "1.0.0" },
        }),
      ],
      [
        "pack-b",
        makePackLockEntry("pack-b", {
          resolvedSkills: { "@acme/skills/skill-a": "1.0.0" },
        }),
      ],
      [
        "pack-c",
        makePackLockEntry("pack-c", {
          resolvedSkills: { "@acme/skills/skill-a": "1.0.0" },
        }),
      ],
    );
    // Remove pack-a and pack-b, pack-c remains and references skill-a
    const plan = buildUninstallPlan(
      [makeOp("pack-a"), makeOp("pack-b")],
      lockfile,
      [],
      "Uninstall packs",
      Option.none(),
    );

    const skillSteps = plan.jobs[0]!.steps.filter((s) => s.operation.name === "uninstall-skill");
    // skill-a is still referenced by pack-c, so no skill removal
    expect(skillSteps).toHaveLength(0);
  });

  it("does not emit skill steps for packs not in lockfile", () => {
    const plan = buildUninstallPlan(
      [makeOp("nonexistent-pack")],
      emptyLockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    const skillSteps = plan.jobs[0]!.steps.filter((s) => s.operation.name === "uninstall-skill");
    expect(skillSteps).toHaveLength(0);
  });

  it("deduplicates skills across multiple packs being removed", () => {
    const lockfile = lockfileWithPacks(
      [
        "pack-a",
        makePackLockEntry("pack-a", {
          resolvedSkills: {
            "@acme/skills/shared": "1.0.0",
            "@acme/skills/only-a": "1.0.0",
          },
        }),
      ],
      [
        "pack-b",
        makePackLockEntry("pack-b", {
          resolvedSkills: {
            "@acme/skills/shared": "1.0.0",
            "@acme/skills/only-b": "1.0.0",
          },
        }),
      ],
    );
    const plan = buildUninstallPlan(
      [makeOp("pack-a"), makeOp("pack-b")],
      lockfile,
      [],
      "Uninstall packs",
      Option.none(),
    );

    const skillSteps = plan.jobs[0]!.steps.filter((s) => s.operation.name === "uninstall-skill");
    // 3 unique skills: shared, only-a, only-b
    expect(skillSteps).toHaveLength(3);
    const labels = skillSteps.map((s) => s.label).sort();
    expect(labels).toEqual(["@acme/skills/only-a", "@acme/skills/only-b", "@acme/skills/shared"]);
  });

  it("returns Plan<PackUninstallOp> with both operation types", () => {
    const lockfile = lockfileWithPacks([
      "my-pack",
      makePackLockEntry("my-pack", {
        resolvedSkills: { "@acme/skills/skill-a": "1.0.0" },
      }),
    ]);
    const plan = buildUninstallPlan(
      [makeOp("my-pack")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    const opNames = plan.jobs[0]!.steps.map((s) => s.operation.name);
    expect(opNames).toContain("uninstall-pack");
    expect(opNames).toContain("uninstall-skill");
  });

  // ---------------------------------------------------------------------------
  // Command removal steps
  // ---------------------------------------------------------------------------

  it("emits uninstall-command steps for orphaned commands", () => {
    const lockfile = lockfileWithPacks([
      "my-pack",
      makePackLockEntry("my-pack", {
        resolvedCommands: { "@acme/commands/cmd-a": "1.0.0", "@acme/commands/cmd-b": "1.0.0" },
      }),
    ]);
    const plan = buildUninstallPlan(
      [makeOp("my-pack")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    const commandSteps = plan.jobs[0]!.steps.filter(
      (s) => s.operation.name === "uninstall-command",
    );
    expect(commandSteps).toHaveLength(2);
    expect(commandSteps.map((s) => s.label).sort()).toEqual([
      "@acme/commands/cmd-a",
      "@acme/commands/cmd-b",
    ]);
  });

  it("creates uninstall-command steps with correct args and expected result", () => {
    const lockfile = lockfileWithPacks([
      "my-pack",
      makePackLockEntry("my-pack", {
        resolvedCommands: { "@acme/commands/cmd-a": "1.0.0" },
      }),
    ]);
    const plan = buildUninstallPlan(
      [makeOp("my-pack")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    const cmdStep = plan.jobs[0]!.steps.find((s) => s.operation.name === "uninstall-command");
    expect(cmdStep).toBeDefined();
    expect(cmdStep!.operation.args).toEqual({ commandName: "cmd-a" });
    expect(cmdStep!.expectedResult).toEqual({
      result: "success",
      message: "Uninstalled command cmd-a",
    });
  });

  it("excludes commands shared with a remaining pack", () => {
    const lockfile = lockfileWithPacks(
      [
        "removing-pack",
        makePackLockEntry("removing-pack", {
          resolvedCommands: {
            "@acme/commands/shared": "1.0.0",
            "@acme/commands/orphaned": "1.0.0",
          },
        }),
      ],
      [
        "staying-pack",
        makePackLockEntry("staying-pack", {
          resolvedCommands: { "@acme/commands/shared": "1.0.0" },
        }),
      ],
    );
    const plan = buildUninstallPlan(
      [makeOp("removing-pack")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    const commandSteps = plan.jobs[0]!.steps.filter(
      (s) => s.operation.name === "uninstall-command",
    );
    expect(commandSteps).toHaveLength(1);
    expect(commandSteps[0]!.label).toBe("@acme/commands/orphaned");
  });

  it("excludes directly-configured commands", () => {
    const lockfile = lockfileWithPacks([
      "my-pack",
      makePackLockEntry("my-pack", {
        resolvedCommands: {
          "@acme/commands/direct-cmd": "1.0.0",
          "@acme/commands/orphaned": "1.0.0",
        },
      }),
    ]);
    const plan = buildUninstallPlan(
      [makeOp("my-pack")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
      ["direct-cmd"],
    );

    const commandSteps = plan.jobs[0]!.steps.filter(
      (s) => s.operation.name === "uninstall-command",
    );
    expect(commandSteps).toHaveLength(1);
    expect(commandSteps[0]!.label).toBe("@acme/commands/orphaned");
  });

  it("glob: command shared between two removed packs produces one step", () => {
    const lockfile = lockfileWithPacks(
      [
        "pack-a",
        makePackLockEntry("pack-a", {
          resolvedCommands: { "@acme/commands/shared-cmd": "1.0.0" },
        }),
      ],
      [
        "pack-b",
        makePackLockEntry("pack-b", {
          resolvedCommands: { "@acme/commands/shared-cmd": "1.0.0" },
        }),
      ],
    );
    const plan = buildUninstallPlan(
      [makeOp("pack-a"), makeOp("pack-b")],
      lockfile,
      [],
      "Uninstall packs",
      Option.none(),
    );

    const commandSteps = plan.jobs[0]!.steps.filter(
      (s) => s.operation.name === "uninstall-command",
    );
    expect(commandSteps).toHaveLength(1);
    expect(commandSteps[0]!.label).toBe("@acme/commands/shared-cmd");
  });

  // ---------------------------------------------------------------------------
  // MCP server removal steps
  // ---------------------------------------------------------------------------

  it("emits uninstall-mcp-server steps for orphaned MCP servers", () => {
    const lockfile = lockfileWithPacks([
      "my-pack",
      makePackLockEntry("my-pack", {
        resolvedMcpServers: {
          "@acme/mcp-servers/srv-a": "1.0.0",
          "@acme/mcp-servers/srv-b": "1.0.0",
        },
      }),
    ]);
    const plan = buildUninstallPlan(
      [makeOp("my-pack")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    const mcpSteps = plan.jobs[0]!.steps.filter((s) => s.operation.name === "uninstall-mcp-server");
    expect(mcpSteps).toHaveLength(2);
    expect(mcpSteps.map((s) => s.label).sort()).toEqual([
      "@acme/mcp-servers/srv-a",
      "@acme/mcp-servers/srv-b",
    ]);
  });

  it("creates uninstall-mcp-server steps with correct args and expected result", () => {
    const lockfile = lockfileWithPacks([
      "my-pack",
      makePackLockEntry("my-pack", {
        resolvedMcpServers: { "@acme/mcp-servers/srv-a": "1.0.0" },
      }),
    ]);
    const plan = buildUninstallPlan(
      [makeOp("my-pack")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    const mcpStep = plan.jobs[0]!.steps.find((s) => s.operation.name === "uninstall-mcp-server");
    expect(mcpStep).toBeDefined();
    expect(mcpStep!.operation.args).toEqual({ serverName: "srv-a" });
    expect(mcpStep!.expectedResult).toEqual({
      result: "success",
      message: "Uninstalled MCP server srv-a",
    });
  });

  it("excludes MCP servers shared with a remaining pack", () => {
    const lockfile = lockfileWithPacks(
      [
        "removing-pack",
        makePackLockEntry("removing-pack", {
          resolvedMcpServers: {
            "@acme/mcp-servers/shared": "1.0.0",
            "@acme/mcp-servers/orphaned": "1.0.0",
          },
        }),
      ],
      [
        "staying-pack",
        makePackLockEntry("staying-pack", {
          resolvedMcpServers: { "@acme/mcp-servers/shared": "1.0.0" },
        }),
      ],
    );
    const plan = buildUninstallPlan(
      [makeOp("removing-pack")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    const mcpSteps = plan.jobs[0]!.steps.filter((s) => s.operation.name === "uninstall-mcp-server");
    expect(mcpSteps).toHaveLength(1);
    expect(mcpSteps[0]!.label).toBe("@acme/mcp-servers/orphaned");
  });

  it("excludes directly-configured MCP servers", () => {
    const lockfile = lockfileWithPacks([
      "my-pack",
      makePackLockEntry("my-pack", {
        resolvedMcpServers: {
          "@acme/mcp-servers/direct-srv": "1.0.0",
          "@acme/mcp-servers/orphaned": "1.0.0",
        },
      }),
    ]);
    const plan = buildUninstallPlan(
      [makeOp("my-pack")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
      [],
      ["direct-srv"],
    );

    const mcpSteps = plan.jobs[0]!.steps.filter((s) => s.operation.name === "uninstall-mcp-server");
    expect(mcpSteps).toHaveLength(1);
    expect(mcpSteps[0]!.label).toBe("@acme/mcp-servers/orphaned");
  });

  it("glob: MCP server shared between two removed packs produces one step", () => {
    const lockfile = lockfileWithPacks(
      [
        "pack-a",
        makePackLockEntry("pack-a", {
          resolvedMcpServers: { "@acme/mcp-servers/shared-srv": "1.0.0" },
        }),
      ],
      [
        "pack-b",
        makePackLockEntry("pack-b", {
          resolvedMcpServers: { "@acme/mcp-servers/shared-srv": "1.0.0" },
        }),
      ],
    );
    const plan = buildUninstallPlan(
      [makeOp("pack-a"), makeOp("pack-b")],
      lockfile,
      [],
      "Uninstall packs",
      Option.none(),
    );

    const mcpSteps = plan.jobs[0]!.steps.filter((s) => s.operation.name === "uninstall-mcp-server");
    expect(mcpSteps).toHaveLength(1);
    expect(mcpSteps[0]!.label).toBe("@acme/mcp-servers/shared-srv");
  });

  // ---------------------------------------------------------------------------
  // Mixed extension types
  // ---------------------------------------------------------------------------

  it("places pack steps before skill/command/mcp-server steps", () => {
    const lockfile = lockfileWithPacks([
      "my-pack",
      makePackLockEntry("my-pack", {
        resolvedSkills: { "@acme/skills/skill-a": "1.0.0" },
        resolvedCommands: { "@acme/commands/cmd-a": "1.0.0" },
        resolvedMcpServers: { "@acme/mcp-servers/srv-a": "1.0.0" },
      }),
    ]);
    const plan = buildUninstallPlan(
      [makeOp("my-pack")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    const steps = plan.jobs[0]!.steps;
    expect(steps).toHaveLength(4);
    expect(steps[0]!.operation.name).toBe("uninstall-pack");
    // Extension steps follow pack steps
    const extensionOpNames = steps.slice(1).map((s) => s.operation.name);
    expect(extensionOpNames).toContain("uninstall-skill");
    expect(extensionOpNames).toContain("uninstall-command");
    expect(extensionOpNames).toContain("uninstall-mcp-server");
  });

  it("returns Plan with all four operation types", () => {
    const lockfile = lockfileWithPacks([
      "my-pack",
      makePackLockEntry("my-pack", {
        resolvedSkills: { "@acme/skills/skill-a": "1.0.0" },
        resolvedCommands: { "@acme/commands/cmd-a": "1.0.0" },
        resolvedMcpServers: { "@acme/mcp-servers/srv-a": "1.0.0" },
      }),
    ]);
    const plan = buildUninstallPlan(
      [makeOp("my-pack")],
      lockfile,
      [],
      "Uninstall pack",
      Option.none(),
    );

    const opNames = plan.jobs[0]!.steps.map((s) => s.operation.name);
    expect(opNames).toContain("uninstall-pack");
    expect(opNames).toContain("uninstall-skill");
    expect(opNames).toContain("uninstall-command");
    expect(opNames).toContain("uninstall-mcp-server");
  });

  it("glob removing multiple packs that share extensions across all types", () => {
    const lockfile = lockfileWithPacks(
      [
        "pack-a",
        makePackLockEntry("pack-a", {
          resolvedSkills: { "@acme/skills/shared": "1.0.0" },
          resolvedCommands: { "@acme/commands/shared": "1.0.0", "@acme/commands/only-a": "1.0.0" },
          resolvedMcpServers: { "@acme/mcp-servers/shared": "1.0.0" },
        }),
      ],
      [
        "pack-b",
        makePackLockEntry("pack-b", {
          resolvedSkills: { "@acme/skills/shared": "1.0.0", "@acme/skills/only-b": "1.0.0" },
          resolvedCommands: { "@acme/commands/shared": "1.0.0" },
          resolvedMcpServers: {
            "@acme/mcp-servers/shared": "1.0.0",
            "@acme/mcp-servers/only-b": "1.0.0",
          },
        }),
      ],
    );
    const plan = buildUninstallPlan(
      [makeOp("pack-a"), makeOp("pack-b")],
      lockfile,
      [],
      "Uninstall packs",
      Option.none(),
    );

    const skillSteps = plan.jobs[0]!.steps.filter((s) => s.operation.name === "uninstall-skill");
    const commandSteps = plan.jobs[0]!.steps.filter(
      (s) => s.operation.name === "uninstall-command",
    );
    const mcpSteps = plan.jobs[0]!.steps.filter((s) => s.operation.name === "uninstall-mcp-server");

    // All shared extensions are removable since both packs are being removed
    expect(skillSteps).toHaveLength(2); // shared + only-b
    expect(commandSteps).toHaveLength(2); // shared + only-a
    expect(mcpSteps).toHaveLength(2); // shared + only-b
  });
});
