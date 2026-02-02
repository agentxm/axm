/**
 * Integration tests for the full resolution pipeline.
 *
 * Tests the complete resolution flow through all resolvers:
 * local-path -> axm-name -> bare-name -> explicit-source -> ambiguous -> url
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { resolveExtension } from "./resolver.js";

const withFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
  effect.pipe(Effect.provide(NodeFileSystem.layer));

describe("resolveExtension - integration tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "resolver-integration-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Resolver Order (Early Exit)
  // ---------------------------------------------------------------------------

  describe("resolver order and early exit", () => {
    it.effect("local path wins over GitHub shorthand for ambiguous pattern", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create local directory matching owner/repo pattern
          const localDir = path.join(tempDir, "owner", "repo");
          fs.mkdirSync(localDir, { recursive: true });
          fs.writeFileSync(path.join(localDir, "SKILL.md"), "# Local");

          // Should resolve as local path, not GitHub shorthand
          const result = yield* resolveExtension("owner/repo", {
            cwd: tempDir,
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("path");
          expect(result[0]?.origin).toBe(localDir);
        }),
      ),
    );

    it.effect("ambiguous pattern resolves to GitHub when local path not found", () =>
      withFileSystem(
        Effect.gen(function* () {
          // No local directory - should fall back to GitHub
          const result = yield* resolveExtension("owner/repo", {
            cwd: tempDir,
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("github");
          expect(result[0]?.origin).toBe("https://github.com/owner/repo");
        }),
      ),
    );

    it.effect("explicit source github:owner/repo is resolved correctly", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("github:owner/repo", {});

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("github");
          expect(result[0]?.origin).toBe("https://github.com/owner/repo");
          expect(result[0]?.originalInput).toBe("github:owner/repo");
        }),
      ),
    );

    it.effect("explicit source gitlab:owner/repo is resolved correctly", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("gitlab:owner/repo", {});

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("gitlab");
          expect(result[0]?.origin).toBe("https://gitlab.com/owner/repo");
        }),
      ),
    );

    it.effect("URL https://github.com/owner/repo is resolved correctly", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("https://github.com/owner/repo", {});

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("github");
          expect(result[0]?.origin).toBe("https://github.com/owner/repo");
        }),
      ),
    );

    it.effect("AXM name @scope/name resolves from project directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create project .axm directory with skill
          const axmDir = path.join(tempDir, ".axm", "skills", "@scope", "name");
          fs.mkdirSync(axmDir, { recursive: true });

          const result = yield* resolveExtension("@scope/name", {
            cwd: tempDir,
            projectDir: ".axm",
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("registry");
          expect(result[0]?.origin).toBe(axmDir);
          expect(result[0]?.name).toBe("@scope/name");
        }),
      ),
    );

    it.effect("bare name resolves with scope option", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create AXM directory with scoped name
          const axmDir = path.join(tempDir, ".axm", "skills", "@myscope", "myskill");
          fs.mkdirSync(axmDir, { recursive: true });

          const result = yield* resolveExtension("myskill", {
            cwd: tempDir,
            projectDir: ".axm",
            scope: "myscope",
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("registry");
          expect(result[0]?.name).toBe("@myscope/myskill");
        }),
      ),
    );

    it.effect("local path ./path wins over bare name", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create both local path and AXM name
          const localDir = path.join(tempDir, "myskill");
          fs.mkdirSync(localDir);
          fs.writeFileSync(path.join(localDir, "SKILL.md"), "# Local");

          const axmDir = path.join(tempDir, ".axm", "skills", "@myscope", "myskill");
          fs.mkdirSync(axmDir, { recursive: true });

          // Explicit local path should win
          const result = yield* resolveExtension("./myskill", {
            cwd: tempDir,
            projectDir: ".axm",
            scope: "myscope",
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("path");
          expect(result[0]?.origin).toBe(localDir);
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Type Filtering
  // ---------------------------------------------------------------------------

  describe("type filtering", () => {
    it.effect("returns only skills when types: ['skill']", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create directory with both skill and command
          const mixedDir = path.join(tempDir, "mixed");
          fs.mkdirSync(mixedDir);
          fs.writeFileSync(path.join(mixedDir, "SKILL.md"), "# Skill");
          fs.writeFileSync(path.join(mixedDir, "axm-command.json"), "{}");

          const result = yield* resolveExtension("./mixed", {
            cwd: tempDir,
            types: ["skill"],
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.type).toBe("skill");
        }),
      ),
    );

    it.effect("returns only commands when types: ['command']", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create directory with both skill and command
          const mixedDir = path.join(tempDir, "mixed");
          fs.mkdirSync(mixedDir);
          fs.writeFileSync(path.join(mixedDir, "SKILL.md"), "# Skill");
          fs.writeFileSync(path.join(mixedDir, "axm-command.json"), "{}");

          const result = yield* resolveExtension("./mixed", {
            cwd: tempDir,
            types: ["command"],
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.type).toBe("command");
        }),
      ),
    );

    it.effect("returns both types when types not specified", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create directory with both skill and command
          const mixedDir = path.join(tempDir, "mixed");
          fs.mkdirSync(mixedDir);
          fs.writeFileSync(path.join(mixedDir, "SKILL.md"), "# Skill");
          fs.writeFileSync(path.join(mixedDir, "axm-command.json"), "{}");

          const result = yield* resolveExtension("./mixed", { cwd: tempDir });

          expect(result).toHaveLength(2);
          const types = result.map((r) => r.type).sort();
          expect(types).toEqual(["command", "skill"]);
        }),
      ),
    );

    it.effect("returns empty when no results match type filter", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create directory with only skill
          const skillDir = path.join(tempDir, "skill-only");
          fs.mkdirSync(skillDir);
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Skill");

          // Filter for commands only - should be empty
          const result = yield* resolveExtension("./skill-only", {
            cwd: tempDir,
            types: ["command"],
          });

          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns mcp-server when types: ['mcp-server']", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create directory with mcp-server
          const serverDir = path.join(tempDir, "my-server");
          fs.mkdirSync(serverDir);
          fs.writeFileSync(path.join(serverDir, "axm-mcp-server.json"), "{}");

          const result = yield* resolveExtension("./my-server", {
            cwd: tempDir,
            types: ["mcp-server"],
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.type).toBe("mcp-server");
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Source Filtering
  // ---------------------------------------------------------------------------

  describe("source filtering", () => {
    it.effect("returns only path sources when sources: ['path']", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create local path that matches ambiguous pattern
          const localDir = path.join(tempDir, "owner", "repo");
          fs.mkdirSync(localDir, { recursive: true });
          fs.writeFileSync(path.join(localDir, "SKILL.md"), "# Local");

          const result = yield* resolveExtension("owner/repo", {
            cwd: tempDir,
            sources: ["path"],
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("path");
        }),
      ),
    );

    it.effect("returns only github sources when sources: ['github']", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create local path that matches ambiguous pattern
          const localDir = path.join(tempDir, "owner", "repo");
          fs.mkdirSync(localDir, { recursive: true });
          fs.writeFileSync(path.join(localDir, "SKILL.md"), "# Local");

          // Filter for GitHub only - should skip local path
          const result = yield* resolveExtension("owner/repo", {
            cwd: tempDir,
            sources: ["github"],
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("github");
          expect(result[0]?.origin).toBe("https://github.com/owner/repo");
        }),
      ),
    );

    it.effect("returns all sources when sources not specified", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create local path that matches ambiguous pattern
          const localDir = path.join(tempDir, "owner", "repo");
          fs.mkdirSync(localDir, { recursive: true });
          fs.writeFileSync(path.join(localDir, "SKILL.md"), "# Local");

          // No filter - should return first match (local path)
          const result = yield* resolveExtension("owner/repo", {
            cwd: tempDir,
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("path");
        }),
      ),
    );

    it.effect("returns gitlab when sources: ['gitlab']", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Explicit gitlab source
          const result = yield* resolveExtension("gitlab:owner/repo", {
            sources: ["gitlab"],
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("gitlab");
        }),
      ),
    );

    it.effect("returns empty when source is filtered out", () =>
      withFileSystem(
        Effect.gen(function* () {
          // GitHub URL but filter for path only
          const result = yield* resolveExtension("https://github.com/owner/repo", {
            sources: ["path"],
          });

          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns registry source for AXM name", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create AXM directory
          const axmDir = path.join(tempDir, ".axm", "skills", "@scope", "name");
          fs.mkdirSync(axmDir, { recursive: true });

          const result = yield* resolveExtension("@scope/name", {
            cwd: tempDir,
            projectDir: ".axm",
            sources: ["registry"],
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("registry");
        }),
      ),
    );

    it.effect("filters multiple sources correctly", () =>
      withFileSystem(
        Effect.gen(function* () {
          // GitHub URL should pass through github/gitlab filter
          const result = yield* resolveExtension("https://github.com/owner/repo", {
            sources: ["github", "gitlab"],
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("github");
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // End-to-End Scenarios
  // ---------------------------------------------------------------------------

  describe("end-to-end scenarios", () => {
    it.effect("empty input returns empty array", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("", { cwd: tempDir });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("whitespace-only input returns empty array", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("   ", { cwd: tempDir });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("unknown local path returns empty array", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("./nonexistent", {
            cwd: tempDir,
          });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("bare name without scope returns empty array", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("myskill", { cwd: tempDir });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("invalid input returns empty array", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("not@valid@input", {
            cwd: tempDir,
          });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("preserves originalInput through pipeline", () =>
      withFileSystem(
        Effect.gen(function* () {
          const input = "github:owner/repo";
          const result = yield* resolveExtension(input, {});

          expect(result).toHaveLength(1);
          expect(result[0]?.originalInput).toBe(input);
        }),
      ),
    );

    it.effect("handles version constraints in AXM names", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create AXM directory
          const axmDir = path.join(tempDir, ".axm", "skills", "@scope", "name");
          fs.mkdirSync(axmDir, { recursive: true });

          const result = yield* resolveExtension("@scope/name@^1.0.0", {
            cwd: tempDir,
            projectDir: ".axm",
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.metadata.versionConstraint).toBe("^1.0.0");
        }),
      ),
    );

    it.effect("handles git refs in GitHub URLs", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("github:owner/repo@v1.0.0", {});

          expect(result).toHaveLength(1);
          expect(result[0]?.ref).toBe("v1.0.0");
        }),
      ),
    );

    it.effect("handles subpaths in GitHub URLs", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("github:owner/repo/some/path", {});

          expect(result).toHaveLength(1);
          expect(result[0]?.path).toBe("some/path");
        }),
      ),
    );

    it.effect("handles direct HTTP URLs", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("https://example.com/skill.md", {});

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("direct-url");
          expect(result[0]?.origin).toBe("https://example.com/skill.md");
        }),
      ),
    );

    it.effect("handles SSH URLs", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("git@github.com:owner/repo.git", {});

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("github");
          expect(result[0]?.origin).toBe("https://github.com/owner/repo");
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Combined Type and Source Filtering
  // ---------------------------------------------------------------------------

  describe("combined type and source filtering", () => {
    it.effect("filters by both type and source", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create directory with multiple types
          const mixedDir = path.join(tempDir, "mixed");
          fs.mkdirSync(mixedDir);
          fs.writeFileSync(path.join(mixedDir, "SKILL.md"), "# Skill");
          fs.writeFileSync(path.join(mixedDir, "axm-command.json"), "{}");

          const result = yield* resolveExtension("./mixed", {
            cwd: tempDir,
            types: ["skill"],
            sources: ["path"],
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.type).toBe("skill");
          expect(result[0]?.source).toBe("path");
        }),
      ),
    );

    it.effect("returns empty when type matches but source filtered", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Local skill, but filtering for github source
          const skillDir = path.join(tempDir, "my-skill");
          fs.mkdirSync(skillDir);
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Skill");

          const result = yield* resolveExtension("./my-skill", {
            cwd: tempDir,
            types: ["skill"],
            sources: ["github"],
          });

          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty when source matches but type filtered", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Local skill, but filtering for command type
          const skillDir = path.join(tempDir, "my-skill");
          fs.mkdirSync(skillDir);
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Skill");

          const result = yield* resolveExtension("./my-skill", {
            cwd: tempDir,
            types: ["command"],
            sources: ["path"],
          });

          expect(result).toEqual([]);
        }),
      ),
    );
  });
});
