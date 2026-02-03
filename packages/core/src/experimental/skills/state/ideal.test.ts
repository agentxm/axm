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
import { buildIdealForInstall, buildIdealForSync, buildIdealForUninstall } from "./ideal.js";
import type { ActualSkill, LockedSkill, SkillState, SkillsState } from "./types.js";
import { SkillSource, SkillValidity } from "./types.js";

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
        type: "local" as const,
        original: skillsDir,
        canonical: skillsDir,
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
    expect(result.skills["new-skill"]?.source._tag).toBe("Local");
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
        type: "local" as const,
        original: skillsDir,
        canonical: skillsDir,
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
        type: "local" as const,
        original: skillsDir,
        canonical: skillsDir,
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
