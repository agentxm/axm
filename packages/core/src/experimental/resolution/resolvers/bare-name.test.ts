/**
 * Unit tests for bare-name resolver.
 *
 * Tests resolution of bare names (single identifiers without `/` or `@`)
 * by prepending the configured scope and delegating to AXM name resolution.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { ResolutionOptions } from "../types.js";
import { resolveBareName } from "./bare-name.js";

describe("bare-name resolver", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bare-name-resolver-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const withFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    effect.pipe(Effect.provide(NodeFileSystem.layer));

  describe("pattern matching", () => {
    it.effect("returns empty array for input with /", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("owner/repo", { scope: "myscope" });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for input with @ at start", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("@scope/name", { scope: "myscope" });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for GitHub shorthand", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("user/repo", { scope: "myscope" });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for explicit source prefix", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("github:owner/repo", { scope: "myscope" });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for local path with ./", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("./local/path", { scope: "myscope" });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for local path with ../", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("../parent/path", { scope: "myscope" });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for absolute POSIX path", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("/absolute/path", { scope: "myscope" });
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("scope handling", () => {
    it.effect("returns empty array when no scope configured", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("my-skill", {});
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array when scope is empty string", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("my-skill", { scope: "" });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array when scope is undefined", () =>
      withFileSystem(
        Effect.gen(function* () {
          const options: ResolutionOptions = {};
          const result = yield* resolveBareName("my-skill", options);
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("resolution delegation", () => {
    it.effect("transforms bare name using configured scope", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create project .axm directory structure with @myscope/my-skill
          const axmDir = path.join(tempDir, ".axm", "skills", "@myscope", "my-skill");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "SKILL.md"), "# My Skill");

          const result = yield* resolveBareName("my-skill", {
            scope: "myscope",
            cwd: tempDir,
            projectDir: ".axm",
          });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "registry",
            name: "@myscope/my-skill",
            originalInput: "my-skill",
          });
        }),
      ),
    );

    it.effect("resolves skill at project level", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create project .axm directory structure
          const axmDir = path.join(tempDir, ".axm", "skills", "@wayne", "grappling-hook");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "SKILL.md"), "# Grappling Hook");

          const result = yield* resolveBareName("grappling-hook", {
            scope: "wayne",
            cwd: tempDir,
            projectDir: ".axm",
          });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "registry",
            origin: axmDir,
            name: "@wayne/grappling-hook",
            originalInput: "grappling-hook",
          });
        }),
      ),
    );

    it.effect("resolves skill at global level when not found at project level", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create global .axm directory structure
          const globalAxmDir = path.join(tempDir, "global-axm");
          const skillDir = path.join(globalAxmDir, "skills", "@global", "tool");
          fs.mkdirSync(skillDir, { recursive: true });
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Global Tool");

          const result = yield* resolveBareName("tool", {
            scope: "global",
            cwd: tempDir,
            projectDir: ".axm", // Project dir doesn't have the skill
            globalDir: globalAxmDir,
          });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "registry",
            origin: skillDir,
            name: "@global/tool",
            originalInput: "tool",
          });
        }),
      ),
    );

    it.effect("returns empty array when transformed name not found", () =>
      withFileSystem(
        Effect.gen(function* () {
          // No skill directory created
          const result = yield* resolveBareName("nonexistent", {
            scope: "myscope",
            cwd: tempDir,
            projectDir: ".axm",
          });

          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("handles bare names with hyphens", () =>
      withFileSystem(
        Effect.gen(function* () {
          const axmDir = path.join(tempDir, ".axm", "skills", "@scope", "my-test-skill");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "SKILL.md"), "# My Test Skill");

          const result = yield* resolveBareName("my-test-skill", {
            scope: "scope",
            cwd: tempDir,
            projectDir: ".axm",
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.name).toBe("@scope/my-test-skill");
        }),
      ),
    );

    it.effect("handles bare names with underscores", () =>
      withFileSystem(
        Effect.gen(function* () {
          const axmDir = path.join(tempDir, ".axm", "skills", "@scope", "my_skill");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "SKILL.md"), "# My Skill");

          const result = yield* resolveBareName("my_skill", {
            scope: "scope",
            cwd: tempDir,
            projectDir: ".axm",
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.name).toBe("@scope/my_skill");
        }),
      ),
    );

    it.effect("handles bare names with numbers", () =>
      withFileSystem(
        Effect.gen(function* () {
          const axmDir = path.join(tempDir, ".axm", "skills", "@scope", "tool2");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "SKILL.md"), "# Tool 2");

          const result = yield* resolveBareName("tool2", {
            scope: "scope",
            cwd: tempDir,
            projectDir: ".axm",
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.name).toBe("@scope/tool2");
        }),
      ),
    );
  });

  describe("edge cases", () => {
    it.effect("handles empty string input", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("", { scope: "myscope" });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("handles whitespace-only input", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("   ", { scope: "myscope" });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("handles scope with special characters", () =>
      withFileSystem(
        Effect.gen(function* () {
          const axmDir = path.join(tempDir, ".axm", "skills", "@my-scope", "skill");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "SKILL.md"), "# Skill");

          const result = yield* resolveBareName("skill", {
            scope: "my-scope",
            cwd: tempDir,
            projectDir: ".axm",
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.name).toBe("@my-scope/skill");
        }),
      ),
    );

    it.effect("prefers project level over global level", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create both project and global versions
          const projectSkillDir = path.join(tempDir, ".axm", "skills", "@scope", "shared");
          fs.mkdirSync(projectSkillDir, { recursive: true });
          fs.writeFileSync(path.join(projectSkillDir, "SKILL.md"), "# Project Version");

          const globalAxmDir = path.join(tempDir, "global-axm");
          const globalSkillDir = path.join(globalAxmDir, "skills", "@scope", "shared");
          fs.mkdirSync(globalSkillDir, { recursive: true });
          fs.writeFileSync(path.join(globalSkillDir, "SKILL.md"), "# Global Version");

          const result = yield* resolveBareName("shared", {
            scope: "scope",
            cwd: tempDir,
            projectDir: ".axm",
            globalDir: globalAxmDir,
          });

          expect(result).toHaveLength(1);
          // Should use project version
          expect(result[0]?.origin).toBe(projectSkillDir);
        }),
      ),
    );
  });

  describe("originalInput preservation", () => {
    it.effect("preserves original bare name input", () =>
      withFileSystem(
        Effect.gen(function* () {
          const axmDir = path.join(tempDir, ".axm", "skills", "@scope", "preserve-test");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "SKILL.md"), "# Test");

          const result = yield* resolveBareName("preserve-test", {
            scope: "scope",
            cwd: tempDir,
            projectDir: ".axm",
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.originalInput).toBe("preserve-test");
        }),
      ),
    );
  });
});
