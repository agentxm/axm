/**
 * Unit tests for pack uninstall buildUninstallPlan and orphan detection.
 *
 * Tests the uninstall-specific plan builder and the findOrphaned* functions.
 */

import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import type { Lockfile, PackLockEntry } from "../../../lockfile/schema.js";
import type { UninstallPackOperation } from "../../../extensions/packs/operations/uninstall.js";
import {
  buildUninstallPlan,
  findOrphanedSkills,
  findOrphanedCommands,
  findOrphanedMcpServers,
} from "./plan.js";

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
    const plan = buildUninstallPlan([makeOp("my-pack")], lockfile, "Uninstall pack", Option.none());

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
    const plan = buildUninstallPlan([], emptyLockfile, "Uninstall pack", Option.none());

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
});

// -----------------------------------------------------------------------------
// findOrphanedSkills Tests
// -----------------------------------------------------------------------------

describe("findOrphanedSkills", () => {
  it("returns orphaned skills from removed pack", () => {
    const removed = makePackLockEntry("removed-pack", {
      resolvedSkills: { "@acme/skills/skill-a": "1.0.0", "@acme/skills/skill-b": "1.0.0" },
    });

    const orphaned = findOrphanedSkills(removed, {}, {});

    expect(orphaned).toEqual(["@acme/skills/skill-a", "@acme/skills/skill-b"]);
  });

  it("preserves skills shared with another pack", () => {
    const removed = makePackLockEntry("removed-pack", {
      resolvedSkills: { "@acme/skills/skill-a": "1.0.0", "@acme/skills/skill-b": "1.0.0" },
    });
    const otherPack = makePackLockEntry("other-pack", {
      resolvedSkills: { "@acme/skills/skill-a": "1.0.0" },
    });

    const orphaned = findOrphanedSkills(removed, { "other-pack": otherPack }, {});

    expect(orphaned).toEqual(["@acme/skills/skill-b"]);
  });

  it("preserves skills that are direct entries in settings", () => {
    const removed = makePackLockEntry("removed-pack", {
      resolvedSkills: { "@acme/skills/skill-a": "1.0.0", "@acme/skills/skill-b": "1.0.0" },
    });
    const configuredSkills = { "@acme/skills/skill-a": "@acme/skills/skill-a" };

    const orphaned = findOrphanedSkills(removed, {}, configuredSkills);

    expect(orphaned).toEqual(["@acme/skills/skill-b"]);
  });

  it("returns empty array when all skills are shared", () => {
    const removed = makePackLockEntry("removed-pack", {
      resolvedSkills: { "@acme/skills/skill-a": "1.0.0" },
    });
    const otherPack = makePackLockEntry("other-pack", {
      resolvedSkills: { "@acme/skills/skill-a": "1.0.0" },
    });

    const orphaned = findOrphanedSkills(removed, { "other-pack": otherPack }, {});

    expect(orphaned).toEqual([]);
  });

  it("returns empty array when pack has no resolved skills", () => {
    const removed = makePackLockEntry("removed-pack");

    const orphaned = findOrphanedSkills(removed, {}, {});

    expect(orphaned).toEqual([]);
  });

  it("preserves skills promoted to direct AND shared with another pack", () => {
    const removed = makePackLockEntry("removed-pack", {
      resolvedSkills: { "@acme/skills/skill-a": "1.0.0", "@acme/skills/skill-b": "1.0.0" },
    });
    const otherPack = makePackLockEntry("other-pack", {
      resolvedSkills: { "@acme/skills/skill-b": "1.0.0" },
    });
    const configuredSkills = { "@acme/skills/skill-a": "@acme/skills/skill-a" };

    const orphaned = findOrphanedSkills(removed, { "other-pack": otherPack }, configuredSkills);

    expect(orphaned).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// findOrphanedCommands Tests
// -----------------------------------------------------------------------------

describe("findOrphanedCommands", () => {
  it("returns orphaned commands from removed pack", () => {
    const removed = makePackLockEntry("removed-pack", {
      resolvedCommands: { "@acme/commands/cmd-a": "1.0.0" },
    });

    const orphaned = findOrphanedCommands(removed, {});

    expect(orphaned).toEqual(["@acme/commands/cmd-a"]);
  });

  it("preserves commands shared with another pack", () => {
    const removed = makePackLockEntry("removed-pack", {
      resolvedCommands: { "@acme/commands/cmd-a": "1.0.0", "@acme/commands/cmd-b": "1.0.0" },
    });
    const otherPack = makePackLockEntry("other-pack", {
      resolvedCommands: { "@acme/commands/cmd-a": "1.0.0" },
    });

    const orphaned = findOrphanedCommands(removed, { "other-pack": otherPack });

    expect(orphaned).toEqual(["@acme/commands/cmd-b"]);
  });
});

// -----------------------------------------------------------------------------
// findOrphanedMcpServers Tests
// -----------------------------------------------------------------------------

describe("findOrphanedMcpServers", () => {
  it("returns orphaned MCP servers from removed pack", () => {
    const removed = makePackLockEntry("removed-pack", {
      resolvedMcpServers: { "@acme/mcp-servers/server-a": "1.0.0" },
    });

    const orphaned = findOrphanedMcpServers(removed, {});

    expect(orphaned).toEqual(["@acme/mcp-servers/server-a"]);
  });

  it("preserves MCP servers shared with another pack", () => {
    const removed = makePackLockEntry("removed-pack", {
      resolvedMcpServers: {
        "@acme/mcp-servers/server-a": "1.0.0",
        "@acme/mcp-servers/server-b": "1.0.0",
      },
    });
    const otherPack = makePackLockEntry("other-pack", {
      resolvedMcpServers: { "@acme/mcp-servers/server-a": "1.0.0" },
    });

    const orphaned = findOrphanedMcpServers(removed, { "other-pack": otherPack });

    expect(orphaned).toEqual(["@acme/mcp-servers/server-b"]);
  });
});
