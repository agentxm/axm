/**
 * Tests for apply module - executing the diff/plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as os from "node:os";
import * as nodePath from "node:path";
import { FileSystem, type Path } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeLockfile } from "../lockfile.js";
import { writeSettings } from "../settings.js";
import { type ApplyProgressEvent, applyAdd, applyDiff, applyRemove, applyUpdate } from "./apply.js";
import { computeDiff } from "./diff.js";
import type {
  ActualSkill,
  IdealSkillLegacy as IdealSkill,
  IdealSkillsState,
  LockedSkill,
  SkillState,
  SkillsState,
} from "./types.js";
import { SkillSource, SkillValidity } from "./types.js";

// Test helpers
const runEffect = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeContext.layer)));

// Factory functions
const makeIdealSkill = (
  name: string,
  hash = "abc123",
  sourcePath?: string,
  agents: readonly string[] = [],
): IdealSkill => ({
  name,
  source: SkillSource.Local({ path: sourcePath ?? `/test/${name}` }),
  gitTreeFolderHash: hash,
  description: Option.none(),
  agents: [...agents],
});

const makeActualSkill = (name: string, path: string, hash = "abc123"): ActualSkill => ({
  name,
  path,
  frontmatter: Option.some({ name, description: "test" }),
  content: `---
name: ${name}
description: test
---
# ${name}
`,
  gitTreeFolderHash: hash,
  files: ["SKILL.md"],
  lastModified: new Date(),
});

const makeLockedSkill = (hash = "abc123"): LockedSkill => ({
  source: "local:/test/skill",
  origin: "/test/skill",
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
  hash = "abc123",
  validity: SkillValidity = SkillValidity.Valid(),
  hasLocked = true,
): SkillState => ({
  name,
  actual: Option.some(makeActualSkill(name, path, hash)),
  locked: hasLocked ? Option.some(makeLockedSkill(hash)) : Option.none(),
  validity,
});

describe("applyAdd", () => {
  let tempDir: string;
  let axmDir: string;
  let skillsDir: string;
  let sourceDir: string;

  beforeEach(async () => {
    tempDir = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmpBase = os.tmpdir();
        const dir = nodePath.join(
          tmpBase,
          `axm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
        yield* fs.makeDirectory(dir, { recursive: true });
        return dir;
      }),
    );
    axmDir = nodePath.join(tempDir, ".axm");
    skillsDir = nodePath.join(axmDir, "skills");
    sourceDir = nodePath.join(tempDir, "source");

    // Create source skill directory
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const skillSourceDir = nodePath.join(sourceDir, "my-skill");
        yield* fs.makeDirectory(skillSourceDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillSourceDir, "SKILL.md"),
          `---
name: my-skill
description: A test skill
---
# My Skill

Content here.
`,
        );
        // Create initial settings
        yield* fs.makeDirectory(axmDir, { recursive: true });
      }),
    );
  });

  afterEach(async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(tempDir, { recursive: true });
      }),
    );
  });

  it("copies skill to canonical location", async () => {
    const idealSkill = makeIdealSkill("my-skill", "hash123", nodePath.join(sourceDir, "my-skill"));

    const result = await runEffect(applyAdd(idealSkill, { axmDir, agents: [] }));

    expect(result.skillName).toBe("my-skill");
    expect(result.canonicalPath).toBe(nodePath.join(skillsDir, "my-skill"));

    // Verify files exist
    const exists = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.exists(nodePath.join(skillsDir, "my-skill", "SKILL.md"));
      }),
    );
    expect(exists).toBe(true);
  });

  it("syncs to agents when specified", async () => {
    const agentDir = nodePath.join(tempDir, ".claude");
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(agentDir, { recursive: true });
      }),
    );

    const idealSkill = makeIdealSkill(
      "my-skill",
      "hash123",
      nodePath.join(sourceDir, "my-skill"),
      [],
    );

    const result = await runEffect(
      applyAdd(idealSkill, {
        axmDir,
        agents: [{ id: "claude", name: "Claude Code", detectPath: agentDir }],
      }),
    );

    expect(result.skillName).toBe("my-skill");
    expect(result.agentResults.length).toBe(1);

    // Verify symlink/copy exists
    const exists = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.exists(nodePath.join(agentDir, "skills", "my-skill", "SKILL.md"));
      }),
    );
    expect(exists).toBe(true);
  });

  it("returns success result with details", async () => {
    const idealSkill = makeIdealSkill("my-skill", "hash123", nodePath.join(sourceDir, "my-skill"));

    const result = await runEffect(applyAdd(idealSkill, { axmDir, agents: [] }));

    expect(result.skillName).toBe("my-skill");
    expect(result.canonicalPath).toContain("my-skill");
    expect(result.agentResults).toEqual([]);
  });
});

describe("applyRemove", () => {
  let tempDir: string;
  let axmDir: string;
  let skillsDir: string;

  beforeEach(async () => {
    tempDir = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmpBase = os.tmpdir();
        const dir = nodePath.join(
          tmpBase,
          `axm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
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

  it("removes skill from canonical location", async () => {
    // Create skill first
    const skillPath = nodePath.join(skillsDir, "my-skill");
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillPath, { recursive: true });
        yield* fs.writeFileString(nodePath.join(skillPath, "SKILL.md"), "# My Skill");
      }),
    );

    const skillState = makeSkillState("my-skill", skillPath);

    const result = await runEffect(applyRemove(skillState, { axmDir, agents: [] }));

    expect(result.skillName).toBe("my-skill");

    // Verify files are gone
    const exists = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.exists(skillPath);
      }),
    );
    expect(exists).toBe(false);
  });

  it("removes agent symlinks", async () => {
    const agentDir = nodePath.join(tempDir, ".claude");
    const agentSkillsDir = nodePath.join(agentDir, "skills");
    const skillPath = nodePath.join(skillsDir, "my-skill");

    // Create skill and symlink
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillPath, { recursive: true });
        yield* fs.writeFileString(nodePath.join(skillPath, "SKILL.md"), "# My Skill");
        yield* fs.makeDirectory(agentSkillsDir, { recursive: true });
        // Create symlink
        const relPath = nodePath.relative(agentSkillsDir, skillPath);
        yield* fs.symlink(relPath, nodePath.join(agentSkillsDir, "my-skill"));
      }),
    );

    const skillState = makeSkillState("my-skill", skillPath);

    const result = await runEffect(
      applyRemove(skillState, {
        axmDir,
        agents: [{ id: "claude", name: "Claude Code", detectPath: agentDir }],
      }),
    );

    expect(result.skillName).toBe("my-skill");

    // Verify symlink is gone
    const symlinkExists = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.exists(nodePath.join(agentSkillsDir, "my-skill"));
      }),
    );
    expect(symlinkExists).toBe(false);
  });

  it("returns success even if skill does not exist", async () => {
    const skillState = makeSkillState("nonexistent", nodePath.join(skillsDir, "nonexistent"));

    const result = await runEffect(applyRemove(skillState, { axmDir, agents: [] }));

    expect(result.skillName).toBe("nonexistent");
  });
});

describe("applyUpdate", () => {
  let tempDir: string;
  let axmDir: string;
  let skillsDir: string;
  let sourceDir: string;

  beforeEach(async () => {
    tempDir = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmpBase = os.tmpdir();
        const dir = nodePath.join(
          tmpBase,
          `axm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
        yield* fs.makeDirectory(dir, { recursive: true });
        return dir;
      }),
    );
    axmDir = nodePath.join(tempDir, ".axm");
    skillsDir = nodePath.join(axmDir, "skills");
    sourceDir = nodePath.join(tempDir, "source");
  });

  afterEach(async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(tempDir, { recursive: true });
      }),
    );
  });

  it("replaces existing skill with new version", async () => {
    const skillPath = nodePath.join(skillsDir, "my-skill");

    // Create old version
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillPath, { recursive: true });
        yield* fs.writeFileString(nodePath.join(skillPath, "SKILL.md"), "# Old Version");
      }),
    );

    // Create new version source
    const newSourcePath = nodePath.join(sourceDir, "my-skill");
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(newSourcePath, { recursive: true });
        yield* fs.writeFileString(nodePath.join(newSourcePath, "SKILL.md"), "# New Version");
      }),
    );

    const fromState = makeSkillState("my-skill", skillPath, "old-hash");
    const toIdeal = makeIdealSkill("my-skill", "new-hash", newSourcePath);

    const result = await runEffect(applyUpdate(fromState, toIdeal, { axmDir, agents: [] }));

    expect(result.skillName).toBe("my-skill");

    // Verify content is updated
    const content = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.readFileString(nodePath.join(skillPath, "SKILL.md"));
      }),
    );
    expect(content).toBe("# New Version");
  });

  it("re-syncs to agents after update", async () => {
    const skillPath = nodePath.join(skillsDir, "my-skill");
    const agentDir = nodePath.join(tempDir, ".claude");
    const agentSkillsDir = nodePath.join(agentDir, "skills");

    // Create old version
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillPath, { recursive: true });
        yield* fs.writeFileString(nodePath.join(skillPath, "SKILL.md"), "# Old Version");
        yield* fs.makeDirectory(agentSkillsDir, { recursive: true });
        const relPath = nodePath.relative(agentSkillsDir, skillPath);
        yield* fs.symlink(relPath, nodePath.join(agentSkillsDir, "my-skill"));
      }),
    );

    // Create new version source
    const newSourcePath = nodePath.join(sourceDir, "my-skill");
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(newSourcePath, { recursive: true });
        yield* fs.writeFileString(nodePath.join(newSourcePath, "SKILL.md"), "# New Version");
      }),
    );

    const fromState = makeSkillState("my-skill", skillPath, "old-hash");
    const toIdeal = makeIdealSkill("my-skill", "new-hash", newSourcePath);

    const result = await runEffect(
      applyUpdate(fromState, toIdeal, {
        axmDir,
        agents: [{ id: "claude", name: "Claude Code", detectPath: agentDir }],
      }),
    );

    expect(result.skillName).toBe("my-skill");
    expect(result.agentResults.length).toBe(1);
  });
});

describe("applyDiff", () => {
  let tempDir: string;
  let axmDir: string;
  let skillsDir: string;
  let sourceDir: string;

  beforeEach(async () => {
    tempDir = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmpBase = os.tmpdir();
        const dir = nodePath.join(
          tmpBase,
          `axm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
        yield* fs.makeDirectory(dir, { recursive: true });
        return dir;
      }),
    );
    axmDir = nodePath.join(tempDir, ".axm");
    skillsDir = nodePath.join(axmDir, "skills");
    sourceDir = nodePath.join(tempDir, "source");

    // Create initial settings and lockfile
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(axmDir, { recursive: true });
      }),
    );
    await runEffect(writeSettings(axmDir, { agents: [], skills: {} }));
    await runEffect(writeLockfile(axmDir, { lockfileVersion: 1, skills: {} }));
  });

  afterEach(async () => {
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(tempDir, { recursive: true });
      }),
    );
  });

  it("applies all changes in diff", async () => {
    // Create source skill
    const skillSourceDir = nodePath.join(sourceDir, "new-skill");
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillSourceDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillSourceDir, "SKILL.md"),
          `---
name: new-skill
description: New skill
---
# New Skill
`,
        );
      }),
    );

    const current: SkillsState = { skills: {} };
    const ideal: IdealSkillsState = {
      skills: {
        "new-skill": makeIdealSkill("new-skill", "hash123", skillSourceDir),
      },
      removals: [],
    };

    const diff = computeDiff(current, ideal);
    const result = await runEffect(applyDiff(diff, { axmDir, agents: [] }));

    expect(result.applied.length).toBe(1);
    expect(result.failed.length).toBe(0);

    // Verify skill was installed
    const exists = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.exists(nodePath.join(skillsDir, "new-skill", "SKILL.md"));
      }),
    );
    expect(exists).toBe(true);
  });

  it("emits progress events", async () => {
    // Create source skill
    const skillSourceDir = nodePath.join(sourceDir, "new-skill");
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillSourceDir, { recursive: true });
        yield* fs.writeFileString(nodePath.join(skillSourceDir, "SKILL.md"), "# New Skill");
      }),
    );

    const current: SkillsState = { skills: {} };
    const ideal: IdealSkillsState = {
      skills: {
        "new-skill": makeIdealSkill("new-skill", "hash123", skillSourceDir),
      },
      removals: [],
    };

    const diff = computeDiff(current, ideal);
    const events: ApplyProgressEvent[] = [];

    const result = await runEffect(
      applyDiff(diff, {
        axmDir,
        agents: [],
        onProgress: (event) => events.push(event),
      }),
    );

    expect(result.applied.length).toBe(1);
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e._tag === "SkillStart")).toBe(true);
    expect(events.some((e) => e._tag === "SkillComplete")).toBe(true);
  });

  it("handles mixed add/remove/update operations", async () => {
    // Create existing skill to update
    const existingSkillPath = nodePath.join(skillsDir, "update-skill");
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(existingSkillPath, { recursive: true });
        yield* fs.writeFileString(nodePath.join(existingSkillPath, "SKILL.md"), "# Old");
      }),
    );

    // Create skill to remove
    const removeSkillPath = nodePath.join(skillsDir, "remove-skill");
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(removeSkillPath, { recursive: true });
        yield* fs.writeFileString(nodePath.join(removeSkillPath, "SKILL.md"), "# Remove Me");
      }),
    );

    // Create source for new and update
    const newSkillSource = nodePath.join(sourceDir, "new-skill");
    const updateSkillSource = nodePath.join(sourceDir, "update-skill");
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(newSkillSource, { recursive: true });
        yield* fs.writeFileString(nodePath.join(newSkillSource, "SKILL.md"), "# New");
        yield* fs.makeDirectory(updateSkillSource, { recursive: true });
        yield* fs.writeFileString(nodePath.join(updateSkillSource, "SKILL.md"), "# Updated");
      }),
    );

    const current: SkillsState = {
      skills: {
        "update-skill": makeSkillState("update-skill", existingSkillPath, "old-hash"),
        "remove-skill": makeSkillState("remove-skill", removeSkillPath, "remove-hash"),
      },
    };

    const ideal: IdealSkillsState = {
      skills: {
        "new-skill": makeIdealSkill("new-skill", "new-hash", newSkillSource),
        "update-skill": makeIdealSkill("update-skill", "updated-hash", updateSkillSource),
      },
      removals: ["remove-skill"],
    };

    const diff = computeDiff(current, ideal);
    const result = await runEffect(applyDiff(diff, { axmDir, agents: [] }));

    expect(result.applied.length).toBe(3);
    expect(result.failed.length).toBe(0);

    // Verify new skill exists
    const newExists = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.exists(nodePath.join(skillsDir, "new-skill", "SKILL.md"));
      }),
    );
    expect(newExists).toBe(true);

    // Verify updated skill has new content
    const updatedContent = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.readFileString(nodePath.join(skillsDir, "update-skill", "SKILL.md"));
      }),
    );
    expect(updatedContent).toBe("# Updated");

    // Verify removed skill is gone
    const removeExists = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.exists(nodePath.join(skillsDir, "remove-skill"));
      }),
    );
    expect(removeExists).toBe(false);
  });

  it("updates lockfile after apply", async () => {
    // Create source skill
    const skillSourceDir = nodePath.join(sourceDir, "new-skill");
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillSourceDir, { recursive: true });
        yield* fs.writeFileString(nodePath.join(skillSourceDir, "SKILL.md"), "# New Skill");
      }),
    );

    const current: SkillsState = { skills: {} };
    const ideal: IdealSkillsState = {
      skills: {
        "new-skill": makeIdealSkill("new-skill", "hash123", skillSourceDir),
      },
      removals: [],
    };

    const diff = computeDiff(current, ideal);
    await runEffect(applyDiff(diff, { axmDir, agents: [] }));

    // Verify lockfile was updated
    const lockfileContent = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.readFileString(nodePath.join(axmDir, "axm-lock.yaml"));
      }),
    );
    expect(lockfileContent).toContain("new-skill");
  });

  it("updates settings after apply", async () => {
    // Create source skill
    const skillSourceDir = nodePath.join(sourceDir, "new-skill");
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillSourceDir, { recursive: true });
        yield* fs.writeFileString(nodePath.join(skillSourceDir, "SKILL.md"), "# New Skill");
      }),
    );

    const current: SkillsState = { skills: {} };
    const ideal: IdealSkillsState = {
      skills: {
        "new-skill": makeIdealSkill("new-skill", "hash123", skillSourceDir),
      },
      removals: [],
    };

    const diff = computeDiff(current, ideal);
    await runEffect(applyDiff(diff, { axmDir, agents: [] }));

    // Verify settings was updated
    const settingsContent = await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.readFileString(nodePath.join(axmDir, "settings.json"));
      }),
    );
    expect(settingsContent).toContain("new-skill");
  });

  it("continues on individual failure and reports in result", async () => {
    // Create only one of two source skills (the other will fail)
    const goodSkillSource = nodePath.join(sourceDir, "good-skill");
    await runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(goodSkillSource, { recursive: true });
        yield* fs.writeFileString(nodePath.join(goodSkillSource, "SKILL.md"), "# Good Skill");
      }),
    );

    const current: SkillsState = { skills: {} };
    const ideal: IdealSkillsState = {
      skills: {
        "good-skill": makeIdealSkill("good-skill", "hash1", goodSkillSource),
        "bad-skill": makeIdealSkill("bad-skill", "hash2", "/nonexistent/path"),
      },
      removals: [],
    };

    const diff = computeDiff(current, ideal);
    const result = await runEffect(applyDiff(diff, { axmDir, agents: [] }));

    // Good skill should succeed
    expect(result.applied.some((r) => r.skillName === "good-skill")).toBe(true);
    // Bad skill should fail
    expect(result.failed.some((f) => f.skillName === "bad-skill")).toBe(true);
  });
});
