/**
 * Tests for pure functions module.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  type ActualSkillIssue,
  buildPlan,
  type CurrentStateNew,
  collectIssues,
  computeInstallPath,
  type IdealSkillNew,
  type IdealStateNew,
  type LockedSkillNew,
  type PlanStep,
  type SkillSource,
  type SkillSourceNew,
  type SkillStateIssue,
  type SkillStateNew,
  versionsEqual,
} from "./pure-functions.js";
import {
  ActualSkillIssue as ActualSkillIssueConstructor,
  SkillStateIssue as SkillStateIssueConstructor,
  WorkspaceIssue as WorkspaceIssueConstructor,
} from "./types.js";

describe("computeInstallPath", () => {
  describe("Registry sources", () => {
    it("computes path with scope for registry source", () => {
      const source: SkillSource = {
        _tag: "Registry",
        location: { _tag: "Remote", url: "https://registry.example.com" },
        scope: "official",
        name: "commit",
        version: Option.some("1.0.0"),
      };

      const path = computeInstallPath(source, "commit");

      expect(path).toBe(".axm/extensions/@official/skills/commit");
    });

    it("computes path with different scope", () => {
      const source: SkillSource = {
        _tag: "Registry",
        location: { _tag: "FileSystem", path: "/local/registry" },
        scope: "my-org",
        name: "review-pr",
        version: Option.none(),
      };

      const path = computeInstallPath(source, "review-pr");

      expect(path).toBe(".axm/extensions/@my-org/skills/review-pr");
    });

    it("uses skill name parameter, not source name", () => {
      const source: SkillSource = {
        _tag: "Registry",
        location: { _tag: "Remote", url: "https://registry.example.com" },
        scope: "scope",
        name: "source-name",
        version: Option.none(),
      };

      const path = computeInstallPath(source, "different-name");

      expect(path).toBe(".axm/extensions/@scope/skills/different-name");
    });
  });

  describe("GitHub sources", () => {
    it("computes external path for GitHub source", () => {
      const source: SkillSource = {
        _tag: "GitHub",
        owner: "anthropics",
        repo: "claude-skills",
        ref: Option.some("main"),
        path: Option.some("skills/commit"),
      };

      const path = computeInstallPath(source, "commit");

      expect(path).toBe(".axm/extensions/external/skills/commit");
    });

    it("computes external path regardless of ref and subpath", () => {
      const source: SkillSource = {
        _tag: "GitHub",
        owner: "user",
        repo: "repo",
        ref: Option.none(),
        path: Option.none(),
      };

      const path = computeInstallPath(source, "my-skill");

      expect(path).toBe(".axm/extensions/external/skills/my-skill");
    });
  });

  describe("Local sources", () => {
    it("computes external path for local source", () => {
      const source: SkillSource = {
        _tag: "Local",
        path: "/Users/dev/my-skill",
      };

      const path = computeInstallPath(source, "my-skill");

      expect(path).toBe(".axm/extensions/external/skills/my-skill");
    });

    it("computes external path for any local path", () => {
      const source: SkillSource = {
        _tag: "Local",
        path: "../relative/path/to/skill",
      };

      const path = computeInstallPath(source, "relative-skill");

      expect(path).toBe(".axm/extensions/external/skills/relative-skill");
    });
  });

  describe("edge cases", () => {
    it("handles skill names with hyphens", () => {
      const source: SkillSource = {
        _tag: "Local",
        path: "/path",
      };

      const path = computeInstallPath(source, "my-complex-skill-name");

      expect(path).toBe(".axm/extensions/external/skills/my-complex-skill-name");
    });

    it("handles scope names with hyphens", () => {
      const source: SkillSource = {
        _tag: "Registry",
        location: { _tag: "Remote", url: "https://registry.example.com" },
        scope: "my-organization-name",
        name: "skill",
        version: Option.none(),
      };

      const path = computeInstallPath(source, "skill");

      expect(path).toBe(".axm/extensions/@my-organization-name/skills/skill");
    });
  });
});

// =============================================================================
// collectIssues Tests
// =============================================================================

// Test helpers for collectIssues
const makeSkillStateNew = (
  name: string,
  opts: {
    issues?: readonly SkillStateIssue[];
    actualIssues?: readonly ActualSkillIssue[];
    hasActual?: boolean;
  } = {},
): SkillStateNew => ({
  name,
  actual:
    opts.hasActual !== false
      ? Option.some({
          name,
          path: `/test/${name}`,
          files: ["SKILL.md"],
          frontmatter: Option.none(),
          issues: opts.actualIssues ?? [],
        })
      : Option.none(),
  locked: Option.none(),
  issues: opts.issues ?? [],
});

describe("collectIssues", () => {
  it("returns empty array when no issues exist", () => {
    const current: CurrentStateNew = {
      skills: [],
      issues: [],
    };

    const result = collectIssues(current);

    expect(result).toEqual([]);
  });

  it("collects workspace-level issues", () => {
    const workspaceIssue = WorkspaceIssueConstructor.DuplicateName({
      name: "my-skill",
      paths: ["/path1", "/path2"],
    });
    const current: CurrentStateNew = {
      skills: [],
      issues: [workspaceIssue],
    };

    const result = collectIssues(current);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(workspaceIssue);
  });

  it("collects skill state-level issues", () => {
    const skillStateIssue = SkillStateIssueConstructor.MissingFromDisk({
      name: "missing-skill",
    });
    const current: CurrentStateNew = {
      skills: [
        makeSkillStateNew("missing-skill", {
          issues: [skillStateIssue],
          hasActual: false,
        }),
      ],
      issues: [],
    };

    const result = collectIssues(current);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(skillStateIssue);
  });

  it("collects actual skill-level issues", () => {
    const actualSkillIssue = ActualSkillIssueConstructor.MissingSkillMd({
      path: "/test/skill/SKILL.md",
    });
    const current: CurrentStateNew = {
      skills: [
        makeSkillStateNew("my-skill", {
          actualIssues: [actualSkillIssue],
        }),
      ],
      issues: [],
    };

    const result = collectIssues(current);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(actualSkillIssue);
  });

  it("collects issues from all levels", () => {
    const workspaceIssue = WorkspaceIssueConstructor.OrphanedSettingsRef({
      agent: "claude",
      skill: "orphaned-skill",
    });
    const skillStateIssue = SkillStateIssueConstructor.NotInLockfile({
      name: "untracked-skill",
    });
    const actualSkillIssue = ActualSkillIssueConstructor.MissingDescription();

    const current: CurrentStateNew = {
      skills: [
        makeSkillStateNew("skill-with-issues", {
          issues: [skillStateIssue],
          actualIssues: [actualSkillIssue],
        }),
      ],
      issues: [workspaceIssue],
    };

    const result = collectIssues(current);

    expect(result).toHaveLength(3);
    // Check all issue types are present
    expect(result).toContainEqual(workspaceIssue);
    expect(result).toContainEqual(skillStateIssue);
    expect(result).toContainEqual(actualSkillIssue);
  });

  it("collects issues from multiple skills", () => {
    const issue1 = SkillStateIssueConstructor.MissingFromDisk({ name: "skill1" });
    const issue2 = ActualSkillIssueConstructor.InvalidFrontmatter({
      errors: ["Invalid YAML"],
    });
    const issue3 = SkillStateIssueConstructor.NotInLockfile({ name: "skill2" });

    const current: CurrentStateNew = {
      skills: [
        makeSkillStateNew("skill1", { issues: [issue1], hasActual: false }),
        makeSkillStateNew("skill2", { issues: [issue3], actualIssues: [issue2] }),
      ],
      issues: [],
    };

    const result = collectIssues(current);

    expect(result).toHaveLength(3);
    expect(result).toContainEqual(issue1);
    expect(result).toContainEqual(issue2);
    expect(result).toContainEqual(issue3);
  });

  it("handles skills with no actual (actual is None)", () => {
    const skillStateIssue = SkillStateIssueConstructor.MissingFromDisk({
      name: "missing-skill",
    });
    const current: CurrentStateNew = {
      skills: [
        makeSkillStateNew("missing-skill", {
          issues: [skillStateIssue],
          hasActual: false,
        }),
      ],
      issues: [],
    };

    const result = collectIssues(current);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(skillStateIssue);
  });

  it("handles multiple issues per skill", () => {
    const issue1 = ActualSkillIssueConstructor.MissingSkillMd({
      path: "/test/skill/SKILL.md",
    });
    const issue2 = ActualSkillIssueConstructor.MissingDescription();
    const issue3 = SkillStateIssueConstructor.NotInLockfile({ name: "skill" });

    const current: CurrentStateNew = {
      skills: [
        makeSkillStateNew("skill", {
          issues: [issue3],
          actualIssues: [issue1, issue2],
        }),
      ],
      issues: [],
    };

    const result = collectIssues(current);

    expect(result).toHaveLength(3);
    expect(result).toContainEqual(issue1);
    expect(result).toContainEqual(issue2);
    expect(result).toContainEqual(issue3);
  });
});

// =============================================================================
// versionsEqual Tests
// =============================================================================

describe("versionsEqual", () => {
  describe("both None", () => {
    it("returns true when both are None", () => {
      const result = versionsEqual(Option.none(), Option.none());
      expect(result).toBe(true);
    });
  });

  describe("one None, one Some", () => {
    it("returns false when first is None and second is Some", () => {
      const result = versionsEqual(Option.none(), Option.some("1.0.0"));
      expect(result).toBe(false);
    });

    it("returns false when first is Some and second is None", () => {
      const result = versionsEqual(Option.some("1.0.0"), Option.none());
      expect(result).toBe(false);
    });
  });

  describe("both valid semver", () => {
    it("returns true for equal semver versions", () => {
      const result = versionsEqual(Option.some("1.0.0"), Option.some("1.0.0"));
      expect(result).toBe(true);
    });

    it("returns false for different semver versions", () => {
      const result = versionsEqual(Option.some("1.0.0"), Option.some("2.0.0"));
      expect(result).toBe(false);
    });

    it("returns true for equivalent prerelease versions", () => {
      const result = versionsEqual(Option.some("1.0.0-beta.1"), Option.some("1.0.0-beta.1"));
      expect(result).toBe(true);
    });

    it("returns false for different prerelease versions", () => {
      const result = versionsEqual(Option.some("1.0.0-alpha"), Option.some("1.0.0-beta"));
      expect(result).toBe(false);
    });
  });

  describe("both non-semver strings", () => {
    it("returns true for identical non-semver strings", () => {
      const result = versionsEqual(Option.some("abc123"), Option.some("abc123"));
      expect(result).toBe(true);
    });

    it("returns false for different non-semver strings", () => {
      const result = versionsEqual(Option.some("abc123"), Option.some("def456"));
      expect(result).toBe(false);
    });

    it("handles git-like hashes", () => {
      const result = versionsEqual(Option.some("a1b2c3d4e5f6"), Option.some("a1b2c3d4e5f6"));
      expect(result).toBe(true);
    });

    it("returns false for different git-like hashes", () => {
      const result = versionsEqual(Option.some("a1b2c3d4e5f6"), Option.some("f6e5d4c3b2a1"));
      expect(result).toBe(false);
    });
  });

  describe("mixed (one semver, one non-semver)", () => {
    it("returns false when comparing semver to non-semver", () => {
      // Falls back to string equality, which is false
      const result = versionsEqual(Option.some("1.0.0"), Option.some("abc123"));
      expect(result).toBe(false);
    });

    it("returns false when comparing non-semver to semver", () => {
      // Falls back to string equality, which is false
      const result = versionsEqual(Option.some("abc123"), Option.some("1.0.0"));
      expect(result).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles empty strings as non-semver", () => {
      const result = versionsEqual(Option.some(""), Option.some(""));
      expect(result).toBe(true);
    });

    it("returns false for empty string vs valid semver", () => {
      const result = versionsEqual(Option.some(""), Option.some("1.0.0"));
      expect(result).toBe(false);
    });

    it("handles versions with build metadata", () => {
      // semver.eq ignores build metadata per spec
      const result = versionsEqual(Option.some("1.0.0+build1"), Option.some("1.0.0+build2"));
      expect(result).toBe(true);
    });
  });
});

// =============================================================================
// buildPlan Tests
// =============================================================================

// Test helpers for buildPlan
const makeLockedSkillNew = (
  name: string,
  opts: {
    source?: SkillSourceNew;
    version?: Option.Option<string>;
    gitTreeHash?: Option.Option<string>;
    agents?: readonly string[];
  } = {},
): LockedSkillNew => ({
  name,
  source: opts.source ?? { _tag: "Local", path: `/path/to/${name}` },
  version: opts.version ?? Option.none(),
  gitTreeHash: opts.gitTreeHash ?? Option.some(`hash-${name}`),
  agents: opts.agents ?? ["claude"],
  installedAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
});

const makeSkillStateForBuildPlan = (
  name: string,
  opts: {
    hasActual?: boolean;
    locked?: LockedSkillNew;
  } = {},
): SkillStateNew => ({
  name,
  actual:
    opts.hasActual !== false
      ? Option.some({
          name,
          path: `/test/${name}`,
          files: ["SKILL.md"],
          frontmatter: Option.none(),
          issues: [],
        })
      : Option.none(),
  locked: opts.locked ? Option.some(opts.locked) : Option.none(),
  issues: [],
});

const makeIdealSkillNew = (
  name: string,
  opts: {
    source?: SkillSourceNew;
    version?: Option.Option<string>;
    gitTreeHash?: Option.Option<string>;
    agents?: readonly string[];
  } = {},
): IdealSkillNew => ({
  name,
  source: opts.source ?? { _tag: "Local", path: `/path/to/${name}` },
  version: opts.version ?? Option.none(),
  gitTreeHash: opts.gitTreeHash ?? Option.some(`hash-${name}`),
  agents: opts.agents ?? ["claude"],
});

describe("buildPlan", () => {
  describe("empty plan", () => {
    it("returns empty plan when current matches ideal exactly", () => {
      const locked = makeLockedSkillNew("my-skill", {
        source: { _tag: "Registry", name: "my-skill", version: "1.0.0" },
        version: Option.some("1.0.0"),
        gitTreeHash: Option.some("hash123"),
      });
      const current: CurrentStateNew = {
        skills: [makeSkillStateForBuildPlan("my-skill", { locked })],
        issues: [],
      };
      const ideal: IdealStateNew = {
        skills: [
          makeIdealSkillNew("my-skill", {
            source: { _tag: "Registry", name: "my-skill", version: "1.0.0" },
            version: Option.some("1.0.0"),
            gitTreeHash: Option.some("hash123"),
          }),
        ],
      };

      const plan = buildPlan(current, ideal);

      expect(plan.steps).toHaveLength(0);
    });

    it("returns empty plan when both current and ideal are empty", () => {
      const current: CurrentStateNew = { skills: [], issues: [] };
      const ideal: IdealStateNew = { skills: [] };

      const plan = buildPlan(current, ideal);

      expect(plan.steps).toHaveLength(0);
    });
  });

  describe("InstallSkill", () => {
    it("creates InstallSkill step when skill in ideal but not current", () => {
      const current: CurrentStateNew = { skills: [], issues: [] };
      const ideal: IdealStateNew = {
        skills: [
          makeIdealSkillNew("new-skill", {
            source: {
              _tag: "GitHub",
              owner: "user",
              repo: "repo",
              ref: Option.none(),
              subpath: Option.none(),
            },
            version: Option.none(),
            gitTreeHash: Option.some("abc123"),
            agents: ["claude", "cursor"],
          }),
        ],
      };

      const plan = buildPlan(current, ideal);

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]?._tag).toBe("InstallSkill");
      const step = plan.steps[0] as PlanStep & { _tag: "InstallSkill" };
      expect(step.skill).toBe("new-skill");
      expect(step.source._tag).toBe("GitHub");
      expect(step.gitTreeHash).toEqual(Option.some("abc123"));
      expect(step.agents).toEqual(["claude", "cursor"]);
    });

    it("creates InstallSkill step when skill exists in current but without locked", () => {
      const current: CurrentStateNew = {
        skills: [makeSkillStateForBuildPlan("orphan-skill")], // No locked data
        issues: [],
      };
      const ideal: IdealStateNew = {
        skills: [makeIdealSkillNew("orphan-skill")],
      };

      const plan = buildPlan(current, ideal);

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]?._tag).toBe("InstallSkill");
    });
  });

  describe("UninstallSkill", () => {
    it("creates UninstallSkill step when skill in current but not ideal", () => {
      const locked = makeLockedSkillNew("old-skill", {
        agents: ["claude", "codex"],
      });
      const current: CurrentStateNew = {
        skills: [makeSkillStateForBuildPlan("old-skill", { locked })],
        issues: [],
      };
      const ideal: IdealStateNew = { skills: [] };

      const plan = buildPlan(current, ideal);

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]?._tag).toBe("UninstallSkill");
      const step = plan.steps[0] as PlanStep & { _tag: "UninstallSkill" };
      expect(step.skill).toBe("old-skill");
      expect(step.agents).toEqual(["claude", "codex"]);
    });

    it("does not create UninstallSkill when skill has no actual (only locked)", () => {
      const locked = makeLockedSkillNew("missing-skill");
      const current: CurrentStateNew = {
        skills: [makeSkillStateForBuildPlan("missing-skill", { hasActual: false, locked })],
        issues: [],
      };
      const ideal: IdealStateNew = { skills: [] };

      const plan = buildPlan(current, ideal);

      // Skill that is locked but not on disk is a health issue, not uninstall target
      expect(plan.steps).toHaveLength(0);
    });

    it("does not create UninstallSkill when skill has no locked", () => {
      const current: CurrentStateNew = {
        skills: [makeSkillStateForBuildPlan("orphan-skill")], // No locked
        issues: [],
      };
      const ideal: IdealStateNew = { skills: [] };

      const plan = buildPlan(current, ideal);

      // Orphaned skill (on disk but not in lockfile) is a health issue, not uninstall target
      expect(plan.steps).toHaveLength(0);
    });
  });

  describe("UpdateSkill for Registry sources", () => {
    it("creates UpdateSkill when version differs for registry source", () => {
      const locked = makeLockedSkillNew("pkg", {
        source: { _tag: "Registry", name: "pkg", version: "1.0.0" },
        version: Option.some("1.0.0"),
        gitTreeHash: Option.some("old-hash"),
        agents: ["claude"],
      });
      const current: CurrentStateNew = {
        skills: [makeSkillStateForBuildPlan("pkg", { locked })],
        issues: [],
      };
      const ideal: IdealStateNew = {
        skills: [
          makeIdealSkillNew("pkg", {
            source: { _tag: "Registry", name: "pkg", version: "2.0.0" },
            version: Option.some("2.0.0"),
            gitTreeHash: Option.some("new-hash"),
            agents: ["claude", "cursor"],
          }),
        ],
      };

      const plan = buildPlan(current, ideal);

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]?._tag).toBe("UpdateSkill");
      const step = plan.steps[0] as PlanStep & { _tag: "UpdateSkill" };
      expect(step.skill).toBe("pkg");
      expect(step.fromVersion).toEqual(Option.some("1.0.0"));
      expect(step.toVersion).toEqual(Option.some("2.0.0"));
      expect(step.agents).toEqual(["claude", "cursor"]);
    });

    it("does not create UpdateSkill when version is same for registry source", () => {
      const locked = makeLockedSkillNew("pkg", {
        source: { _tag: "Registry", name: "pkg", version: "1.0.0" },
        version: Option.some("1.0.0"),
        gitTreeHash: Option.some("hash1"),
        agents: ["claude"],
      });
      const current: CurrentStateNew = {
        skills: [makeSkillStateForBuildPlan("pkg", { locked })],
        issues: [],
      };
      const ideal: IdealStateNew = {
        skills: [
          makeIdealSkillNew("pkg", {
            source: { _tag: "Registry", name: "pkg", version: "1.0.0" },
            version: Option.some("1.0.0"),
            gitTreeHash: Option.some("hash2"), // Different hash but same version
            agents: ["claude"],
          }),
        ],
      };

      const plan = buildPlan(current, ideal);

      // For registry sources, version is the authority, not hash
      expect(plan.steps).toHaveLength(0);
    });
  });

  describe("UpdateSkill for Git sources", () => {
    it("creates UpdateSkill when hash differs for GitHub source", () => {
      const locked = makeLockedSkillNew("git-skill", {
        source: {
          _tag: "GitHub",
          owner: "user",
          repo: "repo",
          ref: Option.some("main"),
          subpath: Option.none(),
        },
        version: Option.none(),
        gitTreeHash: Option.some("old-hash"),
        agents: ["claude"],
      });
      const current: CurrentStateNew = {
        skills: [makeSkillStateForBuildPlan("git-skill", { locked })],
        issues: [],
      };
      const ideal: IdealStateNew = {
        skills: [
          makeIdealSkillNew("git-skill", {
            source: {
              _tag: "GitHub",
              owner: "user",
              repo: "repo",
              ref: Option.some("main"),
              subpath: Option.none(),
            },
            version: Option.none(),
            gitTreeHash: Option.some("new-hash"),
            agents: ["claude"],
          }),
        ],
      };

      const plan = buildPlan(current, ideal);

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]?._tag).toBe("UpdateSkill");
      const step = plan.steps[0] as PlanStep & { _tag: "UpdateSkill" };
      expect(step.skill).toBe("git-skill");
      expect(step.fromHash).toEqual(Option.some("old-hash"));
      expect(step.toHash).toEqual(Option.some("new-hash"));
    });

    it("does not create UpdateSkill when hash is same for GitHub source", () => {
      const hash = Option.some("same-hash");
      const locked = makeLockedSkillNew("git-skill", {
        source: {
          _tag: "GitHub",
          owner: "user",
          repo: "repo",
          ref: Option.some("main"),
          subpath: Option.none(),
        },
        version: Option.none(),
        gitTreeHash: hash,
        agents: ["claude"],
      });
      const current: CurrentStateNew = {
        skills: [makeSkillStateForBuildPlan("git-skill", { locked })],
        issues: [],
      };
      const ideal: IdealStateNew = {
        skills: [
          makeIdealSkillNew("git-skill", {
            source: {
              _tag: "GitHub",
              owner: "user",
              repo: "repo",
              ref: Option.some("main"),
              subpath: Option.none(),
            },
            version: Option.none(),
            gitTreeHash: hash,
            agents: ["claude"],
          }),
        ],
      };

      const plan = buildPlan(current, ideal);

      expect(plan.steps).toHaveLength(0);
    });

    it("always creates UpdateSkill when ideal GitHub source has no hash (API unavailable)", () => {
      const locked = makeLockedSkillNew("git-skill", {
        source: {
          _tag: "GitHub",
          owner: "user",
          repo: "repo",
          ref: Option.some("main"),
          subpath: Option.none(),
        },
        version: Option.none(),
        gitTreeHash: Option.some("existing-hash"),
        agents: ["claude"],
      });
      const current: CurrentStateNew = {
        skills: [makeSkillStateForBuildPlan("git-skill", { locked })],
        issues: [],
      };
      const ideal: IdealStateNew = {
        skills: [
          makeIdealSkillNew("git-skill", {
            source: {
              _tag: "GitHub",
              owner: "user",
              repo: "repo",
              ref: Option.some("main"),
              subpath: Option.none(),
            },
            version: Option.none(),
            gitTreeHash: Option.none(), // API unavailable
            agents: ["claude"],
          }),
        ],
      };

      const plan = buildPlan(current, ideal);

      // No hash available on ideal -> always update (no stable identifier for comparison)
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]?._tag).toBe("UpdateSkill");
      const step = plan.steps[0] as PlanStep & { _tag: "UpdateSkill" };
      expect(step.skill).toBe("git-skill");
      expect(step.fromHash).toEqual(Option.some("existing-hash"));
      expect(step.toHash).toEqual(Option.none());
    });

    it("always creates UpdateSkill when locked GitHub source has no hash", () => {
      const locked = makeLockedSkillNew("git-skill", {
        source: {
          _tag: "GitHub",
          owner: "user",
          repo: "repo",
          ref: Option.some("main"),
          subpath: Option.none(),
        },
        version: Option.none(),
        gitTreeHash: Option.none(), // Previously installed without hash
        agents: ["claude"],
      });
      const current: CurrentStateNew = {
        skills: [makeSkillStateForBuildPlan("git-skill", { locked })],
        issues: [],
      };
      const ideal: IdealStateNew = {
        skills: [
          makeIdealSkillNew("git-skill", {
            source: {
              _tag: "GitHub",
              owner: "user",
              repo: "repo",
              ref: Option.some("main"),
              subpath: Option.none(),
            },
            version: Option.none(),
            gitTreeHash: Option.some("new-hash"),
            agents: ["claude"],
          }),
        ],
      };

      const plan = buildPlan(current, ideal);

      // No hash available on locked -> always update (no stable identifier for comparison)
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]?._tag).toBe("UpdateSkill");
      const step = plan.steps[0] as PlanStep & { _tag: "UpdateSkill" };
      expect(step.skill).toBe("git-skill");
      expect(step.fromHash).toEqual(Option.none());
      expect(step.toHash).toEqual(Option.some("new-hash"));
    });

    it("always creates UpdateSkill when both ideal and locked GitHub sources have no hash", () => {
      const locked = makeLockedSkillNew("git-skill", {
        source: {
          _tag: "GitHub",
          owner: "user",
          repo: "repo",
          ref: Option.some("main"),
          subpath: Option.none(),
        },
        version: Option.none(),
        gitTreeHash: Option.none(),
        agents: ["claude"],
      });
      const current: CurrentStateNew = {
        skills: [makeSkillStateForBuildPlan("git-skill", { locked })],
        issues: [],
      };
      const ideal: IdealStateNew = {
        skills: [
          makeIdealSkillNew("git-skill", {
            source: {
              _tag: "GitHub",
              owner: "user",
              repo: "repo",
              ref: Option.some("main"),
              subpath: Option.none(),
            },
            version: Option.none(),
            gitTreeHash: Option.none(),
            agents: ["claude"],
          }),
        ],
      };

      const plan = buildPlan(current, ideal);

      // No hashes available -> always update (no stable identifier for comparison)
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]?._tag).toBe("UpdateSkill");
    });
  });

  describe("UpdateSkill for Local sources", () => {
    it("always creates UpdateSkill for local sources", () => {
      const locked = makeLockedSkillNew("local-skill", {
        source: { _tag: "Local", path: "/path/to/skill" },
        version: Option.none(),
        gitTreeHash: Option.some("same-hash"),
        agents: ["claude"],
      });
      const current: CurrentStateNew = {
        skills: [makeSkillStateForBuildPlan("local-skill", { locked })],
        issues: [],
      };
      const ideal: IdealStateNew = {
        skills: [
          makeIdealSkillNew("local-skill", {
            source: { _tag: "Local", path: "/path/to/skill" },
            version: Option.none(),
            gitTreeHash: Option.some("same-hash"), // Same hash
            agents: ["claude"],
          }),
        ],
      };

      const plan = buildPlan(current, ideal);

      // Local sources always update (no stable identifier)
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]?._tag).toBe("UpdateSkill");
    });
  });

  describe("mixed operations", () => {
    it("handles install, update, and uninstall in same plan", () => {
      const lockedToUpdate = makeLockedSkillNew("update-me", {
        source: { _tag: "Registry", name: "update-me", version: "1.0.0" },
        version: Option.some("1.0.0"),
        agents: ["claude"],
      });
      const lockedToRemove = makeLockedSkillNew("remove-me", {
        agents: ["codex"],
      });
      const current: CurrentStateNew = {
        skills: [
          makeSkillStateForBuildPlan("update-me", { locked: lockedToUpdate }),
          makeSkillStateForBuildPlan("remove-me", { locked: lockedToRemove }),
        ],
        issues: [],
      };
      const ideal: IdealStateNew = {
        skills: [
          makeIdealSkillNew("update-me", {
            source: { _tag: "Registry", name: "update-me", version: "2.0.0" },
            version: Option.some("2.0.0"),
            agents: ["claude"],
          }),
          makeIdealSkillNew("install-me", {
            agents: ["cursor"],
          }),
        ],
      };

      const plan = buildPlan(current, ideal);

      expect(plan.steps).toHaveLength(3);

      const installStep = plan.steps.find(
        (s) => s._tag === "InstallSkill" && s.skill === "install-me",
      );
      const updateStep = plan.steps.find(
        (s) => s._tag === "UpdateSkill" && s.skill === "update-me",
      );
      const uninstallStep = plan.steps.find(
        (s) => s._tag === "UninstallSkill" && s.skill === "remove-me",
      );

      expect(installStep).toBeDefined();
      expect(updateStep).toBeDefined();
      expect(uninstallStep).toBeDefined();
    });
  });

  describe("matching by name", () => {
    it("matches skills by name regardless of source type", () => {
      // Skill was installed from GitHub, now being reinstalled from Registry
      const locked = makeLockedSkillNew("my-skill", {
        source: {
          _tag: "GitHub",
          owner: "old",
          repo: "repo",
          ref: Option.none(),
          subpath: Option.none(),
        },
        version: Option.none(),
        gitTreeHash: Option.some("old-hash"),
        agents: ["claude"],
      });
      const current: CurrentStateNew = {
        skills: [makeSkillStateForBuildPlan("my-skill", { locked })],
        issues: [],
      };
      const ideal: IdealStateNew = {
        skills: [
          makeIdealSkillNew("my-skill", {
            source: { _tag: "Registry", name: "my-skill", version: "1.0.0" },
            version: Option.some("1.0.0"),
            gitTreeHash: Option.some("new-hash"),
            agents: ["claude"],
          }),
        ],
      };

      const plan = buildPlan(current, ideal);

      // Since source types are different, we can't compare versions or hashes meaningfully
      // This becomes an UpdateSkill because the ideal source is Registry (comparing versions)
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]?._tag).toBe("UpdateSkill");
    });
  });
});
