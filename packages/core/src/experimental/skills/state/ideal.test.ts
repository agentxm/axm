/**
 * Tests for ideal state builders module.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as os from "node:os";
import * as nodePath from "node:path";
import { FileSystem, type Path } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ParsedSource } from "../types.js";
import {
  buildIdealForInstall,
  buildIdealForSync,
  buildIdealForUninstall,
  buildIdealForUpdate,
  type FetchLatestVersion,
} from "./ideal.js";
import type {
  ActualSkill,
  CurrentState,
  LockedSkill,
  LockedSkillV2,
  SkillSourceV2,
  SkillState,
  SkillStateV2,
  SkillsState,
} from "./types.js";
import { SkillValidity } from "./types.js";

// Test helpers
const runEffect = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeContext.layer)));

const makeActualSkill = (name: string, path: string, hash = "abc123"): ActualSkill => ({
  name,
  path,
  frontmatter: Option.some({ name, description: "test" }),
  content: "# Test",
  gitTreeFolderHash: hash,
  files: ["SKILL.md"],
  lastModified: new Date(),
});

const makeLockedSkill = (hash = "abc123"): LockedSkill => ({
  source: "github:owner/repo",
  origin: "https://github.com/owner/repo",
  path: Option.none(),
  ref: Option.none(),
  version: Option.none(),
  gitTreeFolderHash: hash,
  installedAt: new Date(),
  updatedAt: new Date(),
});

const makeSkillState = (
  name: string,
  path: string,
  options: {
    hash?: string;
    hasLocked?: boolean;
    validity?: ReturnType<(typeof SkillValidity)["Valid"]>;
  } = {},
): SkillState => ({
  name,
  actual: Option.some(makeActualSkill(name, path, options.hash ?? "abc123")),
  locked: options.hasLocked !== false ? Option.some(makeLockedSkill(options.hash)) : Option.none(),
  validity: options.validity ?? SkillValidity.Valid(),
});

describe("buildIdealForInstall", () => {
  let tempDir: string;
  let skillsDir: string;

  beforeEach(async () => {
    tempDir = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmpBase = os.tmpdir();
        const dir = nodePath.join(tmpBase, `axm-test-${Date.now()}`);
        yield* fs.makeDirectory(dir, { recursive: true });
        return dir;
      }),
    );
    skillsDir = nodePath.join(tempDir, "skills");
  });

  afterEach(async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(tempDir, { recursive: true });
      }),
    );
  });

  it("discovers and builds ideal for new skills", async () => {
    // Create skill in source directory
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const skillDir = nodePath.join(skillsDir, "new-skill");
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillDir, "SKILL.md"),
          `---
name: new-skill
description: A new skill
---
# New Skill
`,
        );
      }),
    );

    const current: SkillsState = { skills: {} };
    const source = {
      parsed: {
        type: "github" as const,
        original: skillsDir,
        canonical: `github:test/repo`,
        owner: "test",
        repo: "repo",
      } as ParsedSource,
      skillsDir,
    };

    const result = await runEffect(
      buildIdealForInstall(current, source, {
        global: false,
        agents: ["claude-code"],
        force: false,
        skills: [],
        all: true,
      }),
    );

    expect(Object.keys(result.skills)).toEqual(["new-skill"]);
    expect(result.skills["new-skill"]?.name).toBe("new-skill");
    expect(result.skills["new-skill"]?.source._tag).toBe("Git");
    expect(result.removals).toEqual([]);
  });

  it("filters skills by --skill flag", async () => {
    // Create multiple skills in source directory
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        for (const name of ["skill-a", "skill-b", "skill-c"]) {
          const skillDir = nodePath.join(skillsDir, name);
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFileString(nodePath.join(skillDir, "SKILL.md"), `# ${name}\n`);
        }
      }),
    );

    const current: SkillsState = { skills: {} };
    const source = {
      parsed: {
        type: "github" as const,
        original: skillsDir,
        canonical: `github:test/repo`,
        owner: "test",
        repo: "repo",
      } as ParsedSource,
      skillsDir,
    };

    const result = await runEffect(
      buildIdealForInstall(current, source, {
        global: false,
        agents: [],
        force: false,
        skills: ["skill-a", "skill-c"],
        all: false,
      }),
    );

    expect(Object.keys(result.skills).sort()).toEqual(["skill-a", "skill-c"]);
  });

  it("skips existing skills unless force is true", async () => {
    // Create skill in source
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const skillDir = nodePath.join(skillsDir, "existing-skill");
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(nodePath.join(skillDir, "SKILL.md"), "# Existing\n");
      }),
    );

    const existingPath = nodePath.join(tempDir, "existing");
    const current: SkillsState = {
      skills: {
        "existing-skill": makeSkillState("existing-skill", existingPath),
      },
    };
    const source = {
      parsed: {
        type: "github" as const,
        original: skillsDir,
        canonical: `github:test/repo`,
        owner: "test",
        repo: "repo",
      } as ParsedSource,
      skillsDir,
    };

    // Without force
    const resultNoForce = await runEffect(
      buildIdealForInstall(current, source, {
        global: false,
        agents: [],
        force: false,
        skills: [],
        all: true,
      }),
    );

    // Should keep existing skill from current state
    expect(Object.keys(resultNoForce.skills)).toEqual(["existing-skill"]);

    // With force
    const resultForce = await runEffect(
      buildIdealForInstall(current, source, {
        global: false,
        agents: [],
        force: true,
        skills: [],
        all: true,
      }),
    );

    // Should include skill from source
    expect(Object.keys(resultForce.skills)).toEqual(["existing-skill"]);
  });
});

describe("buildIdealForUninstall", () => {
  it("marks specified skills for removal", async () => {
    const current: SkillsState = {
      skills: {
        "keep-skill": makeSkillState("keep-skill", "/test/keep"),
        "remove-skill": makeSkillState("remove-skill", "/test/remove"),
      },
    };

    const result = await runEffect(buildIdealForUninstall(current, ["remove-skill"]));

    expect(Object.keys(result.skills)).toEqual(["keep-skill"]);
    expect(result.removals).toEqual(["remove-skill"]);
  });

  it("ignores non-existent skills in removal list", async () => {
    const current: SkillsState = {
      skills: {
        existing: makeSkillState("existing", "/test/existing"),
      },
    };

    const result = await runEffect(buildIdealForUninstall(current, ["non-existent"]));

    expect(Object.keys(result.skills)).toEqual(["existing"]);
    expect(result.removals).toEqual([]);
  });

  it("removes multiple skills", async () => {
    const current: SkillsState = {
      skills: {
        "skill-a": makeSkillState("skill-a", "/test/a"),
        "skill-b": makeSkillState("skill-b", "/test/b"),
        "skill-c": makeSkillState("skill-c", "/test/c"),
      },
    };

    const result = await runEffect(buildIdealForUninstall(current, ["skill-a", "skill-c"]));

    expect(Object.keys(result.skills)).toEqual(["skill-b"]);
    expect([...result.removals].sort()).toEqual(["skill-a", "skill-c"]);
  });
});

describe("buildIdealForSync", () => {
  it("keeps locked skills and removes orphaned", async () => {
    const current: SkillsState = {
      skills: {
        "locked-skill": makeSkillState("locked-skill", "/test/locked", { hasLocked: true }),
        "orphaned-skill": makeSkillState("orphaned-skill", "/test/orphaned", { hasLocked: false }),
      },
    };

    const result = await runEffect(buildIdealForSync(current));

    expect(Object.keys(result.skills)).toEqual(["locked-skill"]);
    expect(result.removals).toEqual(["orphaned-skill"]);
  });

  it("returns empty state when no locked skills exist", async () => {
    const current: SkillsState = {
      skills: {
        orphaned: makeSkillState("orphaned", "/test/orphaned", { hasLocked: false }),
      },
    };

    const result = await runEffect(buildIdealForSync(current));

    expect(result.skills).toEqual({});
    expect(result.removals).toEqual(["orphaned"]);
  });
});

// =============================================================================
// buildIdealForUpdate tests (V2 - new reconciliation design)
// =============================================================================

// Helpers for V2 types
const makeLockedSkillV2 = (
  name: string,
  source: SkillSourceV2,
  options: { version?: string; gitTreeHash?: string; agents?: string[] } = {},
): LockedSkillV2 => ({
  name,
  source,
  version: Option.fromNullable(options.version),
  gitTreeHash: Option.fromNullable(options.gitTreeHash),
  agents: options.agents ?? ["claude"],
  installedAt: new Date(),
  updatedAt: new Date(),
});

const makeSkillStateV2 = (name: string, locked: LockedSkillV2 | null = null): SkillStateV2 => ({
  name,
  actual: Option.some({
    name,
    path: `/test/${name}`,
    files: ["SKILL.md"],
    frontmatter: Option.none(),
    issues: [],
  }),
  locked: Option.fromNullable(locked),
  issues: [],
});

const githubSource: SkillSourceV2 = {
  _tag: "GitHub",
  owner: "test-org",
  repo: "skills",
  ref: Option.some("main"),
  path: Option.none(),
};

const localSource: SkillSourceV2 = {
  _tag: "Local",
  path: "/local/skills",
};

describe("buildIdealForUpdate", () => {
  describe("update all skills", () => {
    it("updates all locked skills when skills is 'all'", async () => {
      const lockedA = makeLockedSkillV2("skill-a", githubSource, {
        gitTreeHash: "old-hash-a",
        agents: ["claude"],
      });
      const lockedB = makeLockedSkillV2("skill-b", githubSource, {
        gitTreeHash: "old-hash-b",
        agents: ["cursor"],
      });

      const current: CurrentState = {
        skills: [makeSkillStateV2("skill-a", lockedA), makeSkillStateV2("skill-b", lockedB)],
        issues: [],
      };

      // Mock fetchLatestVersion to return new hashes
      const fetchLatestVersion: FetchLatestVersion = (source) =>
        Effect.succeed({
          version: Option.none(),
          gitTreeHash: Option.some(source._tag === "GitHub" ? "new-hash-from-github" : "new-hash"),
        });

      const result = await Effect.runPromise(
        buildIdealForUpdate(current, { _tag: "skills-update", skills: "all" }, fetchLatestVersion),
      );

      expect(result.skills).toHaveLength(2);
      const skillA = result.skills.find((s) => s.name === "skill-a");
      const skillB = result.skills.find((s) => s.name === "skill-b");

      expect(skillA?.gitTreeHash).toEqual(Option.some("new-hash-from-github"));
      expect(skillA?.agents).toEqual(["claude"]);
      expect(skillB?.gitTreeHash).toEqual(Option.some("new-hash-from-github"));
      expect(skillB?.agents).toEqual(["cursor"]);
    });

    it("skips skills without locked state when updating all", async () => {
      const locked = makeLockedSkillV2("locked-skill", githubSource, {
        gitTreeHash: "old-hash",
      });

      const current: CurrentState = {
        skills: [
          makeSkillStateV2("locked-skill", locked),
          makeSkillStateV2("orphan-skill", null), // No locked state
        ],
        issues: [],
      };

      const fetchLatestVersion: FetchLatestVersion = () =>
        Effect.succeed({
          version: Option.none(),
          gitTreeHash: Option.some("new-hash"),
        });

      const result = await Effect.runPromise(
        buildIdealForUpdate(current, { _tag: "skills-update", skills: "all" }, fetchLatestVersion),
      );

      // Only locked-skill should be updated; orphan-skill has no locked state
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.name).toBe("locked-skill");
      expect(result.skills[0]?.gitTreeHash).toEqual(Option.some("new-hash"));
    });
  });

  describe("update specific skills", () => {
    it("updates only specified skills", async () => {
      const lockedA = makeLockedSkillV2("skill-a", githubSource, {
        gitTreeHash: "old-hash-a",
      });
      const lockedB = makeLockedSkillV2("skill-b", githubSource, {
        gitTreeHash: "old-hash-b",
      });
      const lockedC = makeLockedSkillV2("skill-c", githubSource, {
        gitTreeHash: "old-hash-c",
      });

      const current: CurrentState = {
        skills: [
          makeSkillStateV2("skill-a", lockedA),
          makeSkillStateV2("skill-b", lockedB),
          makeSkillStateV2("skill-c", lockedC),
        ],
        issues: [],
      };

      const fetchLatestVersion: FetchLatestVersion = () =>
        Effect.succeed({
          version: Option.none(),
          gitTreeHash: Option.some("new-hash"),
        });

      const result = await Effect.runPromise(
        buildIdealForUpdate(
          current,
          { _tag: "skills-update", skills: ["skill-a", "skill-c"] },
          fetchLatestVersion,
        ),
      );

      expect(result.skills).toHaveLength(3);

      const skillA = result.skills.find((s) => s.name === "skill-a");
      const skillB = result.skills.find((s) => s.name === "skill-b");
      const skillC = result.skills.find((s) => s.name === "skill-c");

      // skill-a and skill-c should have new hash
      expect(skillA?.gitTreeHash).toEqual(Option.some("new-hash"));
      expect(skillC?.gitTreeHash).toEqual(Option.some("new-hash"));
      // skill-b should retain old hash (unchanged)
      expect(skillB?.gitTreeHash).toEqual(Option.some("old-hash-b"));
    });

    it("keeps unchanged skills in ideal state", async () => {
      const lockedA = makeLockedSkillV2("skill-a", githubSource, {
        gitTreeHash: "hash-a",
        agents: ["claude", "cursor"],
      });
      const lockedB = makeLockedSkillV2("skill-b", localSource, {
        gitTreeHash: "hash-b",
        agents: ["codex"],
      });

      const current: CurrentState = {
        skills: [makeSkillStateV2("skill-a", lockedA), makeSkillStateV2("skill-b", lockedB)],
        issues: [],
      };

      const fetchLatestVersion: FetchLatestVersion = () =>
        Effect.succeed({
          version: Option.none(),
          gitTreeHash: Option.some("updated-hash"),
        });

      const result = await Effect.runPromise(
        buildIdealForUpdate(
          current,
          { _tag: "skills-update", skills: ["skill-a"] },
          fetchLatestVersion,
        ),
      );

      expect(result.skills).toHaveLength(2);

      const skillA = result.skills.find((s) => s.name === "skill-a");
      const skillB = result.skills.find((s) => s.name === "skill-b");

      // skill-a updated
      expect(skillA?.gitTreeHash).toEqual(Option.some("updated-hash"));
      expect(skillA?.agents).toEqual(["claude", "cursor"]);

      // skill-b unchanged
      expect(skillB?.gitTreeHash).toEqual(Option.some("hash-b"));
      expect(skillB?.source._tag).toBe("Local");
      expect(skillB?.agents).toEqual(["codex"]);
    });
  });

  describe("error handling", () => {
    it("fails when requested skill does not exist", async () => {
      const locked = makeLockedSkillV2("existing-skill", githubSource);

      const current: CurrentState = {
        skills: [makeSkillStateV2("existing-skill", locked)],
        issues: [],
      };

      const fetchLatestVersion: FetchLatestVersion = () =>
        Effect.succeed({
          version: Option.none(),
          gitTreeHash: Option.some("hash"),
        });

      const result = await Effect.runPromise(
        buildIdealForUpdate(
          current,
          { _tag: "skills-update", skills: ["non-existent"] },
          fetchLatestVersion,
        ).pipe(Effect.flip),
      );

      expect(result._tag).toBe("CommandError");
      expect(result.message).toContain("Skills not found");
      expect(result.message).toContain("non-existent");
    });

    it("fails with multiple not found skills listed", async () => {
      const locked = makeLockedSkillV2("skill-a", githubSource);

      const current: CurrentState = {
        skills: [makeSkillStateV2("skill-a", locked)],
        issues: [],
      };

      const fetchLatestVersion: FetchLatestVersion = () =>
        Effect.succeed({
          version: Option.none(),
          gitTreeHash: Option.some("hash"),
        });

      const result = await Effect.runPromise(
        buildIdealForUpdate(
          current,
          { _tag: "skills-update", skills: ["missing-1", "missing-2"] },
          fetchLatestVersion,
        ).pipe(Effect.flip),
      );

      expect(result._tag).toBe("CommandError");
      expect(result.message).toContain("missing-1");
      expect(result.message).toContain("missing-2");
    });

    it("does not fail when updating 'all' with no locked skills", async () => {
      const current: CurrentState = {
        skills: [makeSkillStateV2("orphan", null)],
        issues: [],
      };

      const fetchLatestVersion: FetchLatestVersion = () =>
        Effect.succeed({
          version: Option.none(),
          gitTreeHash: Option.some("hash"),
        });

      const result = await Effect.runPromise(
        buildIdealForUpdate(current, { _tag: "skills-update", skills: "all" }, fetchLatestVersion),
      );

      // Should return empty ideal state (no skills to update)
      expect(result.skills).toHaveLength(0);
    });
  });

  describe("version handling", () => {
    it("preserves version from fetchLatestVersion for registry sources", async () => {
      const registrySource: SkillSourceV2 = {
        _tag: "Registry",
        location: { _tag: "Remote", url: "https://registry.example.com" },
        scope: "official",
        name: "skill",
        version: Option.some("1.0.0"),
      };

      const locked = makeLockedSkillV2("registry-skill", registrySource, {
        version: "1.0.0",
      });

      const current: CurrentState = {
        skills: [makeSkillStateV2("registry-skill", locked)],
        issues: [],
      };

      const fetchLatestVersion: FetchLatestVersion = () =>
        Effect.succeed({
          version: Option.some("2.0.0"),
          gitTreeHash: Option.none(),
        });

      const result = await Effect.runPromise(
        buildIdealForUpdate(current, { _tag: "skills-update", skills: "all" }, fetchLatestVersion),
      );

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]?.version).toEqual(Option.some("2.0.0"));
    });
  });
});
