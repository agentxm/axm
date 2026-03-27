/**
 * Unit tests for buildUpdatePlan.
 *
 * Tests the update-specific plan builder that compares re-resolved source
 * metadata against lockfile entries to determine which skills need updating.
 */

import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import type { Lockfile, SkillLockEntry } from "@axm.sh/core/unstable/lockfile";
import type { InstallSkillOperation } from "@axm.sh/core/unstable/skills";
import type { UninstallSkillOperation } from "@axm.sh/core/unstable/skills";
import type { SkillExtensionRef } from "@axm.sh/core/unstable/sources";
import type { LegacyPlan, LegacyPlannedStep } from "@axm.sh/core/unstable/workspace";
import { buildUpdatePlan } from "./plan.js";

const isPlannedStep = <T>(step: { readonly _tag: string }): step is LegacyPlannedStep<T> =>
  step._tag === "PlannedJobStep";

const planned = <T>(step: { readonly _tag: string }): LegacyPlannedStep<T> => {
  if (!isPlannedStep<T>(step)) {
    throw new Error("Expected PlannedJobStep");
  }

  return step;
};

type UpdateOperation = InstallSkillOperation | UninstallSkillOperation;
type UpdatePlan = LegacyPlan<UpdateOperation>;
type UpdateStep = LegacyPlannedStep<UpdateOperation>;

const getItem = <T>(items: ReadonlyArray<T>, index: number, label: string): T => {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Missing ${label} at index ${index}`);
  }
  return item;
};

const getJob = (plan: UpdatePlan) => getItem(plan.jobs, 0, "job");

const getSteps = (plan: UpdatePlan) => getJob(plan).steps;

const getStep = (steps: ReadonlyArray<UpdateStep>, index: number) => getItem(steps, index, "step");

const getFirstStep = (plan: UpdatePlan) => getStep(getSteps(plan), 0);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const skillBase = (name: string) => ({
  type: "skill" as const,
  skill: { name, description: Option.some(`${name} skill`), metadata: Option.none() },
});

const makeOp = (
  name: string,
  overrides?: Partial<{
    sourceType:
      | "github"
      | "gitlab"
      | "bitbucket"
      | "azurerepos"
      | "git"
      | "registry"
      | "local"
      | "builtin";
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
        refType: "git-hosted",
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
        refType: "git-hosted",
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
        refType: "git-hosted",
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
        refType: "git-hosted",
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
        refType: "git-hosted",
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
        refType: "registry",
        source: {
          type: "registry",
          location: new URL("http://localhost:3000"),
          profile: Option.none(),
        },
        profile: "@axm",
        name,
        version: overrides?.version ?? "0.0.0",
        integrity: "sha512-AAAA==",
      };
      break;
    case "builtin":
      ref = {
        ...skillBase(name),
        refType: "builtin",
        source: { type: "builtin" },
      };
      break;
    case "local":
    default:
      ref = {
        ...skillBase(name),
        refType: "local",
        source: { type: "local", path: "/fake" },
        location: `file:///fake/${name}`,
      };
      break;
  }

  return {
    name: "install-skill",
    args: {
      ref,
      force: overrides?.force ?? false,
      versionConstraint: Option.none(),
      skipSettings: Option.none(),
      sourceName: Option.none(),
    },
  };
};

const emptyLockfile: Lockfile = {
  lockfileVersion: 1,
  skills: {},
};

const makeCommonLockFields = (overrides?: Partial<SkillLockEntry>) => ({
  agents: overrides?.agents ?? [],
  installedAt: overrides?.installedAt ?? new Date(),
  updatedAt: overrides?.updatedAt ?? new Date(),
  ...(overrides?.gitTreeHash !== undefined && { gitTreeHash: overrides.gitTreeHash }),
  ...(overrides?.retainedByPack !== undefined && { retainedByPack: overrides.retainedByPack }),
});

const makeLockEntry = (overrides?: Partial<SkillLockEntry>): SkillLockEntry => {
  switch (overrides?.type ?? "local") {
    case "github": {
      const githubOverrides = overrides?.type === "github" ? overrides : undefined;
      return {
        type: "github",
        owner: githubOverrides?.owner ?? "o",
        repo: githubOverrides?.repo ?? "r",
        ...makeCommonLockFields(githubOverrides),
        ...(githubOverrides?.ref !== undefined && { ref: githubOverrides.ref }),
        ...(githubOverrides?.path !== undefined && { path: githubOverrides.path }),
      };
    }
    case "gitlab": {
      const gitlabOverrides = overrides?.type === "gitlab" ? overrides : undefined;
      return {
        type: "gitlab",
        owner: gitlabOverrides?.owner ?? "o",
        repo: gitlabOverrides?.repo ?? "r",
        ...makeCommonLockFields(gitlabOverrides),
        ...(gitlabOverrides?.ref !== undefined && { ref: gitlabOverrides.ref }),
        ...(gitlabOverrides?.path !== undefined && { path: gitlabOverrides.path }),
      };
    }
    case "bitbucket": {
      const bitbucketOverrides = overrides?.type === "bitbucket" ? overrides : undefined;
      return {
        type: "bitbucket",
        owner: bitbucketOverrides?.owner ?? "o",
        repo: bitbucketOverrides?.repo ?? "r",
        ...makeCommonLockFields(bitbucketOverrides),
        ...(bitbucketOverrides?.ref !== undefined && { ref: bitbucketOverrides.ref }),
        ...(bitbucketOverrides?.path !== undefined && { path: bitbucketOverrides.path }),
      };
    }
    case "azurerepos": {
      const azureOverrides = overrides?.type === "azurerepos" ? overrides : undefined;
      return {
        type: "azurerepos",
        organization: azureOverrides?.organization ?? "org",
        project: azureOverrides?.project ?? "proj",
        repo: azureOverrides?.repo ?? "r",
        ...makeCommonLockFields(azureOverrides),
        ...(azureOverrides?.ref !== undefined && { ref: azureOverrides.ref }),
        ...(azureOverrides?.path !== undefined && { path: azureOverrides.path }),
      };
    }
    case "git": {
      const gitOverrides = overrides?.type === "git" ? overrides : undefined;
      return {
        type: "git",
        url: gitOverrides?.url ?? "git@example.com:repo.git",
        ...makeCommonLockFields(gitOverrides),
        ...(gitOverrides?.ref !== undefined && { ref: gitOverrides.ref }),
        ...(gitOverrides?.path !== undefined && { path: gitOverrides.path }),
      };
    }
    case "registry": {
      const registryOverrides = overrides?.type === "registry" ? overrides : undefined;
      return {
        type: "registry",
        profile: registryOverrides?.profile ?? "@axm",
        name: registryOverrides?.name ?? "skill",
        resolvedVersion: registryOverrides?.resolvedVersion ?? "0.0.0",
        integrity: registryOverrides?.integrity ?? "sha512-AAAA==",
        sourceName: registryOverrides?.sourceName ?? "default",
        ...makeCommonLockFields(registryOverrides),
      };
    }
    case "builtin": {
      const builtinOverrides = overrides?.type === "builtin" ? overrides : undefined;
      return {
        type: "builtin",
        ...makeCommonLockFields(builtinOverrides),
      };
    }
    case "local":
    default: {
      const localOverrides = overrides?.type === "local" ? overrides : undefined;
      return {
        type: "local",
        path: localOverrides?.path ?? "/installed",
        ...makeCommonLockFields(localOverrides),
      };
    }
  }
};

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

  it("marks git source as ready when gitTreeHash changed", () => {
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

    expect(planned(getFirstStep(plan)).readiness).toEqual({
      status: "ready",
      message: Option.none(),
    });
  });

  it("marks git source as skip when gitTreeHash unchanged", () => {
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

    expect(planned(getFirstStep(plan)).readiness).toEqual({
      status: "skip",
      message: "already up to date",
    });
  });

  it("marks git source as ready when lockfile gitTreeHash is missing", () => {
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

    expect(planned(getFirstStep(plan)).readiness).toEqual({
      status: "ready",
      message: Option.none(),
    });
  });

  it("marks git source as ready when operation gitTreeSha is missing", () => {
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

    expect(planned(getFirstStep(plan)).readiness).toEqual({
      status: "ready",
      message: Option.none(),
    });
  });

  it("marks git source as ready when both gitTreeHash and gitTreeSha are missing", () => {
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

    expect(planned(getFirstStep(plan)).readiness).toEqual({
      status: "ready",
      message: Option.none(),
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

    expect(planned(getFirstStep(plan)).readiness.status).toBe("ready");
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

    expect(planned(getFirstStep(plan)).readiness.status).toBe("skip");
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

    expect(planned(getFirstStep(plan)).readiness.status).toBe("ready");
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

    expect(planned(getFirstStep(plan)).readiness.status).toBe("ready");
  });

  // ---------------------------------------------------------------------------
  // Registry sources
  // ---------------------------------------------------------------------------

  it("marks registry source as ready when resolvedVersion changed", () => {
    const op = makeOp("commit", {
      sourceType: "registry",
      version: "2.0.0",
    });
    const lf = lockfileWith({
      commit: makeLockEntry({
        type: "registry",
        profile: "@axm",
        name: "commit",
        resolvedVersion: "1.0.0",
        integrity: "sha512-AAAA==",
        sourceName: "default",
      }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(planned(getFirstStep(plan)).readiness).toEqual({
      status: "ready",
      message: Option.none(),
    });
  });

  it("marks registry source as skip when resolvedVersion unchanged", () => {
    const op = makeOp("commit", {
      sourceType: "registry",
      version: "1.0.0",
    });
    const lf = lockfileWith({
      commit: makeLockEntry({
        type: "registry",
        profile: "@axm",
        name: "commit",
        resolvedVersion: "1.0.0",
        integrity: "sha512-AAAA==",
        sourceName: "default",
      }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(planned(getFirstStep(plan)).readiness).toEqual({
      status: "skip",
      message: "already up to date",
    });
  });

  // ---------------------------------------------------------------------------
  // Builtin sources
  // ---------------------------------------------------------------------------

  it("marks builtin source as skip (updated separately via pack flow)", () => {
    const op = makeOp("commit", { sourceType: "builtin" });
    const lf = lockfileWith({
      commit: makeLockEntry({ type: "builtin" }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(planned(getFirstStep(plan)).readiness).toEqual({
      status: "skip",
      message: "already up to date",
    });
  });

  it("marks builtin source as ready when force is true", () => {
    const op = makeOp("commit", { sourceType: "builtin", force: true });
    const lf = lockfileWith({
      commit: makeLockEntry({ type: "builtin" }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(planned(getFirstStep(plan)).readiness).toEqual({
      status: "ready",
      message: Option.none(),
    });
  });

  // ---------------------------------------------------------------------------
  // Local sources
  // ---------------------------------------------------------------------------

  it("always marks local source as ready (no version tracking)", () => {
    const op = makeOp("commit", { sourceType: "local" });
    const lf = lockfileWith({
      commit: makeLockEntry({ type: "local", path: "/installed" }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(planned(getFirstStep(plan)).readiness).toEqual({
      status: "ready",
      message: Option.none(),
    });
  });

  // ---------------------------------------------------------------------------
  // Force flag
  // ---------------------------------------------------------------------------

  it("marks as ready when force is true regardless of version match", () => {
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

    expect(planned(getFirstStep(plan)).readiness).toEqual({
      status: "ready",
      message: Option.none(),
    });
  });

  it("marks as ready when force is true for registry with same version", () => {
    const op = makeOp("commit", {
      sourceType: "registry",
      force: true,
      version: "1.0.0",
    });
    const lf = lockfileWith({
      commit: makeLockEntry({
        type: "registry",
        profile: "@axm",
        name: "commit",
        resolvedVersion: "1.0.0",
        integrity: "sha512-AAAA==",
        sourceName: "default",
      }),
    });

    const plan = buildUpdatePlan([op], lf, "Update", Option.none());

    expect(planned(getFirstStep(plan)).readiness.status).toBe("ready");
  });

  // ---------------------------------------------------------------------------
  // Skill not in lockfile (new skill during update)
  // ---------------------------------------------------------------------------

  it("marks as ready when skill is not in lockfile", () => {
    const op = makeOp("new-skill", { sourceType: "github", gitTreeSha: Option.some("sha") });

    const plan = buildUpdatePlan([op], emptyLockfile, "Update", Option.none());

    expect(planned(getFirstStep(plan)).readiness).toEqual({
      status: "ready",
      message: Option.none(),
    });
  });

  // ---------------------------------------------------------------------------
  // Plan structure
  // ---------------------------------------------------------------------------

  it("produces empty steps from empty operations", () => {
    const plan = buildUpdatePlan([], emptyLockfile, "Update", Option.none());

    expect(plan.jobs).toHaveLength(1);
    expect(getSteps(plan)).toHaveLength(0);
  });

  it("derives label from skill name", () => {
    const plan = buildUpdatePlan(
      [makeOp("commit"), makeOp("review-pr")],
      emptyLockfile,
      "Update",
      Option.none(),
    );

    const steps = getSteps(plan);
    expect(getStep(steps, 0).label).toBe("commit");
    expect(getStep(steps, 1).label).toBe("review-pr");
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
    expect(getJob(plan).concurrency).toBe("unbounded");
  });

  it("handles mixed ready and skip readiness", () => {
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

    const steps = getSteps(plan);
    expect(planned(getStep(steps, 0)).readiness.status).toBe("ready");
    expect(getStep(steps, 0).label).toBe("changed");
    expect(planned(getStep(steps, 1)).readiness.status).toBe("skip");
    expect(getStep(steps, 1).label).toBe("unchanged");
    expect(planned(getStep(steps, 2)).readiness.status).toBe("ready");
    expect(getStep(steps, 2).label).toBe("local-skill");
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

    const steps = getSteps(plan);
    expect(steps).toHaveLength(2);
    expect(getStep(steps, 0).operation.name).toBe("install-skill");
    expect(getStep(steps, 1).operation.name).toBe("uninstall-skill");
  });

  it("gives UninstallSkillOperation steps a rename cleanup label", () => {
    const uninstallOp: UninstallSkillOperation = {
      name: "uninstall-skill",
      args: { skillName: "old-name", agents: [] },
    };

    const plan = buildUpdatePlan([uninstallOp], emptyLockfile, "Update", Option.none());

    const step = getFirstStep(plan);
    expect(step.label).toContain("old-name");
    expect(step.label).toContain("renamed");
    expect(planned(step).readiness.status).toBe("ready");
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

    const steps = getSteps(plan);
    expect(steps).toHaveLength(2);
    expect(getStep(steps, 0).label).toBe("new-skill");
    expect(planned(getStep(steps, 0)).readiness.status).toBe("ready");
    expect(getStep(steps, 1).label).toContain("old-skill");
    expect(getStep(steps, 1).label).toContain("renamed");
  });
});
