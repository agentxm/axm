/**
 * Tests for buildPlan and plan utility functions.
 *
 * Computes execution plan by diffing current vs ideal state.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import type {
  ActualSkillV2,
  CurrentState,
  IdealSkillV2,
  IdealState,
  LockedSkillV2,
  PlanStep,
  Source,
  SkillStateV2,
} from "../extensions/skills/state/types.js";
import { buildPlan, getPlanSummary, planHasChanges } from "./plan.js";

// =============================================================================
// Test Helpers
// =============================================================================

/** Create a LockedSkillV2 for testing */
const makeLockedSkill = (
  name: string,
  opts: {
    source?: Source;
    version?: Option.Option<string>;
    gitTreeHash?: Option.Option<string>;
    agents?: ReadonlyArray<string>;
  } = {},
): LockedSkillV2 => ({
  name,
  source: opts.source ?? { source: "local", path: `/path/to/${name}` },
  version: opts.version ?? Option.none(),
  gitTreeHash: opts.gitTreeHash ?? Option.some(`hash-${name}`),
  agents: opts.agents ?? ["claude"],
  installedAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
});

/** Create an ActualSkillV2 for testing */
const makeActualSkill = (name: string, path: string): ActualSkillV2 => ({
  name,
  path,
  files: ["SKILL.md"],
  frontmatter: Option.none(),
  issues: [],
});

/** Create a SkillStateV2 for testing */
const makeSkillState = (
  name: string,
  opts: {
    hasActual?: boolean;
    locked?: LockedSkillV2;
  } = {},
): SkillStateV2 => ({
  name,
  actual:
    opts.hasActual !== false ? Option.some(makeActualSkill(name, `/test/${name}`)) : Option.none(),
  locked: opts.locked ? Option.some(opts.locked) : Option.none(),
  issues: [],
});

/** Create an IdealSkillV2 for testing */
const makeIdealSkill = (
  name: string,
  opts: {
    source?: Source;
    version?: Option.Option<string>;
    gitTreeHash?: Option.Option<string>;
    agents?: ReadonlyArray<string>;
  } = {},
): IdealSkillV2 => ({
  name,
  source: opts.source ?? { source: "local", path: `/path/to/${name}` },
  version: opts.version ?? Option.none(),
  gitTreeHash: opts.gitTreeHash ?? Option.some(`hash-${name}`),
  agents: opts.agents ?? ["claude"],
});

// =============================================================================
// buildPlan Tests
// =============================================================================

describe("buildPlan", () => {
  describe("empty plan", () => {
    it("returns empty plan when current matches ideal exactly", () => {
      const locked = makeLockedSkill("my-skill", {
        source: {
          source: "registry",
          url: "https://registry.example.com",
        },
        version: Option.some("1.0.0"),
        gitTreeHash: Option.some("hash123"),
      });
      const current: CurrentState = {
        skills: [makeSkillState("my-skill", { locked })],
        issues: [],
      };
      const ideal: IdealState = {
        skills: [
          makeIdealSkill("my-skill", {
            source: {
              source: "registry",
              url: "https://registry.example.com",
            },
            version: Option.some("1.0.0"),
            gitTreeHash: Option.some("hash123"),
          }),
        ],
      };

      const plan = buildPlan(current, ideal);

      expect(plan.steps).toHaveLength(0);
    });

    it("returns empty plan when both current and ideal are empty", () => {
      const current: CurrentState = { skills: [], issues: [] };
      const ideal: IdealState = { skills: [] };

      const plan = buildPlan(current, ideal);

      expect(plan.steps).toHaveLength(0);
    });
  });

  describe("InstallSkill", () => {
    it("creates InstallSkill step when skill in ideal but not current", () => {
      const current: CurrentState = { skills: [], issues: [] };
      const ideal: IdealState = {
        skills: [
          makeIdealSkill("new-skill", {
            source: {
              source: "github",
              owner: "user",
              repo: "repo",
              ref: Option.none(),
              subPath: Option.none(),
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
      expect(step.source.source).toBe("github");
      expect(step.gitTreeHash).toEqual(Option.some("abc123"));
      expect(step.agents).toEqual(["claude", "cursor"]);
    });

    it("creates InstallSkill step when skill exists in current but without locked", () => {
      const current: CurrentState = {
        skills: [makeSkillState("orphan-skill")], // No locked data
        issues: [],
      };
      const ideal: IdealState = {
        skills: [makeIdealSkill("orphan-skill")],
      };

      const plan = buildPlan(current, ideal);

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]?._tag).toBe("InstallSkill");
    });
  });

  describe("UninstallSkill", () => {
    it("creates UninstallSkill step when skill in current but not ideal", () => {
      const locked = makeLockedSkill("old-skill", {
        agents: ["claude", "codex"],
      });
      const current: CurrentState = {
        skills: [makeSkillState("old-skill", { locked })],
        issues: [],
      };
      const ideal: IdealState = { skills: [] };

      const plan = buildPlan(current, ideal);

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]?._tag).toBe("UninstallSkill");
      const step = plan.steps[0] as PlanStep & { _tag: "UninstallSkill" };
      expect(step.skill).toBe("old-skill");
      expect(step.agents).toEqual(["claude", "codex"]);
    });

    it("does not create UninstallSkill when skill has no actual (only locked)", () => {
      const locked = makeLockedSkill("missing-skill");
      const current: CurrentState = {
        skills: [makeSkillState("missing-skill", { hasActual: false, locked })],
        issues: [],
      };
      const ideal: IdealState = { skills: [] };

      const plan = buildPlan(current, ideal);

      // Skill that is locked but not on disk is a health issue, not uninstall target
      expect(plan.steps).toHaveLength(0);
    });

    it("does not create UninstallSkill when skill has no locked", () => {
      const current: CurrentState = {
        skills: [makeSkillState("orphan-skill")], // No locked
        issues: [],
      };
      const ideal: IdealState = { skills: [] };

      const plan = buildPlan(current, ideal);

      // Orphaned skill (on disk but not in lockfile) is a health issue, not uninstall target
      expect(plan.steps).toHaveLength(0);
    });
  });

  describe("UpdateSkill for Registry sources", () => {
    it("creates UpdateSkill when version differs for registry source", () => {
      const locked = makeLockedSkill("pkg", {
        source: {
          source: "registry",
          url: "https://registry.example.com",
        },
        version: Option.some("1.0.0"),
        gitTreeHash: Option.some("old-hash"),
        agents: ["claude"],
      });
      const current: CurrentState = {
        skills: [makeSkillState("pkg", { locked })],
        issues: [],
      };
      const ideal: IdealState = {
        skills: [
          makeIdealSkill("pkg", {
            source: {
              source: "registry",
              url: "https://registry.example.com",
            },
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
      const locked = makeLockedSkill("pkg", {
        source: {
          source: "registry",
          url: "https://registry.example.com",
        },
        version: Option.some("1.0.0"),
        gitTreeHash: Option.some("hash1"),
        agents: ["claude"],
      });
      const current: CurrentState = {
        skills: [makeSkillState("pkg", { locked })],
        issues: [],
      };
      const ideal: IdealState = {
        skills: [
          makeIdealSkill("pkg", {
            source: {
              source: "registry",
              url: "https://registry.example.com",
            },
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
      const locked = makeLockedSkill("git-skill", {
        source: {
          source: "github",
          owner: "user",
          repo: "repo",
          ref: Option.some("main"),
          subPath: Option.none(),
        },
        version: Option.none(),
        gitTreeHash: Option.some("old-hash"),
        agents: ["claude"],
      });
      const current: CurrentState = {
        skills: [makeSkillState("git-skill", { locked })],
        issues: [],
      };
      const ideal: IdealState = {
        skills: [
          makeIdealSkill("git-skill", {
            source: {
              source: "github",
              owner: "user",
              repo: "repo",
              ref: Option.some("main"),
              subPath: Option.none(),
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
      const locked = makeLockedSkill("git-skill", {
        source: {
          source: "github",
          owner: "user",
          repo: "repo",
          ref: Option.some("main"),
          subPath: Option.none(),
        },
        version: Option.none(),
        gitTreeHash: hash,
        agents: ["claude"],
      });
      const current: CurrentState = {
        skills: [makeSkillState("git-skill", { locked })],
        issues: [],
      };
      const ideal: IdealState = {
        skills: [
          makeIdealSkill("git-skill", {
            source: {
              source: "github",
              owner: "user",
              repo: "repo",
              ref: Option.some("main"),
              subPath: Option.none(),
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
      const locked = makeLockedSkill("git-skill", {
        source: {
          source: "github",
          owner: "user",
          repo: "repo",
          ref: Option.some("main"),
          subPath: Option.none(),
        },
        version: Option.none(),
        gitTreeHash: Option.some("existing-hash"),
        agents: ["claude"],
      });
      const current: CurrentState = {
        skills: [makeSkillState("git-skill", { locked })],
        issues: [],
      };
      const ideal: IdealState = {
        skills: [
          makeIdealSkill("git-skill", {
            source: {
              source: "github",
              owner: "user",
              repo: "repo",
              ref: Option.some("main"),
              subPath: Option.none(),
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
      const locked = makeLockedSkill("git-skill", {
        source: {
          source: "github",
          owner: "user",
          repo: "repo",
          ref: Option.some("main"),
          subPath: Option.none(),
        },
        version: Option.none(),
        gitTreeHash: Option.none(), // Previously installed without hash
        agents: ["claude"],
      });
      const current: CurrentState = {
        skills: [makeSkillState("git-skill", { locked })],
        issues: [],
      };
      const ideal: IdealState = {
        skills: [
          makeIdealSkill("git-skill", {
            source: {
              source: "github",
              owner: "user",
              repo: "repo",
              ref: Option.some("main"),
              subPath: Option.none(),
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
      const locked = makeLockedSkill("git-skill", {
        source: {
          source: "github",
          owner: "user",
          repo: "repo",
          ref: Option.some("main"),
          subPath: Option.none(),
        },
        version: Option.none(),
        gitTreeHash: Option.none(),
        agents: ["claude"],
      });
      const current: CurrentState = {
        skills: [makeSkillState("git-skill", { locked })],
        issues: [],
      };
      const ideal: IdealState = {
        skills: [
          makeIdealSkill("git-skill", {
            source: {
              source: "github",
              owner: "user",
              repo: "repo",
              ref: Option.some("main"),
              subPath: Option.none(),
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
      const locked = makeLockedSkill("local-skill", {
        source: { source: "local", path: "/path/to/skill" },
        version: Option.none(),
        gitTreeHash: Option.some("same-hash"),
        agents: ["claude"],
      });
      const current: CurrentState = {
        skills: [makeSkillState("local-skill", { locked })],
        issues: [],
      };
      const ideal: IdealState = {
        skills: [
          makeIdealSkill("local-skill", {
            source: { source: "local", path: "/path/to/skill" },
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
      const lockedToUpdate = makeLockedSkill("update-me", {
        source: {
          source: "registry",
          url: "https://registry.example.com",
        },
        version: Option.some("1.0.0"),
        agents: ["claude"],
      });
      const lockedToRemove = makeLockedSkill("remove-me", {
        agents: ["codex"],
      });
      const current: CurrentState = {
        skills: [
          makeSkillState("update-me", { locked: lockedToUpdate }),
          makeSkillState("remove-me", { locked: lockedToRemove }),
        ],
        issues: [],
      };
      const ideal: IdealState = {
        skills: [
          makeIdealSkill("update-me", {
            source: {
              source: "registry",
              url: "https://registry.example.com",
            },
            version: Option.some("2.0.0"),
            agents: ["claude"],
          }),
          makeIdealSkill("install-me", {
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
      const locked = makeLockedSkill("my-skill", {
        source: {
          source: "github",
          owner: "old",
          repo: "repo",
          ref: Option.none(),
          subPath: Option.none(),
        },
        version: Option.none(),
        gitTreeHash: Option.some("old-hash"),
        agents: ["claude"],
      });
      const current: CurrentState = {
        skills: [makeSkillState("my-skill", { locked })],
        issues: [],
      };
      const ideal: IdealState = {
        skills: [
          makeIdealSkill("my-skill", {
            source: {
              source: "registry",
              url: "https://registry.example.com",
            },
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

// =============================================================================
// planHasChanges Tests
// =============================================================================

describe("planHasChanges", () => {
  it("returns false for empty plan", () => {
    const plan = { steps: [] };
    expect(planHasChanges(plan)).toBe(false);
  });

  it("returns true for plan with InstallSkill", () => {
    const plan = {
      steps: [
        {
          _tag: "InstallSkill" as const,
          skill: "test",
          source: { source: "local" as const, path: "/test" },
          version: Option.none(),
          gitTreeHash: Option.none(),
          agents: ["claude"],
        },
      ],
    };
    expect(planHasChanges(plan)).toBe(true);
  });

  it("returns true for plan with UpdateSkill", () => {
    const plan = {
      steps: [
        {
          _tag: "UpdateSkill" as const,
          skill: "test",
          source: { source: "local" as const, path: "/test" },
          fromVersion: Option.none(),
          toVersion: Option.none(),
          fromHash: Option.none(),
          toHash: Option.none(),
          agents: ["claude"],
        },
      ],
    };
    expect(planHasChanges(plan)).toBe(true);
  });

  it("returns true for plan with UninstallSkill", () => {
    const plan = {
      steps: [
        {
          _tag: "UninstallSkill" as const,
          skill: "test",
          agents: ["claude"],
        },
      ],
    };
    expect(planHasChanges(plan)).toBe(true);
  });

  it("returns true for plan with multiple steps", () => {
    const plan = {
      steps: [
        {
          _tag: "InstallSkill" as const,
          skill: "test1",
          source: { source: "local" as const, path: "/test1" },
          version: Option.none(),
          gitTreeHash: Option.none(),
          agents: ["claude"],
        },
        {
          _tag: "UninstallSkill" as const,
          skill: "test2",
          agents: ["codex"],
        },
      ],
    };
    expect(planHasChanges(plan)).toBe(true);
  });
});

// =============================================================================
// getPlanSummary Tests
// =============================================================================

describe("getPlanSummary", () => {
  it("returns zero counts for empty plan", () => {
    const plan = { steps: [] };
    const summary = getPlanSummary(plan);

    expect(summary.installed).toBe(0);
    expect(summary.updated).toBe(0);
    expect(summary.uninstalled).toBe(0);
  });

  it("counts InstallSkill steps correctly", () => {
    const plan = {
      steps: [
        {
          _tag: "InstallSkill" as const,
          skill: "test1",
          source: { source: "local" as const, path: "/test1" },
          version: Option.none(),
          gitTreeHash: Option.none(),
          agents: ["claude"],
        },
        {
          _tag: "InstallSkill" as const,
          skill: "test2",
          source: { source: "local" as const, path: "/test2" },
          version: Option.none(),
          gitTreeHash: Option.none(),
          agents: ["claude"],
        },
      ],
    };
    const summary = getPlanSummary(plan);

    expect(summary.installed).toBe(2);
    expect(summary.updated).toBe(0);
    expect(summary.uninstalled).toBe(0);
  });

  it("counts UpdateSkill steps correctly", () => {
    const plan = {
      steps: [
        {
          _tag: "UpdateSkill" as const,
          skill: "test",
          source: { source: "local" as const, path: "/test" },
          fromVersion: Option.none(),
          toVersion: Option.none(),
          fromHash: Option.none(),
          toHash: Option.none(),
          agents: ["claude"],
        },
      ],
    };
    const summary = getPlanSummary(plan);

    expect(summary.installed).toBe(0);
    expect(summary.updated).toBe(1);
    expect(summary.uninstalled).toBe(0);
  });

  it("counts UninstallSkill steps correctly", () => {
    const plan = {
      steps: [
        {
          _tag: "UninstallSkill" as const,
          skill: "test1",
          agents: ["claude"],
        },
        {
          _tag: "UninstallSkill" as const,
          skill: "test2",
          agents: ["codex"],
        },
        {
          _tag: "UninstallSkill" as const,
          skill: "test3",
          agents: ["claude", "cursor"],
        },
      ],
    };
    const summary = getPlanSummary(plan);

    expect(summary.installed).toBe(0);
    expect(summary.updated).toBe(0);
    expect(summary.uninstalled).toBe(3);
  });

  it("counts mixed steps correctly", () => {
    const plan = {
      steps: [
        {
          _tag: "InstallSkill" as const,
          skill: "install1",
          source: { source: "local" as const, path: "/install1" },
          version: Option.none(),
          gitTreeHash: Option.none(),
          agents: ["claude"],
        },
        {
          _tag: "InstallSkill" as const,
          skill: "install2",
          source: { source: "local" as const, path: "/install2" },
          version: Option.none(),
          gitTreeHash: Option.none(),
          agents: ["claude"],
        },
        {
          _tag: "UpdateSkill" as const,
          skill: "update1",
          source: { source: "local" as const, path: "/update1" },
          fromVersion: Option.none(),
          toVersion: Option.none(),
          fromHash: Option.none(),
          toHash: Option.none(),
          agents: ["claude"],
        },
        {
          _tag: "UninstallSkill" as const,
          skill: "uninstall1",
          agents: ["codex"],
        },
      ],
    };
    const summary = getPlanSummary(plan);

    expect(summary.installed).toBe(2);
    expect(summary.updated).toBe(1);
    expect(summary.uninstalled).toBe(1);
  });
});
