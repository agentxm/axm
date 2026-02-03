/**
 * Tests for state loading module.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as os from "node:os";
import * as nodePath from "node:path";
import { FileSystem, type Path } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Lockfile } from "../../schemas/lockfile.js";
import { writeLockfile } from "../lockfile.js";
import { computeValidity, loadActualSkills, loadLockedSkills, loadSkillsState } from "./load.js";
import type { ActualSkill, LockedSkill } from "./types.js";

// Test helpers
const runEffect = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeContext.layer)));

describe("loadActualSkills", () => {
  let tempDir: string;
  let axmDir: string;
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
    axmDir = nodePath.join(tempDir, ".axm");
    skillsDir = nodePath.join(axmDir, "skills");
  });

  afterEach(async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(tempDir, { recursive: true });
      }),
    );
  });

  it("returns empty record when skills directory does not exist", async () => {
    const result = await runEffect(loadActualSkills(axmDir));
    expect(result).toEqual({});
  });

  it("returns empty record when skills directory is empty", async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillsDir, { recursive: true });
      }),
    );

    const result = await runEffect(loadActualSkills(axmDir));
    expect(result).toEqual({});
  });

  it("loads a skill from disk", async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const skillDir = nodePath.join(skillsDir, "my-skill");
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillDir, "SKILL.md"),
          `---
name: my-skill
description: A test skill
---

# My Skill

Content here.
`,
        );
      }),
    );

    const result = await runEffect(loadActualSkills(axmDir));

    expect(Object.keys(result)).toEqual(["my-skill"]);
    const skill = result["my-skill"];
    expect(skill).toBeDefined();
    expect(skill?.name).toBe("my-skill");
    expect(skill?.path).toBe(nodePath.join(skillsDir, "my-skill"));
    expect(Option.isSome(skill?.frontmatter ?? Option.none())).toBe(true);
    if (skill && Option.isSome(skill.frontmatter)) {
      expect(skill.frontmatter.value.name).toBe("my-skill");
      expect(skill.frontmatter.value.description).toBe("A test skill");
    }
  });

  it("handles skill with empty SKILL.md", async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const skillDir = nodePath.join(skillsDir, "empty-skill");
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(nodePath.join(skillDir, "SKILL.md"), "");
      }),
    );

    const result = await runEffect(loadActualSkills(axmDir));

    expect(Object.keys(result)).toEqual(["empty-skill"]);
    const skill = result["empty-skill"];
    expect(skill).toBeDefined();
    expect(skill?.content).toBe("");
    expect(Option.isNone(skill?.frontmatter ?? Option.some({}))).toBe(true);
  });

  it("loads multiple skills", async () => {
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

    const result = await runEffect(loadActualSkills(axmDir));

    expect(Object.keys(result).sort()).toEqual(["skill-a", "skill-b", "skill-c"]);
  });
});

describe("loadLockedSkills", () => {
  let tempDir: string;
  let axmDir: string;

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
    axmDir = nodePath.join(tempDir, ".axm");
  });

  afterEach(async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(tempDir, { recursive: true });
      }),
    );
  });

  it("returns empty record when lockfile does not exist", async () => {
    const result = await runEffect(loadLockedSkills(axmDir));
    expect(result).toEqual({});
  });

  it("loads skills from lockfile", async () => {
    const lockfile: Lockfile = {
      lockfileVersion: 1,
      skills: {
        "my-skill": {
          name: "my-skill",
          source: { _tag: "GitHub", owner: "owner", repo: "repo" },
          gitTreeHash: "abc123",
          agents: [],
          installedAt: new Date("2024-01-01T00:00:00.000Z"),
          updatedAt: new Date("2024-01-02T00:00:00.000Z"),
        },
      },
    };

    await runEffect(writeLockfile(axmDir, lockfile));
    const result = await runEffect(loadLockedSkills(axmDir));

    expect(Object.keys(result)).toEqual(["my-skill"]);
    const skill = result["my-skill"];
    expect(skill).toBeDefined();
    expect(skill?.source).toBe("github:owner/repo");
    expect(skill?.gitTreeFolderHash).toBe("abc123");
  });
});

describe("computeValidity", () => {
  const makeActualSkill = (overrides: Partial<ActualSkill> = {}): ActualSkill => ({
    name: "test-skill",
    path: "/test/skill",
    frontmatter: Option.some({ name: "test-skill", description: "A test skill" }),
    content: "# Test\nContent",
    gitTreeFolderHash: "abc123",
    files: ["SKILL.md"],
    lastModified: new Date(),
    ...overrides,
  });

  const makeLockedSkill = (overrides: Partial<LockedSkill> = {}): LockedSkill => ({
    source: "github:owner/repo",
    origin: "https://github.com/owner/repo",
    path: Option.none(),
    ref: Option.none(),
    version: Option.none(),
    gitTreeFolderHash: "abc123",
    installedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  it("returns Valid when actual and locked match", () => {
    const actual = makeActualSkill();
    const locked = makeLockedSkill();

    const result = computeValidity(Option.some(actual), Option.some(locked));
    expect(result._tag).toBe("Valid");
  });

  it("returns Orphaned when skill exists on disk but not in lockfile", () => {
    const actual = makeActualSkill();

    const result = computeValidity(Option.some(actual), Option.none());
    expect(result._tag).toBe("Orphaned");
  });

  it("returns Missing when skill exists in lockfile but not on disk", () => {
    const locked = makeLockedSkill();

    const result = computeValidity(Option.none(), Option.some(locked));
    expect(result._tag).toBe("Missing");
    if (result._tag === "Missing") {
      expect(result.code).toBe("E004");
    }
  });

  it("returns HashMismatch when hashes differ", () => {
    const actual = makeActualSkill({ gitTreeFolderHash: "actual-hash" });
    const locked = makeLockedSkill({ gitTreeFolderHash: "expected-hash" });

    const result = computeValidity(Option.some(actual), Option.some(locked));
    expect(result._tag).toBe("HashMismatch");
    if (result._tag === "HashMismatch") {
      expect(result.expected).toBe("expected-hash");
      expect(result.actual).toBe("actual-hash");
    }
  });

  it("returns MissingSkillMd when content is empty", () => {
    const actual = makeActualSkill({ content: "" });
    const locked = makeLockedSkill();

    const result = computeValidity(Option.some(actual), Option.some(locked));
    expect(result._tag).toBe("MissingSkillMd");
  });

  it("returns MissingDescription when frontmatter lacks description", () => {
    const actual = makeActualSkill({
      frontmatter: Option.some({ name: "test-skill" }),
    });
    const locked = makeLockedSkill();

    const result = computeValidity(Option.some(actual), Option.some(locked));
    expect(result._tag).toBe("MissingDescription");
  });

  it("returns NameMismatch when frontmatter name differs from directory", () => {
    const actual = makeActualSkill({
      name: "dir-name",
      frontmatter: Option.some({ name: "different-name", description: "test" }),
    });
    const locked = makeLockedSkill();

    const result = computeValidity(Option.some(actual), Option.some(locked));
    expect(result._tag).toBe("NameMismatch");
    if (result._tag === "NameMismatch") {
      expect(result.frontmatterName).toBe("different-name");
      expect(result.directoryName).toBe("dir-name");
    }
  });

  it("returns Multiple when multiple issues exist", () => {
    const actual = makeActualSkill({
      name: "dir-name",
      frontmatter: Option.some({ name: "different-name" }),
      gitTreeFolderHash: "actual-hash",
    });
    const locked = makeLockedSkill({ gitTreeFolderHash: "expected-hash" });

    const result = computeValidity(Option.some(actual), Option.some(locked));
    expect(result._tag).toBe("Multiple");
    if (result._tag === "Multiple") {
      expect(result.issues.length).toBeGreaterThan(1);
    }
  });
});

describe("loadSkillsState", () => {
  let tempDir: string;
  let axmDir: string;
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
    axmDir = nodePath.join(tempDir, ".axm");
    skillsDir = nodePath.join(axmDir, "skills");
  });

  afterEach(async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(tempDir, { recursive: true });
      }),
    );
  });

  it("returns empty state when no skills exist", async () => {
    const result = await runEffect(loadSkillsState(axmDir));
    expect(result.skills).toEqual({});
  });

  it("merges actual and locked state", async () => {
    // Create skill on disk
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const skillDir = nodePath.join(skillsDir, "my-skill");
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillDir, "SKILL.md"),
          `---
name: my-skill
description: Test skill
---
# My Skill
`,
        );
      }),
    );

    const result = await runEffect(loadSkillsState(axmDir));

    expect(Object.keys(result.skills)).toEqual(["my-skill"]);
    const skill = result.skills["my-skill"];
    expect(skill).toBeDefined();
    expect(Option.isSome(skill?.actual ?? Option.none())).toBe(true);
    expect(Option.isNone(skill?.locked ?? Option.some({} as LockedSkill))).toBe(true);
    expect(skill?.validity._tag).toBe("Orphaned");
  });

  it("detects missing skill (in lockfile but not on disk)", async () => {
    const lockfile: Lockfile = {
      lockfileVersion: 1,
      skills: {
        "missing-skill": {
          name: "missing-skill",
          source: { _tag: "GitHub", owner: "owner", repo: "repo" },
          gitTreeHash: "abc123",
          agents: [],
          installedAt: new Date("2024-01-01T00:00:00.000Z"),
          updatedAt: new Date("2024-01-01T00:00:00.000Z"),
        },
      },
    };

    await runEffect(writeLockfile(axmDir, lockfile));
    const result = await runEffect(loadSkillsState(axmDir));

    expect(Object.keys(result.skills)).toEqual(["missing-skill"]);
    const skill = result.skills["missing-skill"];
    expect(skill).toBeDefined();
    expect(Option.isNone(skill?.actual ?? Option.some({} as ActualSkill))).toBe(true);
    expect(Option.isSome(skill?.locked ?? Option.none())).toBe(true);
    expect(skill?.validity._tag).toBe("Missing");
  });
});
