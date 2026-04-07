/**
 * Unit tests for buildUpdatePlan.
 *
 * Tests the update-specific plan builder that compares re-resolved source
 * metadata against lockfile entries to determine which skills need updating.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { normalizeHandle } from "@axm.sh/core/unstable/extensions";
import type { Lockfile, SkillLockEntry } from "@axm.sh/core/unstable/lockfile";
import type { ExactSemverVersion } from "@axm.sh/core/unstable/version-constraints";
import type { InstallSkillOperation } from "@axm.sh/core/unstable/skills";
import type { UninstallSkillOperation } from "@axm.sh/core/unstable/skills";
import type { SkillExtensionRef } from "@axm.sh/core/unstable/skills";
import type { JobStepResult, Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import { exactVersion, extensionName } from "../../../test-stubs.js";
import { buildUpdatePlan, type MakeRunClosure } from "./plan.js";

const AXM = normalizeHandle("@axm");

// A stub MakeRunClosure that returns a tagged success result
const stubRunClosure: MakeRunClosure = (op) =>
  Effect.succeed<JobStepResult>({
    result: "success",
    message: `executed ${op.name}`,
  });

/** Run a step's closure (if present) and return the result message. */
const runStep = (step: PlannedJobStep) =>
  step.readiness === "error"
    ? Effect.succeed("error")
    : step.run.pipe(Effect.map((result) => result.message));

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

const getFirstStep = (plan: Plan) => getStep(getSteps(plan), 0);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const skillBase = (name: string) => ({
  type: "skill" as const,
  skill: {
    name: extensionName(name),
    description: Option.some(`${name} skill`),
    metadata: Option.none(),
  },
});

const makeOp = (
  name: string,
  overrides?: Partial<{
    sourceType: "github" | "gitlab" | "bitbucket" | "azurerepos" | "git" | "registry" | "local";
    force: boolean;
    version: ExactSemverVersion;
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
          owner: Option.none(),
        },
        owner: AXM,
        name: extensionName(name),
        version: overrides?.version ?? exactVersion("0.0.0"),
        integrity: Option.some("sha512-AAAA=="),
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
      strictUnknownAgents: Option.none(),
      existingInstalledAt: Option.none(),
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
        owner: registryOverrides?.owner ?? AXM,
        name: registryOverrides?.name ?? extensionName("skill"),
        resolvedVersion: registryOverrides?.resolvedVersion ?? exactVersion("0.0.0"),
        integrity: registryOverrides?.integrity ?? "sha512-AAAA==",
        sourceName: registryOverrides?.sourceName ?? "default",
        ...makeCommonLockFields(registryOverrides),
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

/**
 * Determine if a step uses the stub run closure (operation was dispatched)
 * vs. a no-op success closure (skipped/already up to date).
 */
const isSkipStep = (step: PlannedJobStep) =>
  step.readiness === "error"
    ? Effect.succeed(false)
    : step.run.pipe(Effect.map((result) => result.message === "already up to date"));

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildUpdatePlan", () => {
  // ---------------------------------------------------------------------------
  // Git hosting sources (github, gitlab, bitbucket, azurerepos, git)
  // ---------------------------------------------------------------------------

  it.effect("marks git source as ready when gitTreeHash changed", () =>
    Effect.gen(function* () {
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

      const plan = buildUpdatePlan([op], lf, "Update", Option.none(), stubRunClosure);

      expect(yield* isSkipStep(getFirstStep(plan))).toBe(false);
      expect(yield* runStep(getFirstStep(plan))).toBe("executed install-skill");
    }),
  );

  it.effect("marks git source as skip when gitTreeHash unchanged", () =>
    Effect.gen(function* () {
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

      const plan = buildUpdatePlan([op], lf, "Update", Option.none(), stubRunClosure);

      expect(yield* isSkipStep(getFirstStep(plan))).toBe(true);
    }),
  );

  it.effect("marks git source as ready when lockfile gitTreeHash is missing", () =>
    Effect.gen(function* () {
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

      const plan = buildUpdatePlan([op], lf, "Update", Option.none(), stubRunClosure);

      expect(yield* isSkipStep(getFirstStep(plan))).toBe(false);
    }),
  );

  it.effect("marks git source as ready when operation gitTreeSha is missing", () =>
    Effect.gen(function* () {
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

      const plan = buildUpdatePlan([op], lf, "Update", Option.none(), stubRunClosure);

      expect(yield* isSkipStep(getFirstStep(plan))).toBe(false);
    }),
  );

  it.effect("marks git source as ready when both gitTreeHash and gitTreeSha are missing", () =>
    Effect.gen(function* () {
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

      const plan = buildUpdatePlan([op], lf, "Update", Option.none(), stubRunClosure);

      expect(yield* isSkipStep(getFirstStep(plan))).toBe(false);
    }),
  );

  it.effect("handles gitlab source with git hash comparison", () =>
    Effect.gen(function* () {
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

      const plan = buildUpdatePlan([op], lf, "Update", Option.none(), stubRunClosure);

      expect(yield* isSkipStep(getFirstStep(plan))).toBe(false);
    }),
  );

  it.effect("handles bitbucket source with git hash comparison", () =>
    Effect.gen(function* () {
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

      const plan = buildUpdatePlan([op], lf, "Update", Option.none(), stubRunClosure);

      expect(yield* isSkipStep(getFirstStep(plan))).toBe(true);
    }),
  );

  it.effect("handles azurerepos source with git hash comparison", () =>
    Effect.gen(function* () {
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

      const plan = buildUpdatePlan([op], lf, "Update", Option.none(), stubRunClosure);

      expect(yield* isSkipStep(getFirstStep(plan))).toBe(false);
    }),
  );

  it.effect("handles generic git source with git hash comparison", () =>
    Effect.gen(function* () {
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

      const plan = buildUpdatePlan([op], lf, "Update", Option.none(), stubRunClosure);

      expect(yield* isSkipStep(getFirstStep(plan))).toBe(false);
    }),
  );

  // ---------------------------------------------------------------------------
  // Registry sources
  // ---------------------------------------------------------------------------

  it.effect("marks registry source as ready when resolvedVersion changed", () =>
    Effect.gen(function* () {
      const op = makeOp("commit", {
        sourceType: "registry",
        version: exactVersion("2.0.0"),
      });
      const lf = lockfileWith({
        commit: makeLockEntry({
          type: "registry",
          owner: AXM,
          name: extensionName("commit"),
          resolvedVersion: exactVersion("1.0.0"),
          integrity: "sha512-AAAA==",
          sourceName: "default",
        }),
      });

      const plan = buildUpdatePlan([op], lf, "Update", Option.none(), stubRunClosure);

      expect(yield* isSkipStep(getFirstStep(plan))).toBe(false);
    }),
  );

  it.effect("marks registry source as skip when resolvedVersion unchanged", () =>
    Effect.gen(function* () {
      const op = makeOp("commit", {
        sourceType: "registry",
        version: exactVersion("1.0.0"),
      });
      const lf = lockfileWith({
        commit: makeLockEntry({
          type: "registry",
          owner: AXM,
          name: extensionName("commit"),
          resolvedVersion: exactVersion("1.0.0"),
          integrity: "sha512-AAAA==",
          sourceName: "default",
        }),
      });

      const plan = buildUpdatePlan([op], lf, "Update", Option.none(), stubRunClosure);

      expect(yield* isSkipStep(getFirstStep(plan))).toBe(true);
    }),
  );

  // ---------------------------------------------------------------------------
  // Local sources
  // ---------------------------------------------------------------------------

  it.effect("always marks local source as ready (no version tracking)", () =>
    Effect.gen(function* () {
      const op = makeOp("commit", { sourceType: "local" });
      const lf = lockfileWith({
        commit: makeLockEntry({ type: "local", path: "/installed" }),
      });

      const plan = buildUpdatePlan([op], lf, "Update", Option.none(), stubRunClosure);

      expect(yield* isSkipStep(getFirstStep(plan))).toBe(false);
    }),
  );

  // ---------------------------------------------------------------------------
  // Force flag
  // ---------------------------------------------------------------------------

  it.effect("marks as ready when force is true regardless of version match", () =>
    Effect.gen(function* () {
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

      const plan = buildUpdatePlan([op], lf, "Update", Option.none(), stubRunClosure);

      expect(yield* isSkipStep(getFirstStep(plan))).toBe(false);
    }),
  );

  it.effect("marks as ready when force is true for registry with same version", () =>
    Effect.gen(function* () {
      const op = makeOp("commit", {
        sourceType: "registry",
        force: true,
        version: exactVersion("1.0.0"),
      });
      const lf = lockfileWith({
        commit: makeLockEntry({
          type: "registry",
          owner: AXM,
          name: extensionName("commit"),
          resolvedVersion: exactVersion("1.0.0"),
          integrity: "sha512-AAAA==",
          sourceName: "default",
        }),
      });

      const plan = buildUpdatePlan([op], lf, "Update", Option.none(), stubRunClosure);

      expect(yield* isSkipStep(getFirstStep(plan))).toBe(false);
    }),
  );

  // ---------------------------------------------------------------------------
  // Skill not in lockfile (new skill during update)
  // ---------------------------------------------------------------------------

  it.effect("marks as ready when skill is not in lockfile", () =>
    Effect.gen(function* () {
      const op = makeOp("new-skill", { sourceType: "github", gitTreeSha: Option.some("sha") });

      const plan = buildUpdatePlan([op], emptyLockfile, "Update", Option.none(), stubRunClosure);

      expect(yield* isSkipStep(getFirstStep(plan))).toBe(false);
    }),
  );

  // ---------------------------------------------------------------------------
  // Plan structure
  // ---------------------------------------------------------------------------

  it("produces empty steps from empty operations", () => {
    const plan = buildUpdatePlan([], emptyLockfile, "Update", Option.none(), stubRunClosure);

    expect(plan.jobs).toHaveLength(1);
    expect(getSteps(plan)).toHaveLength(0);
  });

  it("derives label from skill name", () => {
    const plan = buildUpdatePlan(
      [makeOp("commit"), makeOp("review-pr")],
      emptyLockfile,
      "Update",
      Option.none(),
      stubRunClosure,
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
      stubRunClosure,
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
      stubRunClosure,
    );

    expect(plan.jobs).toHaveLength(1);
    expect(getJob(plan).concurrency).toBe("unbounded");
  });

  it("has _tag Plan", () => {
    const plan = buildUpdatePlan(
      [makeOp("a")],
      emptyLockfile,
      "Update",
      Option.none(),
      stubRunClosure,
    );

    expect(plan._tag).toBe("Plan");
  });

  it.effect("handles mixed ready and skip readiness", () =>
    Effect.gen(function* () {
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

      const plan = buildUpdatePlan(ops, lf, "Update", Option.none(), stubRunClosure);

      const steps = getSteps(plan);
      expect(yield* isSkipStep(getStep(steps, 0))).toBe(false);
      expect(getStep(steps, 0).label).toBe("changed");
      expect(yield* isSkipStep(getStep(steps, 1))).toBe(true);
      expect(getStep(steps, 1).label).toBe("unchanged");
      expect(yield* isSkipStep(getStep(steps, 2))).toBe(false);
      expect(getStep(steps, 2).label).toBe("local-skill");
    }),
  );

  // ---------------------------------------------------------------------------
  // UninstallSkillOperation support (rename cleanup)
  // ---------------------------------------------------------------------------

  it.effect("accepts UninstallSkillOperation in the operations array", () =>
    Effect.gen(function* () {
      const installOp = makeOp("new-name");
      const uninstallOp: UninstallSkillOperation = {
        name: "uninstall-skill",
        args: { skillName: "old-name", agents: [] },
      };

      const plan = buildUpdatePlan(
        [installOp, uninstallOp],
        emptyLockfile,
        "Update",
        Option.none(),
        stubRunClosure,
      );

      const steps = getSteps(plan);
      expect(steps).toHaveLength(2);
      // First step should be install (dispatched to stub closure)
      expect(yield* runStep(getStep(steps, 0))).toBe("executed install-skill");
      // Second step should be uninstall (dispatched to stub closure)
      expect(yield* runStep(getStep(steps, 1))).toBe("executed uninstall-skill");
    }),
  );

  it("gives UninstallSkillOperation steps a rename cleanup label", () => {
    const uninstallOp: UninstallSkillOperation = {
      name: "uninstall-skill",
      args: { skillName: "old-name", agents: [] },
    };

    const plan = buildUpdatePlan(
      [uninstallOp],
      emptyLockfile,
      "Update",
      Option.none(),
      stubRunClosure,
    );

    const step = getFirstStep(plan);
    expect(step.label).toContain("old-name");
    expect(step.label).toContain("renamed");
  });

  it.effect("handles mixed install and uninstall operations", () =>
    Effect.gen(function* () {
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
        stubRunClosure,
      );

      const steps = getSteps(plan);
      expect(steps).toHaveLength(2);
      expect(getStep(steps, 0).label).toBe("new-skill");
      expect(yield* isSkipStep(getStep(steps, 0))).toBe(false);
      expect(getStep(steps, 1).label).toContain("old-skill");
      expect(getStep(steps, 1).label).toContain("renamed");
    }),
  );
});
