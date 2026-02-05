import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defaultResolutionOptions } from "../resolver.js";
import type { ExtensionType, ResolutionOptions, SourceType } from "../types.js";
import { isLocalPath, resolveLocalPath } from "./local-path.js";

/**
 * Helper to create ResolutionOptions for tests.
 */
const makeOptions = (opts: {
  cwd?: string;
  projectDir?: string;
  globalDir?: string;
  scope?: string;
  types?: readonly ExtensionType[];
  sources?: readonly SourceType[];
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

describe("isLocalPath", () => {
  it("returns true for relative path with ./", () => {
    expect(isLocalPath("./path/to/skill")).toBe(true);
  });

  it("returns true for relative path with ../", () => {
    expect(isLocalPath("../sibling/skills")).toBe(true);
  });

  it("returns true for absolute POSIX path", () => {
    expect(isLocalPath("/home/user/skills")).toBe(true);
  });

  it("returns true for Windows path with drive letter", () => {
    expect(isLocalPath("C:\\Users\\name\\skills")).toBe(true);
  });

  it("returns true for Windows path with forward slash", () => {
    expect(isLocalPath("C:/Users/name/skills")).toBe(true);
  });

  it("returns true for home directory path ~/", () => {
    expect(isLocalPath("~/my-skills")).toBe(true);
  });

  it("returns true for home directory path ~\\", () => {
    expect(isLocalPath("~\\my-skills")).toBe(true);
  });

  it("returns false for GitHub shorthand", () => {
    expect(isLocalPath("owner/repo")).toBe(false);
  });

  it("returns false for AXM name", () => {
    expect(isLocalPath("@scope/name")).toBe(false);
  });

  it("returns false for bare name", () => {
    expect(isLocalPath("my-skill")).toBe(false);
  });

  it("returns false for URL", () => {
    expect(isLocalPath("https://github.com/owner/repo")).toBe(false);
  });

  it("returns false for explicit source prefix", () => {
    expect(isLocalPath("github:owner/repo")).toBe(false);
  });
});

describe("resolveLocalPath", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "local-path-resolver-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const withFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    effect.pipe(Effect.provide(NodeFileSystem.layer));

  describe("pattern matching", () => {
    it.effect("returns empty array for non-local path input", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveLocalPath("owner/repo", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for AXM name input", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveLocalPath("@scope/name", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("path resolution", () => {
    it.effect("returns empty array if path does not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveLocalPath("./nonexistent", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("resolves relative path against cwd option", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillDir = path.join(tempDir, "my-skill");
          fs.mkdirSync(skillDir);
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# My Skill");

          const result = yield* resolveLocalPath("./my-skill", makeOptions({ cwd: tempDir }));

          expect(result).toHaveLength(1);
          expect(result[0]?.origin).toBe(skillDir);
        }),
      ),
    );

    it.effect("handles absolute path directly", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillDir = path.join(tempDir, "my-skill");
          fs.mkdirSync(skillDir);
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# My Skill");

          const result = yield* resolveLocalPath(skillDir, makeOptions({ cwd: "/some/other/dir" }));

          expect(result).toHaveLength(1);
          expect(result[0]?.origin).toBe(skillDir);
        }),
      ),
    );

    it.effect("handles parent directory path", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillDir = path.join(tempDir, "my-skill");
          const nestedDir = path.join(tempDir, "nested");
          fs.mkdirSync(skillDir);
          fs.mkdirSync(nestedDir);
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# My Skill");

          const result = yield* resolveLocalPath("../my-skill", makeOptions({ cwd: nestedDir }));

          expect(result).toHaveLength(1);
          expect(result[0]?.origin).toBe(skillDir);
        }),
      ),
    );
  });

  describe("home directory expansion", () => {
    it.effect("expands ~ to home directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create a skill in user's home directory for testing
          const homeDir = os.homedir();
          const testSkillDir = path.join(homeDir, ".axm-test-skill-temp");

          // Skip if we can't create in home dir
          try {
            fs.mkdirSync(testSkillDir, { recursive: true });
            fs.writeFileSync(path.join(testSkillDir, "SKILL.md"), "# Test Skill");

            const result = yield* resolveLocalPath(
              "~/.axm-test-skill-temp",
              makeOptions({ cwd: tempDir }),
            );

            expect(result).toHaveLength(1);
            expect(result[0]?.origin).toBe(testSkillDir);
          } finally {
            // Cleanup
            fs.rmSync(testSkillDir, { recursive: true, force: true });
          }
        }),
      ),
    );
  });

  describe("directory scanning", () => {
    it.effect("discovers SKILL.md in directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillDir = path.join(tempDir, "my-skill");
          fs.mkdirSync(skillDir);
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# My Skill");

          const result = yield* resolveLocalPath("./my-skill", makeOptions({ cwd: tempDir }));

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "local",
            origin: skillDir,
            originalInput: "./my-skill",
          });
          expect(Option.getOrNull(result[0]!.metadata.files)).toEqual(["SKILL.md"]);
        }),
      ),
    );

    it.effect("returns empty array for empty directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          const emptyDir = path.join(tempDir, "empty");
          fs.mkdirSync(emptyDir);

          const result = yield* resolveLocalPath("./empty", makeOptions({ cwd: tempDir }));

          expect(result).toEqual([]);
        }),
      ),
    );
  });
});
