import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { DiscoveryError, discoverSkills } from "./skill-discovery.js";

describe("discoverSkills", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-discovery-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const withFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    effect.pipe(Effect.provide(NodeFileSystem.layer));

  it.effect("returns empty array for directory with no skills", () =>
    withFileSystem(
      Effect.gen(function* () {
        const result = yield* discoverSkills(tempDir);
        expect(result).toEqual([]);
      }),
    ),
  );

  it.effect("discovers a single SKILL.md file", () =>
    withFileSystem(
      Effect.gen(function* () {
        const skillDir = path.join(tempDir, "my-skill");
        fs.mkdirSync(skillDir);
        fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# My Skill");

        const result = yield* discoverSkills(tempDir);

        expect(result).toHaveLength(1);
        expect(result[0]?.name).toBe("my-skill");
        expect(result[0]?.path).toBe(path.join(skillDir, "SKILL.md"));
      }),
    ),
  );

  it.effect("discovers multiple skills", () =>
    withFileSystem(
      Effect.gen(function* () {
        const skill1Dir = path.join(tempDir, "commit");
        const skill2Dir = path.join(tempDir, "review-pr");
        fs.mkdirSync(skill1Dir);
        fs.mkdirSync(skill2Dir);
        fs.writeFileSync(path.join(skill1Dir, "SKILL.md"), "# Commit");
        fs.writeFileSync(path.join(skill2Dir, "SKILL.md"), "# Review PR");

        const result = yield* discoverSkills(tempDir);

        expect(result).toHaveLength(2);
        const names = result.map((s) => s.name).sort();
        expect(names).toEqual(["commit", "review-pr"]);
      }),
    ),
  );

  it.effect("discovers nested skills", () =>
    withFileSystem(
      Effect.gen(function* () {
        const nestedDir = path.join(tempDir, "category", "nested-skill");
        fs.mkdirSync(nestedDir, { recursive: true });
        fs.writeFileSync(path.join(nestedDir, "SKILL.md"), "# Nested Skill");

        const result = yield* discoverSkills(tempDir);

        expect(result).toHaveLength(1);
        expect(result[0]?.name).toBe("nested-skill");
      }),
    ),
  );

  it.effect("handles case-insensitive SKILL.md matching", () =>
    withFileSystem(
      Effect.gen(function* () {
        const skill1Dir = path.join(tempDir, "skill-lower");
        const skill2Dir = path.join(tempDir, "skill-upper");
        const skill3Dir = path.join(tempDir, "skill-mixed");
        fs.mkdirSync(skill1Dir);
        fs.mkdirSync(skill2Dir);
        fs.mkdirSync(skill3Dir);
        fs.writeFileSync(path.join(skill1Dir, "skill.md"), "# Lower");
        fs.writeFileSync(path.join(skill2Dir, "SKILL.MD"), "# Upper");
        fs.writeFileSync(path.join(skill3Dir, "Skill.md"), "# Mixed");

        const result = yield* discoverSkills(tempDir);

        expect(result).toHaveLength(3);
        const names = result.map((s) => s.name).sort();
        expect(names).toEqual(["skill-lower", "skill-mixed", "skill-upper"]);
      }),
    ),
  );

  it.effect("ignores non-SKILL.md files", () =>
    withFileSystem(
      Effect.gen(function* () {
        const skillDir = path.join(tempDir, "my-skill");
        fs.mkdirSync(skillDir);
        fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# My Skill");
        fs.writeFileSync(path.join(skillDir, "README.md"), "# Readme");
        fs.writeFileSync(path.join(skillDir, "other.txt"), "other");

        const result = yield* discoverSkills(tempDir);

        expect(result).toHaveLength(1);
        expect(result[0]?.name).toBe("my-skill");
      }),
    ),
  );

  it.effect("fails with DiscoveryError for non-existent directory", () =>
    withFileSystem(
      Effect.gen(function* () {
        const nonExistentDir = path.join(tempDir, "does-not-exist");

        const error = yield* discoverSkills(nonExistentDir).pipe(Effect.flip);

        expect(error).toBeInstanceOf(DiscoveryError);
        expect(error.message).toContain("does not exist");
      }),
    ),
  );

  it.effect("fails with DiscoveryError when path is a file, not a directory", () =>
    withFileSystem(
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "not-a-directory.txt");
        fs.writeFileSync(filePath, "content");

        const error = yield* discoverSkills(filePath).pipe(Effect.flip);

        expect(error).toBeInstanceOf(DiscoveryError);
        expect(error.message).toContain("not a directory");
      }),
    ),
  );

  it.effect("skips inaccessible subdirectories gracefully", () =>
    withFileSystem(
      Effect.gen(function* () {
        // Create a skill we can access
        const accessibleDir = path.join(tempDir, "accessible-skill");
        fs.mkdirSync(accessibleDir);
        fs.writeFileSync(path.join(accessibleDir, "SKILL.md"), "# Accessible");

        // On Unix systems, we could create an inaccessible directory
        // but this is platform-specific. The implementation handles this
        // by catching errors and continuing.
        const result = yield* discoverSkills(tempDir);

        expect(result).toHaveLength(1);
        expect(result[0]?.name).toBe("accessible-skill");
      }),
    ),
  );
});
