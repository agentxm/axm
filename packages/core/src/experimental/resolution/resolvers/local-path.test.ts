import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { isLocalPath, resolveLocalPath } from "./local-path.js";

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
          const result = yield* resolveLocalPath("owner/repo", { cwd: tempDir });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for AXM name input", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveLocalPath("@scope/name", { cwd: tempDir });
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("path resolution", () => {
    it.effect("returns empty array if path does not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveLocalPath("./nonexistent", { cwd: tempDir });
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

          const result = yield* resolveLocalPath("./my-skill", { cwd: tempDir });

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

          const result = yield* resolveLocalPath(skillDir, { cwd: "/some/other/dir" });

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

          const result = yield* resolveLocalPath("../my-skill", { cwd: nestedDir });

          expect(result).toHaveLength(1);
          expect(result[0]?.origin).toBe(skillDir);
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

          const result = yield* resolveLocalPath("./my-skill", { cwd: tempDir });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "path",
            origin: skillDir,
            originalInput: "./my-skill",
            metadata: { files: ["SKILL.md"] },
          });
        }),
      ),
    );

    it.effect("discovers lowercase skill.md in directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillDir = path.join(tempDir, "my-skill");
          fs.mkdirSync(skillDir);
          fs.writeFileSync(path.join(skillDir, "skill.md"), "# My Skill");

          const result = yield* resolveLocalPath("./my-skill", { cwd: tempDir });

          expect(result).toHaveLength(1);
          expect(result[0]?.type).toBe("skill");
          // On case-insensitive file systems (macOS), SKILL.md may be found first
          const files = result[0]?.metadata.files ?? [];
          expect(files.some((f) => f.toLowerCase() === "skill.md")).toBe(true);
        }),
      ),
    );

    it.effect("discovers axm-skill.json in directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillDir = path.join(tempDir, "my-skill");
          fs.mkdirSync(skillDir);
          fs.writeFileSync(path.join(skillDir, "axm-skill.json"), "{}");

          const result = yield* resolveLocalPath("./my-skill", { cwd: tempDir });

          expect(result).toHaveLength(1);
          expect(result[0]?.type).toBe("skill");
          expect(result[0]?.metadata.files).toContain("axm-skill.json");
        }),
      ),
    );

    it.effect("discovers axm-command.json in directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          const cmdDir = path.join(tempDir, "my-command");
          fs.mkdirSync(cmdDir);
          fs.writeFileSync(path.join(cmdDir, "axm-command.json"), "{}");

          const result = yield* resolveLocalPath("./my-command", { cwd: tempDir });

          expect(result).toHaveLength(1);
          expect(result[0]?.type).toBe("command");
          expect(result[0]?.metadata.files).toContain("axm-command.json");
        }),
      ),
    );

    it.effect("discovers axm-mcp-server.json in directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          const serverDir = path.join(tempDir, "my-server");
          fs.mkdirSync(serverDir);
          fs.writeFileSync(path.join(serverDir, "axm-mcp-server.json"), "{}");

          const result = yield* resolveLocalPath("./my-server", { cwd: tempDir });

          expect(result).toHaveLength(1);
          expect(result[0]?.type).toBe("mcp-server");
          expect(result[0]?.metadata.files).toContain("axm-mcp-server.json");
        }),
      ),
    );

    it.effect("returns multiple refs for directory with multiple extension types", () =>
      withFileSystem(
        Effect.gen(function* () {
          const mixedDir = path.join(tempDir, "mixed");
          fs.mkdirSync(mixedDir);
          fs.writeFileSync(path.join(mixedDir, "SKILL.md"), "# Skill");
          fs.writeFileSync(path.join(mixedDir, "axm-command.json"), "{}");

          const result = yield* resolveLocalPath("./mixed", { cwd: tempDir });

          expect(result).toHaveLength(2);
          const types = result.map((r) => r.type).sort();
          expect(types).toEqual(["command", "skill"]);
        }),
      ),
    );

    it.effect("avoids duplicate skill entries for multiple SKILL.md variants", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillDir = path.join(tempDir, "my-skill");
          fs.mkdirSync(skillDir);
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Uppercase");
          fs.writeFileSync(path.join(skillDir, "skill.md"), "# Lowercase");

          const result = yield* resolveLocalPath("./my-skill", { cwd: tempDir });

          // Should only return one skill entry (first found)
          const skillRefs = result.filter((r) => r.type === "skill");
          expect(skillRefs).toHaveLength(1);
        }),
      ),
    );

    it.effect("returns empty array for empty directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          const emptyDir = path.join(tempDir, "empty");
          fs.mkdirSync(emptyDir);

          const result = yield* resolveLocalPath("./empty", { cwd: tempDir });

          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for directory with non-extension files", () =>
      withFileSystem(
        Effect.gen(function* () {
          const otherDir = path.join(tempDir, "other");
          fs.mkdirSync(otherDir);
          fs.writeFileSync(path.join(otherDir, "README.md"), "# Readme");
          fs.writeFileSync(path.join(otherDir, "index.ts"), "export {}");

          const result = yield* resolveLocalPath("./other", { cwd: tempDir });

          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("file path handling", () => {
    it.effect("handles direct path to SKILL.md file", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillDir = path.join(tempDir, "my-skill");
          fs.mkdirSync(skillDir);
          const skillFile = path.join(skillDir, "SKILL.md");
          fs.writeFileSync(skillFile, "# My Skill");

          const result = yield* resolveLocalPath("./my-skill/SKILL.md", { cwd: tempDir });

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "path",
            origin: skillDir,
            originalInput: "./my-skill/SKILL.md",
            metadata: { files: ["SKILL.md"] },
          });
        }),
      ),
    );

    it.effect("handles direct path to axm-skill.json file", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillDir = path.join(tempDir, "my-skill");
          fs.mkdirSync(skillDir);
          const manifestFile = path.join(skillDir, "axm-skill.json");
          fs.writeFileSync(manifestFile, "{}");

          const result = yield* resolveLocalPath("./my-skill/axm-skill.json", { cwd: tempDir });

          expect(result).toHaveLength(1);
          expect(result[0]?.type).toBe("skill");
        }),
      ),
    );

    it.effect("handles direct path to axm-command.json file", () =>
      withFileSystem(
        Effect.gen(function* () {
          const cmdDir = path.join(tempDir, "my-cmd");
          fs.mkdirSync(cmdDir);
          const manifestFile = path.join(cmdDir, "axm-command.json");
          fs.writeFileSync(manifestFile, "{}");

          const result = yield* resolveLocalPath("./my-cmd/axm-command.json", { cwd: tempDir });

          expect(result).toHaveLength(1);
          expect(result[0]?.type).toBe("command");
        }),
      ),
    );

    it.effect("handles direct path to axm-mcp-server.json file", () =>
      withFileSystem(
        Effect.gen(function* () {
          const serverDir = path.join(tempDir, "my-server");
          fs.mkdirSync(serverDir);
          const manifestFile = path.join(serverDir, "axm-mcp-server.json");
          fs.writeFileSync(manifestFile, "{}");

          const result = yield* resolveLocalPath("./my-server/axm-mcp-server.json", {
            cwd: tempDir,
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.type).toBe("mcp-server");
        }),
      ),
    );

    it.effect("returns empty array for unrecognized file type", () =>
      withFileSystem(
        Effect.gen(function* () {
          const otherDir = path.join(tempDir, "other");
          fs.mkdirSync(otherDir);
          const otherFile = path.join(otherDir, "README.md");
          fs.writeFileSync(otherFile, "# Readme");

          const result = yield* resolveLocalPath("./other/README.md", { cwd: tempDir });

          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for file path that doesn't exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillDir = path.join(tempDir, "my-skill");
          fs.mkdirSync(skillDir);
          // Note: SKILL.md doesn't actually exist

          const result = yield* resolveLocalPath("./my-skill/SKILL.md", { cwd: tempDir });

          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("cwd handling", () => {
    it.effect("uses process.cwd() when cwd option not provided", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create skill in tempDir
          const skillDir = path.join(tempDir, "my-skill");
          fs.mkdirSync(skillDir);
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# My Skill");

          // Use absolute path since we're not changing process.cwd()
          const result = yield* resolveLocalPath(skillDir, {});

          expect(result).toHaveLength(1);
          expect(result[0]?.origin).toBe(skillDir);
        }),
      ),
    );
  });
});
