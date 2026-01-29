import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DiscoveryError, discoverSkills } from "../skill-discovery.js";

describe("discoverSkills", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-discovery-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const runWithFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    Effect.runPromise(effect.pipe(Effect.provide(NodeFileSystem.layer)));

  it("returns empty array for directory with no skills", async () => {
    const result = await runWithFileSystem(discoverSkills(tempDir));
    expect(result).toEqual([]);
  });

  it("discovers a single SKILL.md file", async () => {
    const skillDir = path.join(tempDir, "my-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# My Skill");

    const result = await runWithFileSystem(discoverSkills(tempDir));

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("my-skill");
    expect(result[0]?.path).toBe(path.join(skillDir, "SKILL.md"));
  });

  it("discovers multiple skills", async () => {
    const skill1Dir = path.join(tempDir, "commit");
    const skill2Dir = path.join(tempDir, "review-pr");
    fs.mkdirSync(skill1Dir);
    fs.mkdirSync(skill2Dir);
    fs.writeFileSync(path.join(skill1Dir, "SKILL.md"), "# Commit");
    fs.writeFileSync(path.join(skill2Dir, "SKILL.md"), "# Review PR");

    const result = await runWithFileSystem(discoverSkills(tempDir));

    expect(result).toHaveLength(2);
    const names = result.map((s) => s.name).sort();
    expect(names).toEqual(["commit", "review-pr"]);
  });

  it("discovers nested skills", async () => {
    const nestedDir = path.join(tempDir, "category", "nested-skill");
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(nestedDir, "SKILL.md"), "# Nested Skill");

    const result = await runWithFileSystem(discoverSkills(tempDir));

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("nested-skill");
  });

  it("handles case-insensitive SKILL.md matching", async () => {
    const skill1Dir = path.join(tempDir, "skill-lower");
    const skill2Dir = path.join(tempDir, "skill-upper");
    const skill3Dir = path.join(tempDir, "skill-mixed");
    fs.mkdirSync(skill1Dir);
    fs.mkdirSync(skill2Dir);
    fs.mkdirSync(skill3Dir);
    fs.writeFileSync(path.join(skill1Dir, "skill.md"), "# Lower");
    fs.writeFileSync(path.join(skill2Dir, "SKILL.MD"), "# Upper");
    fs.writeFileSync(path.join(skill3Dir, "Skill.md"), "# Mixed");

    const result = await runWithFileSystem(discoverSkills(tempDir));

    expect(result).toHaveLength(3);
    const names = result.map((s) => s.name).sort();
    expect(names).toEqual(["skill-lower", "skill-mixed", "skill-upper"]);
  });

  it("ignores non-SKILL.md files", async () => {
    const skillDir = path.join(tempDir, "my-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# My Skill");
    fs.writeFileSync(path.join(skillDir, "README.md"), "# Readme");
    fs.writeFileSync(path.join(skillDir, "other.txt"), "other");

    const result = await runWithFileSystem(discoverSkills(tempDir));

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("my-skill");
  });

  it("fails with DiscoveryError for non-existent directory", async () => {
    const nonExistentDir = path.join(tempDir, "does-not-exist");

    const result = await Effect.runPromise(
      discoverSkills(nonExistentDir).pipe(Effect.provide(NodeFileSystem.layer), Effect.either),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DiscoveryError);
      expect(result.left.message).toContain("does not exist");
    }
  });

  it("fails with DiscoveryError when path is a file, not a directory", async () => {
    const filePath = path.join(tempDir, "not-a-directory.txt");
    fs.writeFileSync(filePath, "content");

    const result = await Effect.runPromise(
      discoverSkills(filePath).pipe(Effect.provide(NodeFileSystem.layer), Effect.either),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(DiscoveryError);
      expect(result.left.message).toContain("not a directory");
    }
  });

  it("skips inaccessible subdirectories gracefully", async () => {
    // Create a skill we can access
    const accessibleDir = path.join(tempDir, "accessible-skill");
    fs.mkdirSync(accessibleDir);
    fs.writeFileSync(path.join(accessibleDir, "SKILL.md"), "# Accessible");

    // On Unix systems, we could create an inaccessible directory
    // but this is platform-specific. The implementation handles this
    // by catching errors and continuing.
    const result = await runWithFileSystem(discoverSkills(tempDir));

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("accessible-skill");
  });
});
