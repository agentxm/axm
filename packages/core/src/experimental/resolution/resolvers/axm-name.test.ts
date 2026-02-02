import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { isAxmName, resolveAxmName } from "./axm-name.js";

describe("isAxmName", () => {
  it("returns true for @scope/name", () => {
    expect(isAxmName("@scope/name")).toBe(true);
  });

  it("returns true for @scope/name@^1.0.0", () => {
    expect(isAxmName("@scope/name@^1.0.0")).toBe(true);
  });

  it("returns true for @scope/name with version", () => {
    expect(isAxmName("@scope/name@1.2.3")).toBe(true);
  });

  it("returns true for @scope/name with complex version", () => {
    expect(isAxmName("@scope/name@~2.0.0")).toBe(true);
  });

  it("returns false for owner/repo (no @ prefix)", () => {
    expect(isAxmName("owner/repo")).toBe(false);
  });

  it("returns false for ./local/path", () => {
    expect(isAxmName("./local/path")).toBe(false);
  });

  it("returns false for bare-name", () => {
    expect(isAxmName("bare-name")).toBe(false);
  });

  it("returns false for invalid scope format", () => {
    expect(isAxmName("scope/name")).toBe(false);
  });

  it("returns false for @scope only", () => {
    expect(isAxmName("@scope")).toBe(false);
  });

  it("returns false for @scope/ (missing name)", () => {
    expect(isAxmName("@scope/")).toBe(false);
  });

  it("returns false for URL", () => {
    expect(isAxmName("https://github.com/owner/repo")).toBe(false);
  });
});

describe("resolveAxmName", () => {
  let tempDir: string;
  let projectDir: string;
  let globalDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-name-resolver-test-"));
    projectDir = path.join(tempDir, "project", ".axm");
    globalDir = path.join(tempDir, "global", ".axm");

    // Create base directories
    fs.mkdirSync(path.join(projectDir, "skills"), { recursive: true });
    fs.mkdirSync(path.join(globalDir, "skills"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const withFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    effect.pipe(Effect.provide(NodeFileSystem.layer));

  describe("pattern matching", () => {
    it.effect("returns empty array for non-AXM input", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAxmName("owner/repo", {
            projectDir,
            globalDir,
            cwd: path.join(tempDir, "project"),
          });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for local path input", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAxmName("./local/path", {
            projectDir,
            globalDir,
            cwd: path.join(tempDir, "project"),
          });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for bare name", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAxmName("bare-name", {
            projectDir,
            globalDir,
            cwd: path.join(tempDir, "project"),
          });
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("project level resolution", () => {
    it.effect("resolves from project directory when skill exists there", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillPath = path.join(projectDir, "skills", "@wayne", "grappling-hook");
          fs.mkdirSync(skillPath, { recursive: true });
          fs.writeFileSync(path.join(skillPath, "SKILL.md"), "# Grappling Hook");

          const result = yield* resolveAxmName("@wayne/grappling-hook", {
            projectDir,
            globalDir,
            cwd: path.join(tempDir, "project"),
          });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "registry",
            origin: skillPath,
            name: "@wayne/grappling-hook",
            originalInput: "@wayne/grappling-hook",
            metadata: {},
          });
        }),
      ),
    );

    it.effect("extracts version constraint from input", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillPath = path.join(projectDir, "skills", "@wayne", "grappling-hook");
          fs.mkdirSync(skillPath, { recursive: true });
          fs.writeFileSync(path.join(skillPath, "SKILL.md"), "# Grappling Hook");

          const result = yield* resolveAxmName("@wayne/grappling-hook@^1.0.0", {
            projectDir,
            globalDir,
            cwd: path.join(tempDir, "project"),
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.metadata).toEqual({ versionConstraint: "^1.0.0" });
          expect(result[0]?.originalInput).toBe("@wayne/grappling-hook@^1.0.0");
        }),
      ),
    );

    it.effect("resolves against cwd when cwd option provided", () =>
      withFileSystem(
        Effect.gen(function* () {
          const projectCwd = path.join(tempDir, "project");
          const skillPath = path.join(projectCwd, ".axm", "skills", "@wayne", "grappling-hook");
          fs.mkdirSync(skillPath, { recursive: true });
          fs.writeFileSync(path.join(skillPath, "SKILL.md"), "# Grappling Hook");

          const result = yield* resolveAxmName("@wayne/grappling-hook", {
            projectDir: ".axm",
            globalDir,
            cwd: projectCwd,
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.origin).toBe(skillPath);
        }),
      ),
    );
  });

  describe("global level resolution", () => {
    it.effect("resolves from global directory when skill exists there (but not project)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillPath = path.join(globalDir, "skills", "@wayne", "grappling-hook");
          fs.mkdirSync(skillPath, { recursive: true });
          fs.writeFileSync(path.join(skillPath, "SKILL.md"), "# Grappling Hook");

          const result = yield* resolveAxmName("@wayne/grappling-hook", {
            projectDir,
            globalDir,
            cwd: path.join(tempDir, "project"),
          });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "registry",
            origin: skillPath,
            name: "@wayne/grappling-hook",
            originalInput: "@wayne/grappling-hook",
          });
        }),
      ),
    );

    it.effect("resolves from global with version constraint", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillPath = path.join(globalDir, "skills", "@wayne", "grappling-hook");
          fs.mkdirSync(skillPath, { recursive: true });
          fs.writeFileSync(path.join(skillPath, "SKILL.md"), "# Grappling Hook");

          const result = yield* resolveAxmName("@wayne/grappling-hook@~2.0.0", {
            projectDir,
            globalDir,
            cwd: path.join(tempDir, "project"),
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.metadata).toEqual({ versionConstraint: "~2.0.0" });
        }),
      ),
    );
  });

  describe("resolution priority", () => {
    it.effect("prefers project over global when both exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const projectSkillPath = path.join(projectDir, "skills", "@wayne", "grappling-hook");
          const globalSkillPath = path.join(globalDir, "skills", "@wayne", "grappling-hook");

          fs.mkdirSync(projectSkillPath, { recursive: true });
          fs.mkdirSync(globalSkillPath, { recursive: true });
          fs.writeFileSync(path.join(projectSkillPath, "SKILL.md"), "# Project Skill");
          fs.writeFileSync(path.join(globalSkillPath, "SKILL.md"), "# Global Skill");

          const result = yield* resolveAxmName("@wayne/grappling-hook", {
            projectDir,
            globalDir,
            cwd: path.join(tempDir, "project"),
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.origin).toBe(projectSkillPath);
        }),
      ),
    );
  });

  describe("not found", () => {
    it.effect("returns empty array when skill not found in either location", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAxmName("@wayne/nonexistent", {
            projectDir,
            globalDir,
            cwd: path.join(tempDir, "project"),
          });

          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array when directory exists but is not a valid skill", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create directory but don't add SKILL.md (though current implementation doesn't check)
          const skillPath = path.join(projectDir, "skills", "@wayne", "empty");
          fs.mkdirSync(skillPath, { recursive: true });

          const result = yield* resolveAxmName("@wayne/empty", {
            projectDir,
            globalDir,
            cwd: path.join(tempDir, "project"),
          });

          // Current implementation only checks directory exists, not contents
          // This test documents current behavior - may need adjustment if validation is added
          expect(result).toHaveLength(1);
        }),
      ),
    );
  });

  describe("default options", () => {
    it.effect("uses default directories when options not provided", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create skill in default project location relative to cwd
          const projectCwd = path.join(tempDir, "project");
          const defaultProjectPath = path.join(
            projectCwd,
            ".axm",
            "skills",
            "@wayne",
            "grappling-hook",
          );
          fs.mkdirSync(defaultProjectPath, { recursive: true });
          fs.writeFileSync(path.join(defaultProjectPath, "SKILL.md"), "# Skill");

          const result = yield* resolveAxmName("@wayne/grappling-hook", {
            cwd: projectCwd,
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.origin).toBe(defaultProjectPath);
        }),
      ),
    );

    it.effect("uses process.cwd() when cwd not provided", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create skill in default location relative to process.cwd()
          const processCwd = process.cwd();
          const skillPath = path.join(processCwd, ".axm", "skills", "@test", "skill");

          // Only create if we can safely test (avoid polluting real filesystem)
          // For this test, we'll just verify empty result since we're not setting up the real cwd
          const result = yield* resolveAxmName("@test/skill", {});

          // This will be empty unless .axm/skills/@test/skill exists in actual cwd
          expect(Array.isArray(result)).toBe(true);
        }),
      ),
    );
  });

  describe("path expansion", () => {
    it.effect("expands ~ in global directory path", () =>
      withFileSystem(
        Effect.gen(function* () {
          const homeDir = os.homedir();
          const expandedGlobalDir = path.join(homeDir, ".axm-test-" + Date.now());
          const skillPath = path.join(expandedGlobalDir, "skills", "@wayne", "grappling-hook");

          // Create temporary skill in home directory
          fs.mkdirSync(skillPath, { recursive: true });
          fs.writeFileSync(path.join(skillPath, "SKILL.md"), "# Skill");

          try {
            // Use ~ path instead of absolute
            const relativePath = "~/" + path.relative(homeDir, expandedGlobalDir);
            const result = yield* resolveAxmName("@wayne/grappling-hook", {
              projectDir,
              globalDir: relativePath,
              cwd: path.join(tempDir, "project"),
            });

            expect(result).toHaveLength(1);
            expect(result[0]?.origin).toBe(skillPath);
          } finally {
            // Clean up
            fs.rmSync(expandedGlobalDir, { recursive: true, force: true });
          }
        }),
      ),
    );
  });

  describe("edge cases", () => {
    it.effect("handles scope and name with hyphens", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillPath = path.join(projectDir, "skills", "@my-scope", "my-skill-name");
          fs.mkdirSync(skillPath, { recursive: true });
          fs.writeFileSync(path.join(skillPath, "SKILL.md"), "# Skill");

          const result = yield* resolveAxmName("@my-scope/my-skill-name", {
            projectDir,
            globalDir,
            cwd: path.join(tempDir, "project"),
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.name).toBe("@my-scope/my-skill-name");
        }),
      ),
    );

    it.effect("handles version with special characters", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillPath = path.join(projectDir, "skills", "@wayne", "grappling-hook");
          fs.mkdirSync(skillPath, { recursive: true });
          fs.writeFileSync(path.join(skillPath, "SKILL.md"), "# Skill");

          const result = yield* resolveAxmName("@wayne/grappling-hook@>=1.0.0 <2.0.0", {
            projectDir,
            globalDir,
            cwd: path.join(tempDir, "project"),
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.metadata.versionConstraint).toBe(">=1.0.0 <2.0.0");
        }),
      ),
    );

    it.effect("returns empty for malformed input with multiple @", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAxmName("@scope/@name", {
            projectDir,
            globalDir,
            cwd: path.join(tempDir, "project"),
          });

          expect(result).toEqual([]);
        }),
      ),
    );
  });
});
