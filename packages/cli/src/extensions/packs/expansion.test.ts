/**
 * Tests for pack expansion helpers.
 *
 * Verifies expandPackInstallRefs, expandPackUninstallTargets, and
 * resolveSkillUninstallTargetsFromLockfile behavior.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import type { RegistryPackRef, BuiltinPackRef } from "../../sources/index.js";
import type { PackExtensionTarget } from "../../workflows/install-operation/workflow.js";
import type { Lockfile } from "../../lockfile/index.js";
import {
  expandPackInstallRefs,
  expandPackUninstallTargets,
  resolveSkillUninstallTargetsFromLockfile,
} from "./expansion.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeRegistryPackRef = (
  name: string,
  opts?: {
    namespace?: string;
    skills?: Readonly<Record<string, string>>;
    commands?: Readonly<Record<string, string>>;
    mcpServers?: Readonly<Record<string, string>>;
  },
): RegistryPackRef => ({
  type: "pack",
  refType: "registry",
  namespace: opts?.namespace ?? "@acme",
  pack: {
    name,
    skills: opts?.skills ?? {},
    commands: opts?.commands ?? {},
    mcpServers: opts?.mcpServers ?? {},
  },
  source: { type: "registry", location: new URL("file:///tmp/reg"), namespace: Option.none() },
  name,
  version: "1.0.0",
  integrity: "sha512-abc",
});

const makeBuiltinPackRef = (
  name: string,
  opts?: {
    namespace?: string;
    skills?: Readonly<Record<string, string>>;
  },
): BuiltinPackRef => ({
  type: "pack",
  refType: "builtin",
  namespace: opts?.namespace ?? "@axm",
  pack: {
    name,
    skills: opts?.skills ?? {},
    commands: {},
    mcpServers: {},
  },
  source: { type: "builtin" },
});

const makePackTarget = (name: string, namespace = "@acme"): PackExtensionTarget => ({
  type: "pack",
  name,
  namespace,
});

const emptyLockfile: Lockfile = {
  lockfileVersion: 1,
  skills: {},
};

// -----------------------------------------------------------------------------
// expandPackInstallRefs
// -----------------------------------------------------------------------------

describe("expandPackInstallRefs", () => {
  it("returns only the pack ref when no dependencies", () => {
    const ref = makeRegistryPackRef("my-pack");
    const result = Effect.runSync(
      expandPackInstallRefs({
        pack: ref,
        supportedDependencyTypes: ["skill", "command", "mcp-server"],
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("pack");
  });

  it("returns pack ref first, followed by dependency refs", () => {
    const ref = makeRegistryPackRef("my-pack", {
      skills: { "@acme/skills/code-review": "1.0.0" },
    });
    const result = Effect.runSync(
      expandPackInstallRefs({
        pack: ref,
        supportedDependencyTypes: ["skill", "command", "mcp-server"],
      }),
    );

    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe("pack");
    expect(result[1]!.type).toBe("skill");
  });

  it("produces skill dependency refs in declaration order", () => {
    const ref = makeRegistryPackRef("my-pack", {
      skills: {
        "@acme/skills/skill-a": "1.0.0",
        "@acme/skills/skill-b": "2.0.0",
      },
    });
    const result = Effect.runSync(
      expandPackInstallRefs({
        pack: ref,
        supportedDependencyTypes: ["skill", "command", "mcp-server"],
      }),
    );

    expect(result).toHaveLength(3);
    expect(result[1]!.type).toBe("skill");
    if (result[1]!.type === "skill") {
      expect(result[1]!.skill.name).toBe("skill-a");
    }
    if (result[2]!.type === "skill") {
      expect(result[2]!.skill.name).toBe("skill-b");
    }
  });

  it("produces command and mcp-server dependency refs", () => {
    const ref = makeRegistryPackRef("my-pack", {
      commands: { "@acme/commands/my-cmd": "1.0.0" },
      mcpServers: { "@acme/mcp-servers/my-server": "1.0.0" },
    });
    const result = Effect.runSync(
      expandPackInstallRefs({
        pack: ref,
        supportedDependencyTypes: ["skill", "command", "mcp-server"],
      }),
    );

    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe("pack");
    expect(result[1]!.type).toBe("command");
    expect(result[2]!.type).toBe("mcp-server");
  });

  it("orders: pack, skills, commands, mcp-servers", () => {
    const ref = makeRegistryPackRef("my-pack", {
      skills: { "@acme/skills/s1": "1.0.0" },
      commands: { "@acme/commands/c1": "1.0.0" },
      mcpServers: { "@acme/mcp-servers/m1": "1.0.0" },
    });
    const result = Effect.runSync(
      expandPackInstallRefs({
        pack: ref,
        supportedDependencyTypes: ["skill", "command", "mcp-server"],
      }),
    );

    expect(result).toHaveLength(4);
    expect(result[0]!.type).toBe("pack");
    expect(result[1]!.type).toBe("skill");
    expect(result[2]!.type).toBe("command");
    expect(result[3]!.type).toBe("mcp-server");
  });

  it("uses pack's registry source for dependency refs", () => {
    const ref = makeRegistryPackRef("my-pack", {
      skills: { "@acme/skills/s1": "1.0.0" },
    });
    const result = Effect.runSync(
      expandPackInstallRefs({
        pack: ref,
        supportedDependencyTypes: ["skill", "command", "mcp-server"],
      }),
    );

    const skillRef = result[1]!;
    expect(skillRef.source.type).toBe("registry");
  });

  it("sets empty integrity on dependency refs", () => {
    const ref = makeRegistryPackRef("my-pack", {
      skills: { "@acme/skills/s1": "1.0.0" },
    });
    const result = Effect.runSync(
      expandPackInstallRefs({
        pack: ref,
        supportedDependencyTypes: ["skill", "command", "mcp-server"],
      }),
    );

    const skillRef = result[1]!;
    if (skillRef.refType === "registry") {
      expect(skillRef.integrity).toBe("");
    }
  });

  it("filters by supportedDependencyTypes", () => {
    const ref = makeRegistryPackRef("my-pack", {
      skills: { "@acme/skills/s1": "1.0.0" },
      commands: { "@acme/commands/c1": "1.0.0" },
      mcpServers: { "@acme/mcp-servers/m1": "1.0.0" },
    });
    const result = Effect.runSync(
      expandPackInstallRefs({
        pack: ref,
        supportedDependencyTypes: ["skill"],
      }),
    );

    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe("pack");
    expect(result[1]!.type).toBe("skill");
  });

  it("extracts name from FQN for skill dependencies", () => {
    const ref = makeRegistryPackRef("my-pack", {
      skills: { "@acme/skills/code-review": "1.0.0" },
    });
    const result = Effect.runSync(
      expandPackInstallRefs({
        pack: ref,
        supportedDependencyTypes: ["skill"],
      }),
    );

    if (result[1]!.type === "skill") {
      expect(result[1]!.skill.name).toBe("code-review");
    }
  });

  it("works with builtin pack refs", () => {
    const ref = makeBuiltinPackRef("cli", {
      namespace: "@axm",
      skills: { "@axm/skills/manage-skills": "0.0.1" },
    });
    const result = Effect.runSync(
      expandPackInstallRefs({
        pack: ref,
        supportedDependencyTypes: ["skill"],
      }),
    );

    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe("pack");
    expect(result[1]!.type).toBe("skill");
  });
});

// -----------------------------------------------------------------------------
// expandPackUninstallTargets
// -----------------------------------------------------------------------------

describe("expandPackUninstallTargets", () => {
  it("returns only pack target when pack has no dependencies in lockfile", () => {
    const lockfile: Lockfile = {
      ...emptyLockfile,
      packs: {
        "my-pack": {
          type: "registry",
          namespace: "@acme",
          name: "my-pack",
          resolvedVersion: "1.0.0",
          integrity: "sha512-abc",
          sourceName: "default",
          installedAt: new Date(),
          updatedAt: new Date(),
          resolvedSkills: {},
          resolvedCommands: {},
          resolvedMcpServers: {},
        },
      },
    };

    const result = Effect.runSync(
      expandPackUninstallTargets({
        pack: makePackTarget("my-pack"),
        supportedDependencyTypes: ["skill", "command", "mcp-server"],
        lockfile,
        settings: { skills: {}, commands: {}, mcpServers: {} },
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("pack");
  });

  it("returns pack target first then orphaned dependency targets", () => {
    const lockfile: Lockfile = {
      ...emptyLockfile,
      packs: {
        "my-pack": {
          type: "registry",
          namespace: "@acme",
          name: "my-pack",
          resolvedVersion: "1.0.0",
          integrity: "sha512-abc",
          sourceName: "default",
          installedAt: new Date(),
          updatedAt: new Date(),
          resolvedSkills: { "@acme/skills/s1": "1.0.0" },
          resolvedCommands: {},
          resolvedMcpServers: {},
        },
      },
    };

    const result = Effect.runSync(
      expandPackUninstallTargets({
        pack: makePackTarget("my-pack"),
        supportedDependencyTypes: ["skill", "command", "mcp-server"],
        lockfile,
        settings: { skills: {}, commands: {}, mcpServers: {} },
      }),
    );

    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe("pack");
    expect(result[1]!.type).toBe("skill");
  });

  it("excludes dependencies still referenced by another installed pack", () => {
    const lockfile: Lockfile = {
      ...emptyLockfile,
      packs: {
        "my-pack": {
          type: "registry",
          namespace: "@acme",
          name: "my-pack",
          resolvedVersion: "1.0.0",
          integrity: "sha512-abc",
          sourceName: "default",
          installedAt: new Date(),
          updatedAt: new Date(),
          resolvedSkills: { "@acme/skills/shared-skill": "1.0.0" },
          resolvedCommands: {},
          resolvedMcpServers: {},
        },
        "other-pack": {
          type: "registry",
          namespace: "@acme",
          name: "other-pack",
          resolvedVersion: "2.0.0",
          integrity: "sha512-def",
          sourceName: "default",
          installedAt: new Date(),
          updatedAt: new Date(),
          resolvedSkills: { "@acme/skills/shared-skill": "1.0.0" },
          resolvedCommands: {},
          resolvedMcpServers: {},
        },
      },
    };

    const result = Effect.runSync(
      expandPackUninstallTargets({
        pack: makePackTarget("my-pack"),
        supportedDependencyTypes: ["skill", "command", "mcp-server"],
        lockfile,
        settings: { skills: {}, commands: {}, mcpServers: {} },
      }),
    );

    // Only the pack target — shared-skill is retained by other-pack
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("pack");
  });

  it("excludes dependencies that are directly configured in settings", () => {
    const lockfile: Lockfile = {
      ...emptyLockfile,
      packs: {
        "my-pack": {
          type: "registry",
          namespace: "@acme",
          name: "my-pack",
          resolvedVersion: "1.0.0",
          integrity: "sha512-abc",
          sourceName: "default",
          installedAt: new Date(),
          updatedAt: new Date(),
          resolvedSkills: { "@acme/skills/user-skill": "1.0.0" },
          resolvedCommands: {},
          resolvedMcpServers: {},
        },
      },
    };

    const result = Effect.runSync(
      expandPackUninstallTargets({
        pack: makePackTarget("my-pack"),
        supportedDependencyTypes: ["skill", "command", "mcp-server"],
        lockfile,
        settings: {
          skills: { "user-skill": "@acme/skills/user-skill@^1.0.0" },
          commands: {},
          mcpServers: {},
        },
      }),
    );

    // Only the pack target — user-skill is directly configured
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("pack");
  });

  it("includes all orphaned dependency types", () => {
    const lockfile: Lockfile = {
      ...emptyLockfile,
      packs: {
        "my-pack": {
          type: "registry",
          namespace: "@acme",
          name: "my-pack",
          resolvedVersion: "1.0.0",
          integrity: "sha512-abc",
          sourceName: "default",
          installedAt: new Date(),
          updatedAt: new Date(),
          resolvedSkills: { "@acme/skills/s1": "1.0.0" },
          resolvedCommands: { "@acme/commands/c1": "1.0.0" },
          resolvedMcpServers: { "@acme/mcp-servers/m1": "1.0.0" },
        },
      },
    };

    const result = Effect.runSync(
      expandPackUninstallTargets({
        pack: makePackTarget("my-pack"),
        supportedDependencyTypes: ["skill", "command", "mcp-server"],
        lockfile,
        settings: { skills: {}, commands: {}, mcpServers: {} },
      }),
    );

    expect(result).toHaveLength(4);
    expect(result[0]!.type).toBe("pack");
    expect(result[1]!.type).toBe("skill");
    expect(result[2]!.type).toBe("command");
    expect(result[3]!.type).toBe("mcp-server");
  });

  it("returns only pack target when pack is not in lockfile", () => {
    const result = Effect.runSync(
      expandPackUninstallTargets({
        pack: makePackTarget("my-pack"),
        supportedDependencyTypes: ["skill", "command", "mcp-server"],
        lockfile: emptyLockfile,
        settings: { skills: {}, commands: {}, mcpServers: {} },
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("pack");
  });

  it("filters by supportedDependencyTypes", () => {
    const lockfile: Lockfile = {
      ...emptyLockfile,
      packs: {
        "my-pack": {
          type: "registry",
          namespace: "@acme",
          name: "my-pack",
          resolvedVersion: "1.0.0",
          integrity: "sha512-abc",
          sourceName: "default",
          installedAt: new Date(),
          updatedAt: new Date(),
          resolvedSkills: { "@acme/skills/s1": "1.0.0" },
          resolvedCommands: { "@acme/commands/c1": "1.0.0" },
          resolvedMcpServers: { "@acme/mcp-servers/m1": "1.0.0" },
        },
      },
    };

    const result = Effect.runSync(
      expandPackUninstallTargets({
        pack: makePackTarget("my-pack"),
        supportedDependencyTypes: ["skill"],
        lockfile,
        settings: { skills: {}, commands: {}, mcpServers: {} },
      }),
    );

    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe("pack");
    expect(result[1]!.type).toBe("skill");
  });
});

// -----------------------------------------------------------------------------
// resolveSkillUninstallTargetsFromLockfile
// -----------------------------------------------------------------------------

describe("resolveSkillUninstallTargetsFromLockfile", () => {
  it("resolves skill names to SkillExtensionTarget", () => {
    const lockfile: Lockfile = {
      lockfileVersion: 1,
      skills: {
        "my-skill": {
          type: "local",
          path: "/tmp/my-skill",
          agents: ["claude-code"],
          installedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    };

    const result = Effect.runSync(
      resolveSkillUninstallTargetsFromLockfile([{ skillName: "my-skill" }], lockfile),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: "skill", name: "my-skill" });
  });

  it("resolves multiple skill names", () => {
    const lockfile: Lockfile = {
      lockfileVersion: 1,
      skills: {
        "skill-a": {
          type: "local",
          path: "/tmp/a",
          agents: [],
          installedAt: new Date(),
          updatedAt: new Date(),
        },
        "skill-b": {
          type: "builtin",
          agents: [],
          installedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    };

    const result = Effect.runSync(
      resolveSkillUninstallTargetsFromLockfile(
        [{ skillName: "skill-a" }, { skillName: "skill-b" }],
        lockfile,
      ),
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: "skill", name: "skill-a" });
    expect(result[1]).toEqual({ type: "skill", name: "skill-b" });
  });

  it("fails with AppError when skill name not found in lockfile", () => {
    const lockfile: Lockfile = {
      lockfileVersion: 1,
      skills: {},
    };

    const result = Effect.runSync(
      resolveSkillUninstallTargetsFromLockfile([{ skillName: "nonexistent" }], lockfile).pipe(
        Effect.result,
      ),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("SKILL_NOT_FOUND_IN_LOCKFILE");
    }
  });

  it("fails on first missing skill", () => {
    const lockfile: Lockfile = {
      lockfileVersion: 1,
      skills: {
        exists: {
          type: "local",
          path: "/tmp/exists",
          agents: [],
          installedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    };

    const result = Effect.runSync(
      resolveSkillUninstallTargetsFromLockfile(
        [{ skillName: "exists" }, { skillName: "missing" }],
        lockfile,
      ).pipe(Effect.result),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("SKILL_NOT_FOUND_IN_LOCKFILE");
    }
  });
});
