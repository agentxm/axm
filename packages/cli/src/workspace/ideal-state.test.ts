/**
 * Tests for ideal state builders - construct desired state for operations.
 *
 * Tests both the buildIdealState dispatch function and the individual
 * builder functions (buildIdealForInstall, buildIdealForUninstall, buildIdealForUpdate).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import type {
  CurrentState,
  LockedSkillV2,
  Source,
  SkillStateV2,
} from "../extensions/skills/state/types.js";
import {
  type AddSkillOperation,
  buildIdealForInstall,
  buildIdealForUninstall,
  buildIdealFromOperations,
  buildIdealState,
  type Command,
  CommandError,
  type DiscoveredSkill,
  type InstallCommand,
  type RemoveSkillOperation,
  sourcesEqual,
  type UninstallCommand,
  type UpdateCommand,
} from "./ideal-state.js";

// =============================================================================
// Test Helpers
// =============================================================================

/** Create a GitHub source for testing */
const makeGitHubSource = (
  owner: string,
  repo: string,
  ref: Option.Option<string> = Option.none(),
  subPath: Option.Option<string> = Option.none(),
): Source => ({
  source: "github",
  owner,
  repo,
  ref,
  subPath,
});

/** Create a Local source for testing */
const makeLocalSource = (path: string): Source => ({
  source: "local",
  path,
});

/** Create a locked skill for testing */
const makeLockedSkill = (
  name: string,
  source: Source,
  agents: ReadonlyArray<string> = [],
): LockedSkillV2 => ({
  name,
  source,
  version: Option.none(),
  gitTreeHash: Option.some("abc123"),
  agents,
  installedAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
});

/** Create a skill state for testing */
const makeSkillState = (name: string, locked: Option.Option<LockedSkillV2>): SkillStateV2 => ({
  name,
  actual: Option.none(),
  locked,
  issues: [],
});

/** Create a current state for testing */
const makeCurrentState = (skills: ReadonlyArray<SkillStateV2>): CurrentState => ({
  skills,
  issues: [],
});

/** Create an install command for testing */
const makeInstallCommand = (
  source: string,
  skills: ReadonlyArray<string> = ["commit", "review-pr"],
  agents: ReadonlyArray<string> = ["claude"],
  force = false,
): Command & { _tag: "skills-install" } => ({
  _tag: "skills-install",
  source,
  skills: skills as import("effect/Array").NonEmptyReadonlyArray<string>,
  agents,
  force,
});

// =============================================================================
// Mock implementations for testing
// =============================================================================

/** Mock discovered skills from a source */
const mockDiscoveredSkills: ReadonlyArray<DiscoveredSkill> = [
  { name: "commit", version: Option.none(), gitTreeHash: Option.some("hash1") },
  { name: "review-pr", version: Option.none(), gitTreeHash: Option.some("hash2") },
];

/** Mock parseSource that returns a GitHub source */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockParseSource = (_source: string) => Effect.succeed(makeGitHubSource("owner", "repo"));

/** Mock discoverSkills that returns mock skills */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockDiscoverSkills = (_source: Source) => Effect.succeed(mockDiscoveredSkills);

// =============================================================================
// Tests
// =============================================================================

describe("sourcesEqual", () => {
  describe("GitHub sources", () => {
    it("returns true for identical GitHub sources", () => {
      const a = makeGitHubSource("owner", "repo", Option.some("main"));
      const b = makeGitHubSource("owner", "repo", Option.some("main"));

      expect(sourcesEqual(a, b)).toBe(true);
    });

    it("returns false for different owner", () => {
      const a = makeGitHubSource("owner1", "repo");
      const b = makeGitHubSource("owner2", "repo");

      expect(sourcesEqual(a, b)).toBe(false);
    });

    it("returns false for different repo", () => {
      const a = makeGitHubSource("owner", "repo1");
      const b = makeGitHubSource("owner", "repo2");

      expect(sourcesEqual(a, b)).toBe(false);
    });

    it("returns false for different ref", () => {
      const a = makeGitHubSource("owner", "repo", Option.some("main"));
      const b = makeGitHubSource("owner", "repo", Option.some("develop"));

      expect(sourcesEqual(a, b)).toBe(false);
    });
  });

  describe("Local sources", () => {
    it("returns true for identical Local sources", () => {
      const a = makeLocalSource("/path/to/skill");
      const b = makeLocalSource("/path/to/skill");

      expect(sourcesEqual(a, b)).toBe(true);
    });

    it("returns false for different paths", () => {
      const a = makeLocalSource("/path/one");
      const b = makeLocalSource("/path/two");

      expect(sourcesEqual(a, b)).toBe(false);
    });
  });

  describe("Mixed sources", () => {
    it("returns false for different source types", () => {
      const github = makeGitHubSource("owner", "repo");
      const local = makeLocalSource("/path");

      expect(sourcesEqual(github, local)).toBe(false);
    });
  });
});

describe("buildIdealForInstall", () => {
  describe("installing new skills", () => {
    it("installs new skill when not in current state", async () => {
      const current = makeCurrentState([]);
      const cmd = makeInstallCommand("github:owner/repo", ["commit", "review-pr"], ["claude"]);

      const result = await Effect.runPromise(
        buildIdealForInstall(current, cmd, {
          parseSource: mockParseSource,
          discoverSkills: mockDiscoverSkills,
        }),
      );

      expect(result.skills).toHaveLength(2);
      expect(result.skills.map((s) => s.name).sort()).toEqual(["commit", "review-pr"]);
      expect(result.skills[0]?.agents).toEqual(["claude"]);
    });

    it("preserves existing skills when installing new ones", async () => {
      const existingSource = makeGitHubSource("existing-owner", "existing-repo");
      const existingLocked = makeLockedSkill("existing-skill", existingSource, ["cursor"]);
      const current = makeCurrentState([
        makeSkillState("existing-skill", Option.some(existingLocked)),
      ]);
      const cmd = makeInstallCommand("github:owner/repo", ["commit", "review-pr"], ["claude"]);

      const result = await Effect.runPromise(
        buildIdealForInstall(current, cmd, {
          parseSource: mockParseSource,
          discoverSkills: mockDiscoverSkills,
        }),
      );

      expect(result.skills).toHaveLength(3);
      const existingSkillInIdeal = result.skills.find((s) => s.name === "existing-skill");
      expect(existingSkillInIdeal).toBeDefined();
      expect(existingSkillInIdeal?.agents).toEqual(["cursor"]);
    });
  });

  describe("refreshing from same source", () => {
    it("allows reinstall from same source (refresh)", async () => {
      const source = makeGitHubSource("owner", "repo");
      const existingLocked = makeLockedSkill("commit", source, ["cursor"]);
      const current = makeCurrentState([makeSkillState("commit", Option.some(existingLocked))]);
      const cmd = makeInstallCommand("github:owner/repo", ["commit"], ["claude"]);

      const result = await Effect.runPromise(
        buildIdealForInstall(current, cmd, {
          parseSource: mockParseSource,
          discoverSkills: mockDiscoverSkills,
        }),
      );

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("commit");
      expect(result.skills[0]?.agents).toEqual(["claude"]);
    });
  });

  describe("conflict detection", () => {
    it("fails when skill exists from different source without force", async () => {
      const differentSource = makeGitHubSource("different-owner", "different-repo");
      const existingLocked = makeLockedSkill("commit", differentSource, ["cursor"]);
      const current = makeCurrentState([makeSkillState("commit", Option.some(existingLocked))]);
      const cmd = makeInstallCommand("github:owner/repo", ["commit"], ["claude"], false);

      const result = await Effect.runPromise(
        Effect.either(
          buildIdealForInstall(current, cmd, {
            parseSource: mockParseSource,
            discoverSkills: mockDiscoverSkills,
          }),
        ),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(CommandError);
        expect(result.left.message).toContain("commit");
        expect(result.left.message).toContain("different source");
      }
    });

    it("allows replacement from different source with force", async () => {
      const differentSource = makeGitHubSource("different-owner", "different-repo");
      const existingLocked = makeLockedSkill("commit", differentSource, ["cursor"]);
      const current = makeCurrentState([makeSkillState("commit", Option.some(existingLocked))]);
      const cmd = makeInstallCommand("github:owner/repo", ["commit"], ["claude"], true);

      const result = await Effect.runPromise(
        buildIdealForInstall(current, cmd, {
          parseSource: mockParseSource,
          discoverSkills: mockDiscoverSkills,
        }),
      );

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("commit");
      expect(result.skills[0]?.agents).toEqual(["claude"]);
    });
  });

  describe("skill filtering", () => {
    it("installs only specified skills when skills is array", async () => {
      const current = makeCurrentState([]);
      const cmd = makeInstallCommand("github:owner/repo", ["commit"], ["claude"]);

      const result = await Effect.runPromise(
        buildIdealForInstall(current, cmd, {
          parseSource: mockParseSource,
          discoverSkills: mockDiscoverSkills,
        }),
      );

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("commit");
    });

    it("installs all discovered skills when all names listed", async () => {
      const current = makeCurrentState([]);
      const cmd = makeInstallCommand("github:owner/repo", ["commit", "review-pr"], ["claude"]);

      const result = await Effect.runPromise(
        buildIdealForInstall(current, cmd, {
          parseSource: mockParseSource,
          discoverSkills: mockDiscoverSkills,
        }),
      );

      expect(result.skills).toHaveLength(2);
    });

    it("filters to only skills that exist in source", async () => {
      const current = makeCurrentState([]);
      const cmd = makeInstallCommand(
        "github:owner/repo",
        ["commit", "nonexistent-skill"],
        ["claude"],
      );

      const result = await Effect.runPromise(
        buildIdealForInstall(current, cmd, {
          parseSource: mockParseSource,
          discoverSkills: mockDiscoverSkills,
        }),
      );

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("commit");
    });
  });

  describe("agent assignment", () => {
    it("assigns specified agents to installed skills", async () => {
      const current = makeCurrentState([]);
      const cmd = makeInstallCommand(
        "github:owner/repo",
        ["commit", "review-pr"],
        ["claude", "cursor", "codex"],
      );

      const result = await Effect.runPromise(
        buildIdealForInstall(current, cmd, {
          parseSource: mockParseSource,
          discoverSkills: mockDiscoverSkills,
        }),
      );

      expect(result.skills).toHaveLength(2);
      for (const skill of result.skills) {
        expect(skill.agents).toEqual(["claude", "cursor", "codex"]);
      }
    });
  });

  describe("edge cases", () => {
    it("handles empty current state", async () => {
      const current = makeCurrentState([]);
      const cmd = makeInstallCommand("github:owner/repo", ["commit", "review-pr"], ["claude"]);

      const result = await Effect.runPromise(
        buildIdealForInstall(current, cmd, {
          parseSource: mockParseSource,
          discoverSkills: mockDiscoverSkills,
        }),
      );

      expect(result.skills).toHaveLength(2);
    });

    it("handles no skills discovered from source", async () => {
      const current = makeCurrentState([]);
      const cmd = makeInstallCommand("github:owner/repo", ["commit", "review-pr"], ["claude"]);

      const result = await Effect.runPromise(
        buildIdealForInstall(current, cmd, {
          parseSource: mockParseSource,
          discoverSkills: () => Effect.succeed([]),
        }),
      );

      expect(result.skills).toHaveLength(0);
    });

    it("preserves skill data from locked state for unconverted skills", async () => {
      const source = makeGitHubSource("other-owner", "other-repo", Option.some("v1.0.0"));
      const existingLocked = makeLockedSkill("other-skill", source, ["cursor"]);
      const current = makeCurrentState([
        makeSkillState("other-skill", Option.some(existingLocked)),
      ]);
      const cmd = makeInstallCommand("github:owner/repo", ["commit", "review-pr"], ["claude"]);

      const result = await Effect.runPromise(
        buildIdealForInstall(current, cmd, {
          parseSource: mockParseSource,
          discoverSkills: mockDiscoverSkills,
        }),
      );

      const otherSkill = result.skills.find((s) => s.name === "other-skill");
      expect(otherSkill).toBeDefined();
      expect(otherSkill?.source.source).toBe("github");
      if (otherSkill?.source.source === "github") {
        expect(otherSkill.source.owner).toBe("other-owner");
        expect(otherSkill.source.repo).toBe("other-repo");
      }
    });
  });
});

// =============================================================================
// buildIdealForUninstall Tests
// =============================================================================

/** Create an uninstall command for testing */
const makeUninstallCommand = (
  skills: ReadonlyArray<string>,
): Command & { _tag: "skills-uninstall" } => ({
  _tag: "skills-uninstall",
  skills,
});

/** Create a full skill state with both actual and locked */
const makeFullSkillState = (
  name: string,
  source: Source,
  agents: ReadonlyArray<string> = ["claude"],
): SkillStateV2 => ({
  name,
  actual: Option.some({
    name,
    path: `/test/skills/${name}`,
    files: ["SKILL.md"],
    frontmatter: Option.some({
      name: Option.some(name),
      description: Option.some(`${name} description`),
      version: Option.none(),
      triggers: Option.none(),
    }),
    issues: [],
  }),
  locked: Option.some(makeLockedSkill(name, source, agents)),
  issues: [],
});

describe("buildIdealForUninstall", () => {
  describe("uninstall existing skill", () => {
    it("removes skill from ideal state", async () => {
      const source = makeGitHubSource("owner", "repo");
      const current = makeCurrentState([
        makeFullSkillState("skill-a", source),
        makeFullSkillState("skill-b", source),
        makeFullSkillState("skill-c", source),
      ]);

      const result = await Effect.runPromise(
        buildIdealForUninstall(current, makeUninstallCommand(["skill-b"])),
      );

      expect(result.skills.map((s) => s.name).sort()).toEqual(["skill-a", "skill-c"]);
    });

    it("preserves remaining skills with correct data", async () => {
      const source = makeGitHubSource("anthropic", "skills");
      const current = makeCurrentState([
        makeFullSkillState("keep-skill", source, ["claude", "cursor"]),
        makeFullSkillState("remove-skill", makeGitHubSource("other", "repo")),
      ]);

      const result = await Effect.runPromise(
        buildIdealForUninstall(current, makeUninstallCommand(["remove-skill"])),
      );

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("keep-skill");
      expect(result.skills[0]?.source).toEqual(source);
      expect(result.skills[0]?.agents).toEqual(["claude", "cursor"]);
    });
  });

  describe("uninstall non-existent skill", () => {
    it("fails with CommandError when skill not found", async () => {
      const current = makeCurrentState([
        makeFullSkillState("existing-skill", makeGitHubSource("owner", "repo")),
      ]);

      const result = await Effect.runPromise(
        Effect.either(buildIdealForUninstall(current, makeUninstallCommand(["non-existent"]))),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(CommandError);
        expect(result.left.message).toContain("non-existent");
        expect(result.left.message).toContain("not found");
      }
    });

    it("includes all missing skills in error message", async () => {
      const current = makeCurrentState([
        makeFullSkillState("existing", makeGitHubSource("owner", "repo")),
      ]);

      const result = await Effect.runPromise(
        Effect.either(
          buildIdealForUninstall(current, makeUninstallCommand(["missing-a", "missing-b"])),
        ),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.message).toContain("missing-a");
        expect(result.left.message).toContain("missing-b");
      }
    });
  });

  describe("uninstall multiple skills", () => {
    it("removes all specified skills", async () => {
      const source = makeGitHubSource("owner", "repo");
      const current = makeCurrentState([
        makeFullSkillState("skill-a", source),
        makeFullSkillState("skill-b", source),
        makeFullSkillState("skill-c", source),
        makeFullSkillState("skill-d", source),
      ]);

      const result = await Effect.runPromise(
        buildIdealForUninstall(current, makeUninstallCommand(["skill-a", "skill-c"])),
      );

      expect(result.skills.map((s) => s.name).sort()).toEqual(["skill-b", "skill-d"]);
    });

    it("fails if any skill not found", async () => {
      const source = makeGitHubSource("owner", "repo");
      const current = makeCurrentState([
        makeFullSkillState("skill-a", source),
        makeFullSkillState("skill-b", source),
      ]);

      const result = await Effect.runPromise(
        Effect.either(
          buildIdealForUninstall(current, makeUninstallCommand(["skill-a", "non-existent"])),
        ),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.message).toContain("non-existent");
        expect(result.left.message).not.toContain("skill-a");
      }
    });
  });

  describe("remaining skills preserved", () => {
    it("converts locked data to ideal correctly", async () => {
      const source = makeLocalSource("/local/path");
      const current = makeCurrentState([
        makeFullSkillState("local-skill", source, ["claude", "gemini"]),
        makeFullSkillState("remove-me", makeGitHubSource("owner", "repo")),
      ]);

      const result = await Effect.runPromise(
        buildIdealForUninstall(current, makeUninstallCommand(["remove-me"])),
      );

      expect(result.skills).toHaveLength(1);
      const remaining = result.skills[0];
      expect(remaining?.name).toBe("local-skill");
      expect(remaining?.source.source).toBe("local");
      expect(remaining?.agents).toEqual(["claude", "gemini"]);
    });

    it("excludes skills without locked data from ideal", async () => {
      const source = makeGitHubSource("owner", "repo");
      // Skill without locked data (orphaned) should not appear in ideal
      const orphanedState: SkillStateV2 = {
        name: "orphaned",
        actual: Option.some({
          name: "orphaned",
          path: "/test/skills/orphaned",
          files: ["SKILL.md"],
          frontmatter: Option.some({
            name: Option.some("orphaned"),
            description: Option.none(),
            version: Option.none(),
            triggers: Option.none(),
          }),
          issues: [],
        }),
        locked: Option.none(),
        issues: [],
      };
      const current = makeCurrentState([orphanedState, makeFullSkillState("normal-skill", source)]);

      const result = await Effect.runPromise(
        buildIdealForUninstall(current, makeUninstallCommand(["normal-skill"])),
      );

      // Orphaned skill has no locked data, so cannot be converted to ideal
      expect(result.skills).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("handles empty current state", async () => {
      const current = makeCurrentState([]);

      const result = await Effect.runPromise(
        Effect.either(buildIdealForUninstall(current, makeUninstallCommand(["any-skill"]))),
      );

      expect(result._tag).toBe("Left");
    });

    it("handles uninstall all skills", async () => {
      const source = makeGitHubSource("owner", "repo");
      const current = makeCurrentState([
        makeFullSkillState("skill-a", source),
        makeFullSkillState("skill-b", source),
      ]);

      const result = await Effect.runPromise(
        buildIdealForUninstall(current, makeUninstallCommand(["skill-a", "skill-b"])),
      );

      expect(result.skills).toEqual([]);
    });

    it("handles empty skills array in command", async () => {
      const source = makeGitHubSource("owner", "repo");
      const current = makeCurrentState([makeFullSkillState("skill-a", source)]);

      const result = await Effect.runPromise(
        buildIdealForUninstall(current, makeUninstallCommand([])),
      );

      // No skills to uninstall, keep all
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("skill-a");
    });
  });
});

// =============================================================================
// buildIdealState Dispatch Tests
// =============================================================================

describe("buildIdealState", () => {
  describe("command type discrimination", () => {
    it("dispatches skills-install to buildIdealForInstall", async () => {
      const current = makeCurrentState([]);
      const cmd: InstallCommand = {
        _tag: "skills-install",
        source: "github:owner/repo",
        agents: ["claude"],
        skills: ["commit", "review-pr"],
        force: false,
      };

      const result = await Effect.runPromise(
        buildIdealState(current, cmd, {
          parseSource: mockParseSource,
          discoverSkills: mockDiscoverSkills,
          fetchLatestVersion: () =>
            Effect.succeed({ version: Option.none(), gitTreeHash: Option.some("latest") }),
        }),
      );

      // Should successfully return IdealState from install builder
      expect(result.skills).toHaveLength(2);
      expect(result.skills.map((s) => s.name).sort()).toEqual(["commit", "review-pr"]);
    });

    it("dispatches skills-uninstall to buildIdealForUninstall", async () => {
      const source = makeGitHubSource("owner", "repo");
      const existingLocked = makeLockedSkill("my-skill", source, ["claude"]);
      const current = makeCurrentState([makeSkillState("my-skill", Option.some(existingLocked))]);
      const cmd: UninstallCommand = {
        _tag: "skills-uninstall",
        skills: ["my-skill"],
      };

      const result = await Effect.runPromise(
        buildIdealState(current, cmd, {
          parseSource: mockParseSource,
          discoverSkills: mockDiscoverSkills,
          fetchLatestVersion: () =>
            Effect.succeed({ version: Option.none(), gitTreeHash: Option.some("latest") }),
        }),
      );

      // Should successfully return IdealState from uninstall builder
      expect(result.skills).toHaveLength(0);
    });

    it("dispatches skills-update to buildIdealForUpdate", async () => {
      const source = makeGitHubSource("owner", "repo");
      const existingLocked = makeLockedSkill("my-skill", source, ["claude"]);
      const current = makeCurrentState([makeSkillState("my-skill", Option.some(existingLocked))]);
      const cmd: UpdateCommand = {
        _tag: "skills-update",
        skills: "all",
      };

      const result = await Effect.runPromise(
        buildIdealState(current, cmd, {
          parseSource: mockParseSource,
          discoverSkills: mockDiscoverSkills,
          fetchLatestVersion: () =>
            Effect.succeed({ version: Option.none(), gitTreeHash: Option.some("newHash") }),
        }),
      );

      // Should successfully return IdealState from update builder
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("my-skill");
      // Updated gitTreeHash from fetchLatestVersion
      expect(Option.getOrNull(result.skills[0]?.gitTreeHash ?? Option.none())).toBe("newHash");
    });
  });

  describe("exhaustive command handling", () => {
    it("handles all command variants without runtime errors", async () => {
      const source = makeGitHubSource("owner", "repo");
      const existingLocked = makeLockedSkill("my-skill", source, ["claude"]);
      const current = makeCurrentState([makeSkillState("my-skill", Option.some(existingLocked))]);

      const deps = {
        parseSource: mockParseSource,
        discoverSkills: mockDiscoverSkills,
        fetchLatestVersion: () =>
          Effect.succeed({ version: Option.none(), gitTreeHash: Option.some("latest") }),
      };

      const commands: Command[] = [
        {
          _tag: "skills-install",
          source: "github:test/repo",
          agents: ["claude"],
          skills: ["commit", "review-pr"],
          force: false,
        },
        { _tag: "skills-uninstall", skills: ["my-skill"] },
        { _tag: "skills-update", skills: "all" },
      ];

      for (const cmd of commands) {
        // Should not throw - dispatch handles all variants
        const result = await Effect.runPromise(
          buildIdealState(current, cmd, deps).pipe(Effect.either),
        );

        expect(result).toBeDefined();
        expect(result._tag).toMatch(/^(Right|Left)$/);
      }
    });
  });

  describe("error propagation", () => {
    it("propagates errors from buildIdealForInstall", async () => {
      const current = makeCurrentState([]);
      const cmd: InstallCommand = {
        _tag: "skills-install",
        source: "github:owner/repo",
        agents: ["claude"],
        skills: ["commit", "review-pr"],
        force: false,
      };

      const result = await Effect.runPromise(
        Effect.either(
          buildIdealState(current, cmd, {
            parseSource: () =>
              Effect.fail(new CommandError({ message: "Parse error", cause: Option.none() })),
            discoverSkills: mockDiscoverSkills,
            fetchLatestVersion: () =>
              Effect.succeed({ version: Option.none(), gitTreeHash: Option.some("latest") }),
          }),
        ),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(CommandError);
        expect(result.left.message).toContain("Parse error");
      }
    });

    it("propagates errors from buildIdealForUninstall", async () => {
      const current = makeCurrentState([]); // Empty - skill not found
      const cmd: UninstallCommand = {
        _tag: "skills-uninstall",
        skills: ["nonexistent-skill"],
      };

      const result = await Effect.runPromise(
        Effect.either(
          buildIdealState(current, cmd, {
            parseSource: mockParseSource,
            discoverSkills: mockDiscoverSkills,
            fetchLatestVersion: () =>
              Effect.succeed({ version: Option.none(), gitTreeHash: Option.some("latest") }),
          }),
        ),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(CommandError);
        expect(result.left.message).toContain("not found");
      }
    });

    it("propagates errors from buildIdealForUpdate", async () => {
      const current = makeCurrentState([]); // Empty - nothing to update
      const cmd: UpdateCommand = {
        _tag: "skills-update",
        skills: ["nonexistent-skill"],
      };

      const result = await Effect.runPromise(
        Effect.either(
          buildIdealState(current, cmd, {
            parseSource: mockParseSource,
            discoverSkills: mockDiscoverSkills,
            fetchLatestVersion: () =>
              Effect.succeed({ version: Option.none(), gitTreeHash: Option.some("latest") }),
          }),
        ),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(CommandError);
        expect(result.left.message).toContain("not found");
      }
    });
  });
});

// =============================================================================
// Command Type Tests
// =============================================================================

describe("Command type", () => {
  describe("InstallCommand variant", () => {
    it("has correct _tag", () => {
      const cmd: InstallCommand = {
        _tag: "skills-install",
        source: "github:owner/repo",
        agents: [],
        skills: ["commit"],
        force: false,
      };

      expect(cmd._tag).toBe("skills-install");
    });

    it("skills is a non-empty array of names", () => {
      const cmd: InstallCommand = {
        _tag: "skills-install",
        source: "test",
        agents: [],
        skills: ["a", "b"],
        force: false,
      };

      expect(cmd.skills).toEqual(["a", "b"]);
    });
  });

  describe("UninstallCommand variant", () => {
    it("has correct _tag", () => {
      const cmd: UninstallCommand = {
        _tag: "skills-uninstall",
        skills: ["my-skill"],
      };

      expect(cmd._tag).toBe("skills-uninstall");
    });

    it("contains skills array", () => {
      const cmd: UninstallCommand = {
        _tag: "skills-uninstall",
        skills: ["skill-a", "skill-b"],
      };

      expect(cmd.skills).toEqual(["skill-a", "skill-b"]);
    });
  });

  describe("UpdateCommand variant", () => {
    it("has correct _tag", () => {
      const cmd: UpdateCommand = {
        _tag: "skills-update",
        skills: "all",
      };

      expect(cmd._tag).toBe("skills-update");
    });

    it("supports skills as 'all' or array", () => {
      const cmdAll: UpdateCommand = { _tag: "skills-update", skills: "all" };
      const cmdArray: UpdateCommand = { _tag: "skills-update", skills: ["a"] };

      expect(cmdAll.skills).toBe("all");
      expect(cmdArray.skills).toEqual(["a"]);
    });
  });
});

// =============================================================================
// CommandError Tests
// =============================================================================

describe("CommandError", () => {
  it("has correct _tag", () => {
    const error = new CommandError({
      message: "test error",
      cause: Option.none(),
    });

    expect(error._tag).toBe("CommandError");
  });

  it("contains message", () => {
    const error = new CommandError({
      message: "Something went wrong",
      cause: Option.none(),
    });

    expect(error.message).toBe("Something went wrong");
  });

  it("can include cause", () => {
    const originalError = new Error("original");
    const error = new CommandError({
      message: "Wrapped error",
      cause: Option.some(originalError),
    });

    expect(Option.isSome(error.cause)).toBe(true);
    expect(Option.getOrNull(error.cause)).toBe(originalError);
  });
});

// =============================================================================
// buildIdealFromOperations Tests (operation-based API)
// =============================================================================

/** Helper to create an add-skill operation */
const makeAddOp = (
  name: string,
  source: Source,
  agents: ReadonlyArray<string> = ["claude"],
  force = false,
  gitTreeHash: Option.Option<string> = Option.some("hash-" + name),
): AddSkillOperation => ({
  _tag: "add-skill",
  source,
  agents,
  skill: { name, version: Option.none(), gitTreeHash },
  force,
});

/** Helper to create a remove-skill operation */
const makeRemoveOp = (name: string): RemoveSkillOperation => ({
  _tag: "remove-skill",
  name,
});

describe("buildIdealFromOperations", () => {
  describe("add-skill operations", () => {
    it("adds a new skill to empty state", async () => {
      const current = makeCurrentState([]);
      const source = makeGitHubSource("owner", "repo");
      const ops = [makeAddOp("commit", source)];

      const result = await Effect.runPromise(buildIdealFromOperations(current, ops));

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("commit");
      expect(result.skills[0]?.agents).toEqual(["claude"]);
    });

    it("adds multiple skills", async () => {
      const current = makeCurrentState([]);
      const source = makeGitHubSource("owner", "repo");
      const ops = [makeAddOp("commit", source), makeAddOp("review-pr", source)];

      const result = await Effect.runPromise(buildIdealFromOperations(current, ops));

      expect(result.skills).toHaveLength(2);
      expect(result.skills.map((s) => s.name).sort()).toEqual(["commit", "review-pr"]);
    });

    it("preserves existing skills when adding new ones", async () => {
      const existingSource = makeGitHubSource("existing-owner", "existing-repo");
      const existingLocked = makeLockedSkill("existing-skill", existingSource, ["cursor"]);
      const current = makeCurrentState([
        makeSkillState("existing-skill", Option.some(existingLocked)),
      ]);
      const source = makeGitHubSource("owner", "repo");
      const ops = [makeAddOp("commit", source)];

      const result = await Effect.runPromise(buildIdealFromOperations(current, ops));

      expect(result.skills).toHaveLength(2);
      const existing = result.skills.find((s) => s.name === "existing-skill");
      expect(existing).toBeDefined();
      expect(existing?.agents).toEqual(["cursor"]);
    });

    it("allows reinstall from same source", async () => {
      const source = makeGitHubSource("owner", "repo");
      const locked = makeLockedSkill("commit", source, ["cursor"]);
      const current = makeCurrentState([makeSkillState("commit", Option.some(locked))]);
      const ops = [makeAddOp("commit", source, ["claude"])];

      const result = await Effect.runPromise(buildIdealFromOperations(current, ops));

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("commit");
      expect(result.skills[0]?.agents).toEqual(["claude"]);
    });

    it("fails when skill exists from different source without force", async () => {
      const differentSource = makeGitHubSource("different-owner", "different-repo");
      const locked = makeLockedSkill("commit", differentSource, ["cursor"]);
      const current = makeCurrentState([makeSkillState("commit", Option.some(locked))]);
      const source = makeGitHubSource("owner", "repo");
      const ops = [makeAddOp("commit", source, ["claude"], false)];

      const result = await Effect.runPromise(Effect.either(buildIdealFromOperations(current, ops)));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(CommandError);
        expect(result.left.message).toContain("commit");
        expect(result.left.message).toContain("different source");
      }
    });

    it("allows replacement from different source with force", async () => {
      const differentSource = makeGitHubSource("different-owner", "different-repo");
      const locked = makeLockedSkill("commit", differentSource, ["cursor"]);
      const current = makeCurrentState([makeSkillState("commit", Option.some(locked))]);
      const source = makeGitHubSource("owner", "repo");
      const ops = [makeAddOp("commit", source, ["claude"], true)];

      const result = await Effect.runPromise(buildIdealFromOperations(current, ops));

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("commit");
      expect(result.skills[0]?.agents).toEqual(["claude"]);
    });

    it("assigns specified agents to installed skills", async () => {
      const current = makeCurrentState([]);
      const source = makeGitHubSource("owner", "repo");
      const ops = [makeAddOp("commit", source, ["claude", "cursor", "codex"])];

      const result = await Effect.runPromise(buildIdealFromOperations(current, ops));

      expect(result.skills[0]?.agents).toEqual(["claude", "cursor", "codex"]);
    });
  });

  describe("remove-skill operations", () => {
    it("removes skill from ideal state", async () => {
      const source = makeGitHubSource("owner", "repo");
      const current = makeCurrentState([
        makeFullSkillState("skill-a", source),
        makeFullSkillState("skill-b", source),
        makeFullSkillState("skill-c", source),
      ]);
      const ops = [makeRemoveOp("skill-b")];

      const result = await Effect.runPromise(buildIdealFromOperations(current, ops));

      expect(result.skills.map((s) => s.name).sort()).toEqual(["skill-a", "skill-c"]);
    });

    it("preserves remaining skills with correct data", async () => {
      const source = makeGitHubSource("anthropic", "skills");
      const current = makeCurrentState([
        makeFullSkillState("keep-skill", source, ["claude", "cursor"]),
        makeFullSkillState("remove-skill", makeGitHubSource("other", "repo")),
      ]);
      const ops = [makeRemoveOp("remove-skill")];

      const result = await Effect.runPromise(buildIdealFromOperations(current, ops));

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("keep-skill");
      expect(result.skills[0]?.agents).toEqual(["claude", "cursor"]);
    });

    it("fails when skill not found", async () => {
      const current = makeCurrentState([
        makeFullSkillState("existing-skill", makeGitHubSource("owner", "repo")),
      ]);
      const ops = [makeRemoveOp("non-existent")];

      const result = await Effect.runPromise(Effect.either(buildIdealFromOperations(current, ops)));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(CommandError);
        expect(result.left.message).toContain("non-existent");
        expect(result.left.message).toContain("not found");
      }
    });

    it("removes multiple skills", async () => {
      const source = makeGitHubSource("owner", "repo");
      const current = makeCurrentState([
        makeFullSkillState("skill-a", source),
        makeFullSkillState("skill-b", source),
        makeFullSkillState("skill-c", source),
        makeFullSkillState("skill-d", source),
      ]);
      const ops = [makeRemoveOp("skill-a"), makeRemoveOp("skill-c")];

      const result = await Effect.runPromise(buildIdealFromOperations(current, ops));

      expect(result.skills.map((s) => s.name).sort()).toEqual(["skill-b", "skill-d"]);
    });
  });

  describe("mixed operations", () => {
    it("handles add and remove in same batch", async () => {
      const source = makeGitHubSource("owner", "repo");
      const current = makeCurrentState([makeFullSkillState("old-skill", source)]);
      const newSource = makeGitHubSource("new-owner", "new-repo");
      const ops = [makeRemoveOp("old-skill"), makeAddOp("new-skill", newSource)];

      const result = await Effect.runPromise(buildIdealFromOperations(current, ops));

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("new-skill");
    });

    it("handles empty operations array", async () => {
      const source = makeGitHubSource("owner", "repo");
      const locked = makeLockedSkill("existing", source, ["claude"]);
      const current = makeCurrentState([makeSkillState("existing", Option.some(locked))]);

      const result = await Effect.runPromise(buildIdealFromOperations(current, []));

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("existing");
    });
  });

  describe("edge cases", () => {
    it("excludes orphaned skills (no locked data) from initial state", async () => {
      const orphanedState: SkillStateV2 = {
        name: "orphaned",
        actual: Option.some({
          name: "orphaned",
          path: "/test/skills/orphaned",
          files: ["SKILL.md"],
          frontmatter: Option.none(),
          issues: [],
        }),
        locked: Option.none(),
        issues: [],
      };
      const source = makeGitHubSource("owner", "repo");
      const current = makeCurrentState([orphanedState, makeFullSkillState("normal", source)]);

      const result = await Effect.runPromise(buildIdealFromOperations(current, []));

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("normal");
    });
  });
});
