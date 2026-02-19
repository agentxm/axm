/**
 * Unit tests for orphan detection functions.
 *
 * Tests findOrphanedSkills, findOrphanedCommands, and findOrphanedMcpServers.
 */

import { describe, expect, it } from "vitest";
import type { PackLockEntry } from "../../../lockfile/schema.js";
import {
  findOrphanedSkills,
  findOrphanedCommands,
  findOrphanedMcpServers,
} from "./orphan-detection.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

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
