import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { resolveAmbiguous } from "./ambiguous.js";

describe("resolveAmbiguous", () => {
  let tempDir: string;
  let projectAxmDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ambiguous-resolver-test-"));
    projectAxmDir = path.join(tempDir, ".axm");
    fs.mkdirSync(projectAxmDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const withFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    effect.pipe(Effect.provide(NodeFileSystem.layer));

  describe("pattern detection (non-matching)", () => {
    it.effect("returns empty for github:owner/repo (has prefix)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("github:owner/repo", { cwd: tempDir });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for gitlab:owner/repo (has prefix)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("gitlab:owner/repo", { cwd: tempDir });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for @scope/name (starts with @)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("@scope/name", { cwd: tempDir });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for ./path (local path)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("./path", { cwd: tempDir });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for ../path (local path)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("../path", { cwd: tempDir });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for /absolute/path (local path)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("/absolute/path", { cwd: tempDir });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for ~/path (home directory path)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("~/my-skills/skill", { cwd: tempDir });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for https://github.com/owner/repo (URL)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("https://github.com/owner/repo", {
            cwd: tempDir,
          });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for http://github.com/owner/repo (URL)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("http://github.com/owner/repo", {
            cwd: tempDir,
          });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for empty string", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("", { cwd: tempDir });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for whitespace-only string", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("   ", { cwd: tempDir });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for git@github.com:owner/repo.git (SSH URL)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("git@github.com:owner/repo.git", {
            cwd: tempDir,
          });
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("resolution order", () => {
    it.effect("prefers AXM name when @owner/repo is installed", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create AXM directory in project
          const axmSkillDir = path.join(projectAxmDir, "skills", "@owner", "repo");
          fs.mkdirSync(axmSkillDir, { recursive: true });

          const result = yield* resolveAmbiguous("owner/repo", {
            cwd: tempDir,
            projectDir: ".axm",
          });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "registry",
            origin: axmSkillDir,
            name: "@owner/repo",
            originalInput: "@owner/repo",
          });
        }),
      ),
    );

    it.effect("falls back to GitHub shorthand when AXM name not found", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("owner/repo", { cwd: tempDir });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "github",
            origin: "https://github.com/owner/repo",
            originalInput: "owner/repo",
          });
        }),
      ),
    );

    it.effect("prefers AXM over GitHub when AXM exists", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create AXM directory
          const axmSkillDir = path.join(projectAxmDir, "skills", "@owner", "repo");
          fs.mkdirSync(axmSkillDir, { recursive: true });

          const result = yield* resolveAmbiguous("owner/repo", {
            cwd: tempDir,
            projectDir: ".axm",
          });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "registry",
            origin: axmSkillDir,
          });
        }),
      ),
    );
  });

  describe("source filtering", () => {
    it.effect("skips registry check when sources excludes registry", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create AXM directory (should be ignored)
          const axmSkillDir = path.join(projectAxmDir, "skills", "@owner", "repo");
          fs.mkdirSync(axmSkillDir, { recursive: true });

          const result = yield* resolveAmbiguous("owner/repo", {
            cwd: tempDir,
            projectDir: ".axm",
            sources: ["github"],
          });

          // Should fall back to GitHub, not use registry
          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("github");
        }),
      ),
    );

    it.effect("returns empty when sources excludes both github and registry", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("owner/repo", {
            cwd: tempDir,
            sources: ["git"],
          });

          // Should return empty since neither registry nor github is allowed
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("skips GitHub when sources excludes github", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("owner/repo", {
            cwd: tempDir,
            sources: ["registry"],
          });

          // Should return empty since no AXM exists and github is excluded
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("respects sources filter with only registry", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create AXM directory
          const axmSkillDir = path.join(projectAxmDir, "skills", "@owner", "repo");
          fs.mkdirSync(axmSkillDir, { recursive: true });

          const result = yield* resolveAmbiguous("owner/repo", {
            cwd: tempDir,
            projectDir: ".axm",
            sources: ["registry"],
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("registry");
        }),
      ),
    );

    it.effect("respects sources filter with only github", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("owner/repo", {
            cwd: tempDir,
            sources: ["github"],
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("github");
        }),
      ),
    );
  });

  describe("GitHub fallback patterns", () => {
    it.effect("returns GitHub ExtensionRef for owner/repo", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("owner/repo", { cwd: tempDir });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "github",
            origin: "https://github.com/owner/repo",
            originalInput: "owner/repo",
            metadata: {},
          });
          expect(result[0]?.ref).toBeUndefined();
          expect(result[0]?.path).toBeUndefined();
        }),
      ),
    );

    it.effect("handles owner/repo@ref pattern", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("owner/repo@v1.0.0", { cwd: tempDir });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "github",
            origin: "https://github.com/owner/repo",
            originalInput: "owner/repo@v1.0.0",
            ref: "v1.0.0",
          });
          expect(result[0]?.path).toBeUndefined();
        }),
      ),
    );

    it.effect("handles owner/repo/path pattern", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("owner/repo/skills/my-skill", {
            cwd: tempDir,
          });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "github",
            origin: "https://github.com/owner/repo",
            originalInput: "owner/repo/skills/my-skill",
            path: "skills/my-skill",
          });
          expect(result[0]?.ref).toBeUndefined();
        }),
      ),
    );

    it.effect("handles owner/repo/path@ref pattern", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("owner/repo/skills/my-skill@main", {
            cwd: tempDir,
          });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "github",
            origin: "https://github.com/owner/repo",
            originalInput: "owner/repo/skills/my-skill@main",
            ref: "main",
            path: "skills/my-skill",
          });
        }),
      ),
    );

    it.effect("handles deeply nested path", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("owner/repo/a/b/c/d", { cwd: tempDir });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "github",
            path: "a/b/c/d",
          });
        }),
      ),
    );

    it.effect("handles branch name with slashes in @ref", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("owner/repo@feature/branch", {
            cwd: tempDir,
          });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "github",
            ref: "feature/branch",
          });
          expect(result[0]?.path).toBeUndefined();
        }),
      ),
    );
  });

  describe("version handling in AXM fallback", () => {
    it.effect("preserves version constraint when falling back to AXM", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create AXM directory
          const axmSkillDir = path.join(projectAxmDir, "skills", "@owner", "repo");
          fs.mkdirSync(axmSkillDir, { recursive: true });

          const result = yield* resolveAmbiguous("owner/repo@^1.0.0", {
            cwd: tempDir,
            projectDir: ".axm",
          });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "registry",
            name: "@owner/repo",
            originalInput: "@owner/repo@^1.0.0",
            metadata: { versionConstraint: "^1.0.0" },
          });
        }),
      ),
    );
  });

  describe("edge cases", () => {
    it.effect("handles input with leading/trailing whitespace", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("  owner/repo  ", { cwd: tempDir });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            source: "github",
            origin: "https://github.com/owner/repo",
          });
        }),
      ),
    );

    it.effect("handles owner/repo with numbers and hyphens", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("my-org-123/my-repo-456", { cwd: tempDir });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            source: "github",
            origin: "https://github.com/my-org-123/my-repo-456",
          });
        }),
      ),
    );

    it.effect("handles owner/repo with underscores", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("my_org/my_repo", { cwd: tempDir });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            source: "github",
            origin: "https://github.com/my_org/my_repo",
          });
        }),
      ),
    );

    it.effect("returns empty for single segment (no slash)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("justname", { cwd: tempDir });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for input starting with dot", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(".hidden/repo", { cwd: tempDir });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("handles global AXM directory with ~", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create global AXM directory
          const homeDir = os.homedir();
          const globalAxmDir = path.join(homeDir, ".axm-test-global");
          const globalSkillDir = path.join(globalAxmDir, "skills", "@owner", "repo");
          fs.mkdirSync(globalSkillDir, { recursive: true });

          try {
            const result = yield* resolveAmbiguous("owner/repo", {
              cwd: tempDir,
              projectDir: ".axm",
              globalDir: "~/.axm-test-global",
            });

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
              source: "registry",
              origin: globalSkillDir,
            });
          } finally {
            // Clean up global test directory
            fs.rmSync(globalAxmDir, { recursive: true, force: true });
          }
        }),
      ),
    );
  });

  describe("local path precedence", () => {
    it.effect("skips local path check for a/b pattern (not a local path format)", () =>
      withFileSystem(
        Effect.gen(function* () {
          // a/b doesn't match local path pattern (no ./, /, ~, etc.)
          // So it should fall through to AXM name or GitHub shorthand
          const result = yield* resolveAmbiguous("owner/repo", { cwd: tempDir });

          // Should resolve to GitHub (since no AXM exists)
          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("github");
        }),
      ),
    );

    it.effect(
      "returns empty array for ./path inputs (handled by local-path resolver, not ambiguous)",
      () =>
        withFileSystem(
          Effect.gen(function* () {
            // Create a skill at ./my-skill
            const skillDir = path.join(tempDir, "my-skill");
            fs.mkdirSync(skillDir);
            fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# My Skill");

            // ./my-skill is NOT an ambiguous pattern - it's clearly a local path
            // The ambiguous resolver should return empty, letting local-path resolver handle it
            const result = yield* resolveAmbiguous("./my-skill", { cwd: tempDir });

            expect(result).toEqual([]);
          }),
        ),
    );
  });
});
