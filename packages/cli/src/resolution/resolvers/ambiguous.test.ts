import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defaultResolutionOptions } from "../resolver.js";
import type { ExtensionType, ResolutionOptions, Source } from "../types.js";
import { resolveAmbiguous } from "./ambiguous.js";

/**
 * Helper to create ResolutionOptions for tests.
 */
const makeOptions = (opts: {
  cwd?: string;
  projectDir?: string;
  globalDir?: string;
  scope?: string;
  types?: readonly ExtensionType[];
  sources?: readonly Source[];
  agents?: readonly string[];
}): ResolutionOptions => ({
  ...defaultResolutionOptions,
  cwd: Option.fromNullable(opts.cwd),
  projectDir: Option.fromNullable(opts.projectDir),
  globalDir: Option.fromNullable(opts.globalDir),
  scope: Option.fromNullable(opts.scope),
  types: Option.fromNullable(opts.types),
  sources: Option.fromNullable(opts.sources),
  agents: Option.fromNullable(opts.agents),
});

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
          const result = yield* resolveAmbiguous(
            "github:owner/repo",
            makeOptions({ cwd: tempDir }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for gitlab:owner/repo (has prefix)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "gitlab:owner/repo",
            makeOptions({ cwd: tempDir }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for @scope/name (starts with @)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("@scope/name", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for ./path (local path)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("./path", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for ../path (local path)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("../path", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for /absolute/path (local path)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("/absolute/path", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for ~/path (home directory path)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "~/my-skills/skill",
            makeOptions({ cwd: tempDir }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for https://github.com/owner/repo (URL)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "https://github.com/owner/repo",
            makeOptions({ cwd: tempDir }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for http://github.com/owner/repo (URL)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "http://github.com/owner/repo",
            makeOptions({ cwd: tempDir }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for empty string", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for whitespace-only string", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("   ", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for git@github.com:owner/repo.git (SSH URL)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "git@github.com:owner/repo.git",
            makeOptions({ cwd: tempDir }),
          );
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

          const result = yield* resolveAmbiguous(
            "owner/repo",
            makeOptions({ cwd: tempDir, projectDir: ".axm" }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "registry",
            origin: axmSkillDir,
            originalInput: "@owner/repo",
          });
          expect(Option.getOrNull(result[0]!.name)).toBe("@owner/repo");
        }),
      ),
    );

    it.effect("falls back to GitHub shorthand when AXM name not found", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("owner/repo", makeOptions({ cwd: tempDir }));

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

          const result = yield* resolveAmbiguous(
            "owner/repo",
            makeOptions({ cwd: tempDir, projectDir: ".axm" }),
          );

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

          const result = yield* resolveAmbiguous(
            "owner/repo",
            makeOptions({ cwd: tempDir, projectDir: ".axm", sources: ["github"] }),
          );

          // Should fall back to GitHub, not use registry
          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("github");
        }),
      ),
    );

    it.effect("returns empty when sources excludes both github and registry", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "owner/repo",
            makeOptions({ cwd: tempDir, sources: ["git"] }),
          );

          // Should return empty since neither registry nor github is allowed
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("skips GitHub when sources excludes github", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "owner/repo",
            makeOptions({ cwd: tempDir, sources: ["registry"] }),
          );

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

          const result = yield* resolveAmbiguous(
            "owner/repo",
            makeOptions({ cwd: tempDir, projectDir: ".axm", sources: ["registry"] }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("registry");
        }),
      ),
    );

    it.effect("respects sources filter with only github", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "owner/repo",
            makeOptions({ cwd: tempDir, sources: ["github"] }),
          );

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
          const result = yield* resolveAmbiguous("owner/repo", makeOptions({ cwd: tempDir }));

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "github",
            origin: "https://github.com/owner/repo",
            originalInput: "owner/repo",
          });
          expect(Option.isNone(result[0]!.ref)).toBe(true);
          expect(Option.isNone(result[0]!.path)).toBe(true);
        }),
      ),
    );

    it.effect("handles owner/repo@ref pattern", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "owner/repo@v1.0.0",
            makeOptions({ cwd: tempDir }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "github",
            origin: "https://github.com/owner/repo",
            originalInput: "owner/repo@v1.0.0",
          });
          expect(Option.getOrNull(result[0]!.ref)).toBe("v1.0.0");
          expect(Option.isNone(result[0]!.path)).toBe(true);
        }),
      ),
    );

    it.effect("handles owner/repo/path pattern", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "owner/repo/skills/my-skill",
            makeOptions({ cwd: tempDir }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "github",
            origin: "https://github.com/owner/repo",
            originalInput: "owner/repo/skills/my-skill",
          });
          expect(Option.getOrNull(result[0]!.path)).toBe("skills/my-skill");
          expect(Option.isNone(result[0]!.ref)).toBe(true);
        }),
      ),
    );

    it.effect("handles owner/repo/path@ref pattern", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "owner/repo/skills/my-skill@main",
            makeOptions({ cwd: tempDir }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "github",
            origin: "https://github.com/owner/repo",
            originalInput: "owner/repo/skills/my-skill@main",
          });
          expect(Option.getOrNull(result[0]!.ref)).toBe("main");
          expect(Option.getOrNull(result[0]!.path)).toBe("skills/my-skill");
        }),
      ),
    );

    it.effect("handles deeply nested path", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "owner/repo/a/b/c/d",
            makeOptions({ cwd: tempDir }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "github",
          });
          expect(Option.getOrNull(result[0]!.path)).toBe("a/b/c/d");
        }),
      ),
    );

    it.effect("handles branch name with slashes in @ref", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "owner/repo@feature/branch",
            makeOptions({ cwd: tempDir }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "github",
          });
          expect(Option.getOrNull(result[0]!.ref)).toBe("feature/branch");
          expect(Option.isNone(result[0]!.path)).toBe(true);
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

          const result = yield* resolveAmbiguous(
            "owner/repo@^1.0.0",
            makeOptions({ cwd: tempDir, projectDir: ".axm" }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "registry",
            originalInput: "@owner/repo@^1.0.0",
          });
          expect(Option.getOrNull(result[0]!.name)).toBe("@owner/repo");
          expect(Option.getOrNull(result[0]!.metadata.versionConstraint)).toBe("^1.0.0");
        }),
      ),
    );
  });

  describe("edge cases", () => {
    it.effect("handles input with leading/trailing whitespace", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("  owner/repo  ", makeOptions({ cwd: tempDir }));

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
          const result = yield* resolveAmbiguous(
            "my-org-123/my-repo-456",
            makeOptions({ cwd: tempDir }),
          );

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
          const result = yield* resolveAmbiguous("my_org/my_repo", makeOptions({ cwd: tempDir }));

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
          const result = yield* resolveAmbiguous("justname", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for input starting with dot", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(".hidden/repo", makeOptions({ cwd: tempDir }));
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
            const result = yield* resolveAmbiguous(
              "owner/repo",
              makeOptions({ cwd: tempDir, projectDir: ".axm", globalDir: "~/.axm-test-global" }),
            );

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
          const result = yield* resolveAmbiguous("owner/repo", makeOptions({ cwd: tempDir }));

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
            const result = yield* resolveAmbiguous("./my-skill", makeOptions({ cwd: tempDir }));

            expect(result).toEqual([]);
          }),
        ),
    );
  });
});
