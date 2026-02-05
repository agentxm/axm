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
import * as Option from "effect/Option";
import { defaultResolutionOptions } from "../resolver.js";
import type { ExtensionType, ResolutionOptions, Source } from "../types.js";
import { resolveBareName } from "./bare-name.js";

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
          const result = yield* resolveBareName("owner/repo", makeOptions({ scope: "myscope" }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for input with @ at start", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("@scope/name", makeOptions({ scope: "myscope" }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for GitHub shorthand", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("user/repo", makeOptions({ scope: "myscope" }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for explicit source prefix", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName(
            "github:owner/repo",
            makeOptions({ scope: "myscope" }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for local path with ./", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("./local/path", makeOptions({ scope: "myscope" }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for local path with ../", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName(
            "../parent/path",
            makeOptions({ scope: "myscope" }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for absolute POSIX path", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName(
            "/absolute/path",
            makeOptions({ scope: "myscope" }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("scope handling", () => {
    it.effect("returns empty array when no scope configured", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("my-skill", makeOptions({}));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array when scope is empty string", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("my-skill", makeOptions({ scope: "" }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array when scope is undefined", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("my-skill", makeOptions({}));
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

          const result = yield* resolveBareName(
            "my-skill",
            makeOptions({ scope: "myscope", cwd: tempDir, projectDir: ".axm" }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "registry",
            originalInput: "my-skill",
          });
          expect(Option.getOrNull(result[0]!.name)).toBe("@myscope/my-skill");
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

          const result = yield* resolveBareName(
            "grappling-hook",
            makeOptions({ scope: "wayne", cwd: tempDir, projectDir: ".axm" }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "registry",
            origin: axmDir,
            originalInput: "grappling-hook",
          });
          expect(Option.getOrNull(result[0]!.name)).toBe("@wayne/grappling-hook");
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

          const result = yield* resolveBareName(
            "tool",
            makeOptions({
              scope: "global",
              cwd: tempDir,
              projectDir: ".axm",
              globalDir: globalAxmDir,
            }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "registry",
            origin: skillDir,
            originalInput: "tool",
          });
          expect(Option.getOrNull(result[0]!.name)).toBe("@global/tool");
        }),
      ),
    );

    it.effect("returns empty array when transformed name not found", () =>
      withFileSystem(
        Effect.gen(function* () {
          // No skill directory created
          const result = yield* resolveBareName(
            "nonexistent",
            makeOptions({ scope: "myscope", cwd: tempDir, projectDir: ".axm" }),
          );

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

          const result = yield* resolveBareName(
            "my-test-skill",
            makeOptions({ scope: "scope", cwd: tempDir, projectDir: ".axm" }),
          );

          expect(result).toHaveLength(1);
          expect(Option.getOrNull(result[0]!.name)).toBe("@scope/my-test-skill");
        }),
      ),
    );

    it.effect("handles bare names with underscores", () =>
      withFileSystem(
        Effect.gen(function* () {
          const axmDir = path.join(tempDir, ".axm", "skills", "@scope", "my_skill");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "SKILL.md"), "# My Skill");

          const result = yield* resolveBareName(
            "my_skill",
            makeOptions({ scope: "scope", cwd: tempDir, projectDir: ".axm" }),
          );

          expect(result).toHaveLength(1);
          expect(Option.getOrNull(result[0]!.name)).toBe("@scope/my_skill");
        }),
      ),
    );

    it.effect("handles bare names with numbers", () =>
      withFileSystem(
        Effect.gen(function* () {
          const axmDir = path.join(tempDir, ".axm", "skills", "@scope", "tool2");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "SKILL.md"), "# Tool 2");

          const result = yield* resolveBareName(
            "tool2",
            makeOptions({ scope: "scope", cwd: tempDir, projectDir: ".axm" }),
          );

          expect(result).toHaveLength(1);
          expect(Option.getOrNull(result[0]!.name)).toBe("@scope/tool2");
        }),
      ),
    );
  });

  describe("edge cases", () => {
    it.effect("handles empty string input", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("", makeOptions({ scope: "myscope" }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("handles whitespace-only input", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveBareName("   ", makeOptions({ scope: "myscope" }));
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

          const result = yield* resolveBareName(
            "skill",
            makeOptions({ scope: "my-scope", cwd: tempDir, projectDir: ".axm" }),
          );

          expect(result).toHaveLength(1);
          expect(Option.getOrNull(result[0]!.name)).toBe("@my-scope/skill");
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

          const result = yield* resolveBareName(
            "shared",
            makeOptions({
              scope: "scope",
              cwd: tempDir,
              projectDir: ".axm",
              globalDir: globalAxmDir,
            }),
          );

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

          const result = yield* resolveBareName(
            "preserve-test",
            makeOptions({ scope: "scope", cwd: tempDir, projectDir: ".axm" }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]?.originalInput).toBe("preserve-test");
        }),
      ),
    );
  });
});
