/**
 * Unit tests for buildUpdatePlan.
 *
 * Tests the update-specific plan builder that compares re-resolved source
 * metadata against lockfile entries to determine which skills need updating.
 */

import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import type { Lockfile, SkillLockEntry } from "../../../lockfile/schema.js";
import type { InstallSkillOperation, UninstallSkillOperation } from "../operations.js";
import type { SkillExtensionRef } from "../../../sources/types.js";
import { buildUpdatePlan } from "./build-plan.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const skillBase = (name: string) => ({
  type: "skill" as const,
  skill: { name, description: `${name} skill`, metadata: Option.none() },
});

const makeOp = (
  name: string,
  overrides?: Partial<{
    sourceType: "github" | "gitlab" | "bitbucket" | "azurerepos" | "git" | "registry" | "local";
    force: boolean;
    version: string;
    gitTreeSha: Option.Option<string>;
  }>,
): InstallSkillOperation => {
  const sourceType = overrides?.sourceType ?? "local";
  let ref: SkillExtensionRef;

  switch (sourceType) {
    case "github":
      ref = {
        ...skillBase(name),
        source: {
          type: "github",
          url: new URL("https://github.com"),
          owner: "o",
          repo: "r",
          ref: Option.none(),
          subPath: Option.none(),
        },
        location: `file:///fake/${name}`,
        gitTreeSha: overrides?.gitTreeSha ?? Option.none(),
      };
      break;
    case "gitlab":
      ref = {
        ...skillBase(name),
        source: {
          type: "gitlab",
          url: new URL("https://gitlab.com"),
          owner: "o",
          repo: "r",
          ref: Option.none(),
          subPath: Option.none(),
        },
        location: `file:///fake/${name}`,
        gitTreeSha: overrides?.gitTreeSha ?? Option.none(),
      };
      break;
    case "bitbucket":
      ref = {
        ...skillBase(name),
        source: {
          type: "bitbucket",
          url: new URL("https://bitbucket.org"),
          owner: "o",
          repo: "r",
          ref: Option.none(),
          subPath: Option.none(),
        },
        location: `file:///fake/${name}`,
        gitTreeSha: overrides?.gitTreeSha ?? Option.none(),
      };
      break;
    case "azurerepos":
      ref = {
        ...skillBase(name),
        source: {
          type: "azurerepos",
          url: new URL("https://dev.azure.com"),
          organization: "org",
          project: "proj",
          repo: "r",
          ref: Option.none(),
          subPath: Option.none(),
        },
        location: `file:///fake/${name}`,
        gitTreeSha: overrides?.gitTreeSha ?? Option.none(),
      };
      break;
    case "git":
      ref = {
        ...skillBase(name),
        source: {
          type: "git",
          url: new URL("https://example.com/repo.git"),
          ref: Option.none(),
        },
        location: `file:///fake/${name}`,
        gitTreeSha: overrides?.gitTreeSha ?? Option.none(),
      };
      break;
    case "registry":
      ref = {
        ...skillBase(name),
        source: {
          type: "registry",
          scope: "@axm",
          extensionTypes: ["skills"],
          location: new URL("http://localhost:3000"),
        },
        version: overrides?.version ?? "0.0.0",
        checksum: "abc",
      };
      break;
    case "local":
    default:
      ref = {
        ...skillBase(name),
        source: { type: "local", path: "/fake" },
        location: `file:///fake/${name}`,
      };
      break;
  }

  return {
    name: "install-skill",
    args: {
      ref,
      agents: [],
      force: overrides?.force ?? false,
    },
  };
};

const emptyLockfile: Lockfile = {
  lockfileVersion: 1,
  skills: {},
};

// Assertion needed: test helper builds union members from partial overrides
const makeLockEntry = (overrides?: Partial<SkillLockEntry>): SkillLockEntry =>
  ({
    type: "local" as const,
    path: "/installed",
    agents: [],
    installedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as unknown as SkillLockEntry;

const lockfileWith = (entries: Record<string, SkillLockEntry>): Lockfile => ({
  lockfileVersion: 1,
  skills: entries,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildUpdatePlan", () => {
  // ---------------------------------------------------------------------------
  // Git hosting sources (github, gitlab, bitbucket, azurerepos, git)
  // ---------------------------------------------------------------------------

  it("marks git source as success when gitTreeHash changed", () => {
    const op = makeOp("commit", {
      sourceType: "github",
      gitTreeSha: Option.some("new-sha"),
    });
    const lf = lockfileWith({
      commit: makeLockEntry({
        type: "github",
        owner: "o",
        repo: "r",
        gitTreeHash: "old-sha",
      }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "success",
      message: "Updated commit",
    });
  });

  it("marks git source as no-op when gitTreeHash unchanged", () => {
    const op = makeOp("commit", {
      sourceType: "github",
      gitTreeSha: Option.some("same-sha"),
    });
    const lf = lockfileWith({
      commit: makeLockEntry({
        type: "github",
        owner: "o",
        repo: "r",
        gitTreeHash: "same-sha",
      }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "no-op",
      message: "already up to date",
    });
  });

  it("marks git source as success when lockfile gitTreeHash is missing", () => {
    const op = makeOp("commit", {
      sourceType: "github",
      gitTreeSha: Option.some("new-sha"),
    });
    const lf = lockfileWith({
      commit: makeLockEntry({
        type: "github",
        owner: "o",
        repo: "r",
        // no gitTreeHash
      }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "success",
      message: "Updated commit",
    });
  });

  it("marks git source as success when operation gitTreeSha is missing", () => {
    const op = makeOp("commit", {
      sourceType: "github",
      gitTreeSha: Option.none(),
    });
    const lf = lockfileWith({
      commit: makeLockEntry({
        type: "github",
        owner: "o",
        repo: "r",
        gitTreeHash: "old-sha",
      }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "success",
      message: "Updated commit",
    });
  });

  it("marks git source as success when both gitTreeHash and gitTreeSha are missing", () => {
    const op = makeOp("commit", {
      sourceType: "github",
      gitTreeSha: Option.none(),
    });
    const lf = lockfileWith({
      commit: makeLockEntry({
        type: "github",
        owner: "o",
        repo: "r",
        // no gitTreeHash
      }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "success",
      message: "Updated commit",
    });
  });

  it("handles gitlab source with git hash comparison", () => {
    const op = makeOp("lint", {
      sourceType: "gitlab",
      gitTreeSha: Option.some("new-sha"),
    });
    const lf = lockfileWith({
      lint: makeLockEntry({
        type: "gitlab",
        owner: "o",
        repo: "r",
        gitTreeHash: "old-sha",
      }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult.result).toBe("success");
  });

  it("handles bitbucket source with git hash comparison", () => {
    const op = makeOp("lint", {
      sourceType: "bitbucket",
      gitTreeSha: Option.some("same-sha"),
    });
    const lf = lockfileWith({
      lint: makeLockEntry({
        type: "bitbucket",
        owner: "o",
        repo: "r",
        gitTreeHash: "same-sha",
      }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult.result).toBe("no-op");
  });

  it("handles azurerepos source with git hash comparison", () => {
    const op = makeOp("lint", {
      sourceType: "azurerepos",
      gitTreeSha: Option.some("new-sha"),
    });
    const lf = lockfileWith({
      lint: makeLockEntry({
        type: "azurerepos",
        organization: "org",
        project: "proj",
        repo: "r",
        gitTreeHash: "old-sha",
      }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult.result).toBe("success");
  });

  it("handles generic git source with git hash comparison", () => {
    const op = makeOp("lint", {
      sourceType: "git",
      gitTreeSha: Option.some("new-sha"),
    });
    const lf = lockfileWith({
      lint: makeLockEntry({
        type: "git",
        url: "git@example.com:repo.git",
        gitTreeHash: "old-sha",
      }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult.result).toBe("success");
  });

  // ---------------------------------------------------------------------------
  // Registry sources
  // ---------------------------------------------------------------------------

  it("marks registry source as success when resolvedVersion changed", () => {
    const op = makeOp("commit", {
      sourceType: "registry",
      version: "2.0.0",
    });
    const lf = lockfileWith({
      commit: makeLockEntry({
        type: "registry",
        scope: "@axm",
        name: "commit",
        resolvedVersion: "1.0.0",
        checksum: "abc",
        sourceName: "default",
      }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "success",
      message: "Updated commit",
    });
  });

  it("marks registry source as no-op when resolvedVersion unchanged", () => {
    const op = makeOp("commit", {
      sourceType: "registry",
      version: "1.0.0",
    });
    const lf = lockfileWith({
      commit: makeLockEntry({
        type: "registry",
        scope: "@axm",
        name: "commit",
        resolvedVersion: "1.0.0",
        checksum: "abc",
        sourceName: "default",
      }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "no-op",
      message: "already up to date",
    });
  });

  // ---------------------------------------------------------------------------
  // Builtin sources
  // ---------------------------------------------------------------------------

  it("marks builtin source as no-op (updated separately via pack flow)", () => {
    const op = makeOp("commit");
    const lf = lockfileWith({
      commit: makeLockEntry({ type: "builtin" }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "no-op",
      message: "already up to date",
    });
  });

  it("marks builtin source as success when force is true", () => {
    const op = makeOp("commit", { force: true });
    const lf = lockfileWith({
      commit: makeLockEntry({ type: "builtin" }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "success",
      message: "Updated commit",
    });
  });

  // ---------------------------------------------------------------------------
  // Local sources
  // ---------------------------------------------------------------------------

  it("always marks local source as success (no version tracking)", () => {
    const op = makeOp("commit", { sourceType: "local" });
    const lf = lockfileWith({
      commit: makeLockEntry({ type: "local", path: "/installed" }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "success",
      message: "Updated commit",
    });
  });

  // ---------------------------------------------------------------------------
  // Force flag
  // ---------------------------------------------------------------------------

  it("marks as success when force is true regardless of version match", () => {
    const op = makeOp("commit", {
      sourceType: "github",
      force: true,
      gitTreeSha: Option.some("same-sha"),
    });
    const lf = lockfileWith({
      commit: makeLockEntry({
        type: "github",
        owner: "o",
        repo: "r",
        gitTreeHash: "same-sha",
      }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "success",
      message: "Updated commit",
    });
  });

  it("marks as success when force is true for registry with same version", () => {
    const op = makeOp("commit", {
      sourceType: "registry",
      force: true,
      version: "1.0.0",
    });
    const lf = lockfileWith({
      commit: makeLockEntry({
        type: "registry",
        scope: "@axm",
        name: "commit",
        resolvedVersion: "1.0.0",
        checksum: "abc",
        sourceName: "default",
      }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult.result).toBe("success");
  });

  // ---------------------------------------------------------------------------
  // Skill not in lockfile (new skill during update)
  // ---------------------------------------------------------------------------

  it("marks as success when skill is not in lockfile", () => {
    const op = makeOp("new-skill", { sourceType: "github", gitTreeSha: Option.some("sha") });

    const plan = buildUpdatePlan([op], emptyLockfile, "Update", Option.none());

    expect(plan.jobs[0]!.steps[0]!.expectedResult).toEqual({
      result: "success",
      message: "Updated new-skill",
    });
  });

  // ---------------------------------------------------------------------------
  // Plan structure
  // ---------------------------------------------------------------------------

  it("produces empty steps from empty operations", () => {
    const plan = buildUpdatePlan([], emptyLockfile, "Update", Option.none());

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.steps).toHaveLength(0);
  });

  it("derives label from skill name", () => {
    const plan = buildUpdatePlan(
      [makeOp("commit"), makeOp("review-pr")],
      emptyLockfile,
      "Update",
      Option.none(),
    );

    expect(plan.jobs[0]!.steps[0]!.label).toBe("commit");
    expect(plan.jobs[0]!.steps[1]!.label).toBe("review-pr");
  });

  it("passes through caller-provided name and description", () => {
    const plan = buildUpdatePlan(
      [makeOp("commit")],
      emptyLockfile,
      "Update skill(s)",
      Option.some("Update skills from github:owner/repo"),
    );

    expect(plan.name).toBe("Update skill(s)");
    expect(plan.description).toEqual(Option.some("Update skills from github:owner/repo"));
  });

  it("creates a single job with unbounded concurrency", () => {
    const plan = buildUpdatePlan(
      [makeOp("a"), makeOp("b")],
      emptyLockfile,
      "Update",
      Option.none(),
    );

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.concurrency).toBe("unbounded");
  });

  it("handles mixed success and no-op expected results", () => {
    const ops = [
      makeOp("changed", {
        sourceType: "github",
        gitTreeSha: Option.some("new-sha"),
      }),
      makeOp("unchanged", {
        sourceType: "github",
        gitTreeSha: Option.some("same-sha"),
      }),
      makeOp("local-skill", { sourceType: "local" }),
    ];
    const lf = lockfileWith({
      changed: makeLockEntry({
        type: "github",
        owner: "o",
        repo: "r",
        gitTreeHash: "old-sha",
      }),
      unchanged: makeLockEntry({
        type: "github",
        owner: "o",
        repo: "r",
        gitTreeHash: "same-sha",
      }),
      "local-skill": makeLockEntry({ type: "local", path: "/local" }),
    });

    const plan = buildUpdatePlan(ops, lf, "Update", Option.none());

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.expectedResult.result).toBe("success");
    expect(steps[0]!.label).toBe("changed");
    expect(steps[1]!.expectedResult.result).toBe("no-op");
    expect(steps[1]!.label).toBe("unchanged");
    expect(steps[2]!.expectedResult.result).toBe("success");
    expect(steps[2]!.label).toBe("local-skill");
  });

  // ---------------------------------------------------------------------------
  // UninstallSkillOperation support (rename cleanup)
  // ---------------------------------------------------------------------------

  it("accepts UninstallSkillOperation in the operations array", () => {
    const installOp = makeOp("new-name");
    const uninstallOp: UninstallSkillOperation = {
      name: "uninstall-skill",
      args: { skillName: "old-name", agents: [] },
    };

    const plan = buildUpdatePlan([installOp, uninstallOp], emptyLockfile, "Update", Option.none());

    expect(plan.jobs[0]!.steps).toHaveLength(2);
    expect(plan.jobs[0]!.steps[0]!.operation.name).toBe("install-skill");
    expect(plan.jobs[0]!.steps[1]!.operation.name).toBe("uninstall-skill");
  });

  it("gives UninstallSkillOperation steps a rename cleanup label", () => {
    const uninstallOp: UninstallSkillOperation = {
      name: "uninstall-skill",
      args: { skillName: "old-name", agents: [] },
    };

    const plan = buildUpdatePlan([uninstallOp], emptyLockfile, "Update", Option.none());

    const step = plan.jobs[0]!.steps[0]!;
    expect(step.label).toContain("old-name");
    expect(step.label).toContain("renamed");
    expect(step.expectedResult.result).toBe("success");
  });

  it("handles mixed install and uninstall operations", () => {
    const installOp = makeOp("new-skill", {
      sourceType: "github",
      gitTreeSha: Option.some("sha-123"),
    });
    const uninstallOp: UninstallSkillOperation = {
      name: "uninstall-skill",
      args: { skillName: "old-skill", agents: [] },
    };

    const plan = buildUpdatePlan(
      [installOp, uninstallOp],
      emptyLockfile,
      "Update skill(s)",
      Option.some("Rename detected"),
    );

    expect(plan.jobs[0]!.steps).toHaveLength(2);
    expect(plan.jobs[0]!.steps[0]!.label).toBe("new-skill");
    expect(plan.jobs[0]!.steps[0]!.expectedResult.message).toContain("Updated new-skill");
    expect(plan.jobs[0]!.steps[1]!.label).toContain("old-skill");
    expect(plan.jobs[0]!.steps[1]!.label).toContain("renamed");
  });
});
