/**
 * Integration tests for the full resolution pipeline.
 *
 * Tests the complete resolution flow through all resolvers:
 * axm-name -> bare-name -> explicit-source -> ambiguous -> url
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defaultResolutionOptions, resolveExtension } from "./resolver.js";
import type { ExtensionType, ResolutionOptions, SourceType } from "./types.js";

/**
 * Helper to create ResolutionOptions for tests.
 * Merges provided options with defaults.
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
    it.effect("ambiguous pattern owner/repo resolves to GitHub", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("owner/repo", makeOptions({ cwd: tempDir }));

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("github");
          expect(result[0]?.origin).toBe("https://github.com/owner/repo");
        }),
      ),
    );

    it.effect("explicit source github:owner/repo is resolved correctly", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("github:owner/repo", makeOptions({}));

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
          const result = yield* resolveExtension("gitlab:owner/repo", makeOptions({}));

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("gitlab");
          expect(result[0]?.origin).toBe("https://gitlab.com/owner/repo");
        }),
      ),
    );

    it.effect("URL https://github.com/owner/repo is resolved correctly", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("https://github.com/owner/repo", makeOptions({}));

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

          const result = yield* resolveExtension(
            "@scope/name",
            makeOptions({ cwd: tempDir, projectDir: ".axm" }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("registry");
          expect(result[0]?.origin).toBe(axmDir);
          expect(Option.getOrNull(result[0]!.name)).toBe("@scope/name");
        }),
      ),
    );

    it.effect("bare name resolves with scope option", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create AXM directory with scoped name
          const axmDir = path.join(tempDir, ".axm", "skills", "@myscope", "myskill");
          fs.mkdirSync(axmDir, { recursive: true });

          const result = yield* resolveExtension(
            "myskill",
            makeOptions({ cwd: tempDir, projectDir: ".axm", scope: "myscope" }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("registry");
          expect(Option.getOrNull(result[0]!.name)).toBe("@myscope/myskill");
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Type Filtering
  // ---------------------------------------------------------------------------

  describe("type filtering", () => {
    // Note: The AXM name resolver currently returns type: "skill" for all resolved extensions.
    // Type detection from filesystem markers (SKILL.md, axm-command.json, etc.) is not yet implemented.
    // These tests verify the current behavior with skill type filtering.

    it.effect("returns skill when types: ['skill']", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create registry directory
          const skillDir = path.join(tempDir, ".axm", "skills", "@scope", "my-skill");
          fs.mkdirSync(skillDir, { recursive: true });

          const result = yield* resolveExtension(
            "@scope/my-skill",
            makeOptions({ cwd: tempDir, projectDir: ".axm", types: ["skill"] }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]?.type).toBe("skill");
        }),
      ),
    );

    it.effect("returns empty when filtering for command type (not yet supported)", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create registry directory - resolver returns skill type
          const skillDir = path.join(tempDir, ".axm", "skills", "@scope", "my-skill");
          fs.mkdirSync(skillDir, { recursive: true });

          // Filter for commands - should be empty since resolver returns skill
          const result = yield* resolveExtension(
            "@scope/my-skill",
            makeOptions({ cwd: tempDir, projectDir: ".axm", types: ["command"] }),
          );

          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns skill when no type filter specified", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create registry directory
          const skillDir = path.join(tempDir, ".axm", "skills", "@scope", "my-skill");
          fs.mkdirSync(skillDir, { recursive: true });

          const result = yield* resolveExtension(
            "@scope/my-skill",
            makeOptions({ cwd: tempDir, projectDir: ".axm" }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]?.type).toBe("skill");
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Source Filtering
  // ---------------------------------------------------------------------------

  describe("source filtering", () => {
    it.effect("returns only github sources when sources: ['github']", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Ambiguous pattern resolves to GitHub
          const result = yield* resolveExtension(
            "owner/repo",
            makeOptions({ cwd: tempDir, sources: ["github"] }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("github");
          expect(result[0]?.origin).toBe("https://github.com/owner/repo");
        }),
      ),
    );

    it.effect("returns github for ambiguous pattern when sources not specified", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Ambiguous pattern resolves to GitHub
          const result = yield* resolveExtension("owner/repo", makeOptions({ cwd: tempDir }));

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("github");
        }),
      ),
    );

    it.effect("returns gitlab when sources: ['gitlab']", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Explicit gitlab source
          const result = yield* resolveExtension(
            "gitlab:owner/repo",
            makeOptions({ sources: ["gitlab"] }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("gitlab");
        }),
      ),
    );

    it.effect("returns empty when source is filtered out", () =>
      withFileSystem(
        Effect.gen(function* () {
          // GitHub URL but filter for git only
          const result = yield* resolveExtension(
            "https://github.com/owner/repo",
            makeOptions({ sources: ["git"] }),
          );

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

          const result = yield* resolveExtension(
            "@scope/name",
            makeOptions({ cwd: tempDir, projectDir: ".axm", sources: ["registry"] }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("registry");
        }),
      ),
    );

    it.effect("filters multiple sources correctly", () =>
      withFileSystem(
        Effect.gen(function* () {
          // GitHub URL should pass through github/gitlab filter
          const result = yield* resolveExtension(
            "https://github.com/owner/repo",
            makeOptions({ sources: ["github", "gitlab"] }),
          );

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
          const result = yield* resolveExtension("", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("whitespace-only input returns empty array", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("   ", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("unknown AXM name returns empty array", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension(
            "@scope/nonexistent",
            makeOptions({ cwd: tempDir, projectDir: ".axm" }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("bare name without scope returns empty array", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("myskill", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("invalid input returns empty array", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("not@valid@input", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("preserves originalInput through pipeline", () =>
      withFileSystem(
        Effect.gen(function* () {
          const input = "github:owner/repo";
          const result = yield* resolveExtension(input, makeOptions({}));

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

          const result = yield* resolveExtension(
            "@scope/name@^1.0.0",
            makeOptions({ cwd: tempDir, projectDir: ".axm" }),
          );

          expect(result).toHaveLength(1);
          expect(Option.getOrNull(result[0]!.metadata.versionConstraint)).toBe("^1.0.0");
        }),
      ),
    );

    it.effect("handles git refs in GitHub URLs", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("github:owner/repo@v1.0.0", makeOptions({}));

          expect(result).toHaveLength(1);
          expect(Option.getOrNull(result[0]!.ref)).toBe("v1.0.0");
        }),
      ),
    );

    it.effect("handles subpaths in GitHub URLs", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("github:owner/repo/some/path", makeOptions({}));

          expect(result).toHaveLength(1);
          expect(Option.getOrNull(result[0]!.path)).toBe("some/path");
        }),
      ),
    );

    it.effect("non-git URLs return empty (direct-url source not in SourceType)", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Non-git URLs (like https://example.com) are resolved by URL resolver
          // as "direct-url" or "well-known" source types, which are not in SourceType
          // and get filtered out by the resolver pipeline
          const result = yield* resolveExtension("https://example.com/skill.md", makeOptions({}));

          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("handles SSH URLs", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("git@github.com:owner/repo.git", makeOptions({}));

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("github");
          expect(result[0]?.origin).toBe("https://github.com/owner/repo");
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Local Path Resolution
  // ---------------------------------------------------------------------------

  describe("local path resolution", () => {
    it.effect("resolves ./path to local extension", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillDir = path.join(tempDir, "my-skill");
          fs.mkdirSync(skillDir);
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# My Skill");

          const result = yield* resolveExtension("./my-skill", makeOptions({ cwd: tempDir }));

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "local",
            origin: skillDir,
            originalInput: "./my-skill",
          });
        }),
      ),
    );

    it.effect("resolves absolute path to local extension", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillDir = path.join(tempDir, "my-skill");
          fs.mkdirSync(skillDir);
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# My Skill");

          const result = yield* resolveExtension(skillDir, makeOptions({ cwd: "/other/dir" }));

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("local");
          expect(result[0]?.origin).toBe(skillDir);
        }),
      ),
    );

    it.effect("returns empty array for non-existent local path", () =>
      withFileSystem(
        Effect.gen(function* () {
          const result = yield* resolveExtension("./nonexistent", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("filters local sources by source option", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skillDir = path.join(tempDir, "my-skill");
          fs.mkdirSync(skillDir);
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# My Skill");

          // Filter to only github sources - should exclude local
          const result = yield* resolveExtension(
            "./my-skill",
            makeOptions({ cwd: tempDir, sources: ["github"] }),
          );

          expect(result).toEqual([]);
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
          // Create registry directory with multiple types
          const mixedDir = path.join(tempDir, ".axm", "skills", "@scope", "mixed");
          fs.mkdirSync(mixedDir, { recursive: true });
          fs.writeFileSync(path.join(mixedDir, "SKILL.md"), "# Skill");
          fs.writeFileSync(path.join(mixedDir, "axm-command.json"), "{}");

          const result = yield* resolveExtension(
            "@scope/mixed",
            makeOptions({
              cwd: tempDir,
              projectDir: ".axm",
              types: ["skill"],
              sources: ["registry"],
            }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]?.type).toBe("skill");
          expect(result[0]?.source).toBe("registry");
        }),
      ),
    );

    it.effect("returns empty when type matches but source filtered", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Registry skill, but filtering for github source
          const skillDir = path.join(tempDir, ".axm", "skills", "@scope", "my-skill");
          fs.mkdirSync(skillDir, { recursive: true });
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Skill");

          const result = yield* resolveExtension(
            "@scope/my-skill",
            makeOptions({
              cwd: tempDir,
              projectDir: ".axm",
              types: ["skill"],
              sources: ["github"],
            }),
          );

          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty when source matches but type filtered", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Registry skill, but filtering for command type
          const skillDir = path.join(tempDir, ".axm", "skills", "@scope", "my-skill");
          fs.mkdirSync(skillDir, { recursive: true });
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Skill");

          const result = yield* resolveExtension(
            "@scope/my-skill",
            makeOptions({
              cwd: tempDir,
              projectDir: ".axm",
              types: ["command"],
              sources: ["registry"],
            }),
          );

          expect(result).toEqual([]);
        }),
      ),
    );
  });
});
