import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { SourceConfig } from "../../settings/index.js";
import type { SourceType } from "../../sources/index.js";
import { Workspace } from "../../workspace/index.js";
import { defaultResolutionOptions } from "../resolver.js";
import type { ExtensionType, ResolutionOptions } from "../types.js";
import { resolveAmbiguous } from "./ambiguous.js";

/**
 * Default built-in sources for tests (matches workspace defaults).
 */
const DEFAULT_SOURCES: ReadonlyArray<SourceConfig> = [
  { name: "github", type: "github", url: new URL("https://github.com") },
  { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
  { name: "bitbucket", type: "bitbucket", url: new URL("https://bitbucket.org") },
];

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

describe("resolveAmbiguous", () => {
  let tempDir: string;
  let projectAxmDir: string;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ambiguous-resolver-test-"));
    projectAxmDir = path.join(tempDir, ".axm");
    fs.mkdirSync(projectAxmDir, { recursive: true });
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const mockFetch = (responses: Record<string, { ok: boolean } | "error">): void => {
    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      const response = responses[urlStr];
      if (response === "error") return Promise.reject(new Error("Network error"));
      if (response) return Promise.resolve(new Response(null, { status: response.ok ? 200 : 404 }));
      return Promise.resolve(new Response(null, { status: 404 }));
    }) as unknown as typeof globalThis.fetch;
  };

  /**
   * Create mock Workspace layer with custom sources.
   */
  const mockWorkspaceLayer = (sources: ReadonlyArray<SourceConfig> = []) =>
    Layer.succeed(Workspace, {
      global: false,
      path: tempDir,
      nonInteractive: false,
      preview: false,
      resolvePlan: vi.fn(),
      getConfiguredSources: () => Effect.succeed(sources),
      getConfiguredSourceByName: vi.fn(),
      getConfiguredRegistrySources: vi.fn(),
      getConfiguredScope: () => Effect.succeed("default"),
      addConfiguredSource: vi.fn(),
      getConfiguredSkills: vi.fn(() => Effect.succeed({})),
      getInstalledSkills: vi.fn(() => Effect.succeed({})),
      getConfiguredAgents: vi.fn(() => Effect.succeed([])),
      getLockedSkills: vi.fn(() => Effect.succeed({})),
      getLockedSkill: vi.fn(() => Effect.succeed(Option.none())),
      setSkill: vi.fn(() => Effect.void),
      removeSkill: vi.fn(() => Effect.void),
      updateSkillEntry: vi.fn(() => Effect.void),
      renameSkill: vi.fn(() => Effect.void),
      updateLockEntryAgents: vi.fn(() => Effect.void),
      addConfiguredAgent: vi.fn(() => Effect.void),
    });

  const withDependencies = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    sources: ReadonlyArray<SourceConfig> = DEFAULT_SOURCES,
  ) => effect.pipe(Effect.provide(Layer.merge(NodeFileSystem.layer, mockWorkspaceLayer(sources))));

  describe("pattern detection (non-matching)", () => {
    it.effect("returns empty for github:owner/repo (has prefix)", () =>
      withDependencies(
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
      withDependencies(
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
      withDependencies(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("@scope/name", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for ./path (local path)", () =>
      withDependencies(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("./path", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for ../path (local path)", () =>
      withDependencies(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("../path", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for /absolute/path (local path)", () =>
      withDependencies(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("/absolute/path", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for ~/path (home directory path)", () =>
      withDependencies(
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
      withDependencies(
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
      withDependencies(
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
      withDependencies(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for whitespace-only string", () =>
      withDependencies(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("   ", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for git@github.com:owner/repo.git (SSH URL)", () =>
      withDependencies(
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
      withDependencies(
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
      withDependencies(
        Effect.gen(function* () {
          mockFetch({ "https://github.com/owner/repo": { ok: true } });
          const result = yield* resolveAmbiguous("owner/repo", makeOptions({ cwd: tempDir }));

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            type: "skill",
            source: "github",
            origin: "https://github.com/owner/repo",
            originalInput: "owner/repo",
          });
        }),
        DEFAULT_SOURCES,
      ),
    );

    it.effect("prefers AXM over GitHub when AXM exists", () =>
      withDependencies(
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
      withDependencies(
        Effect.gen(function* () {
          mockFetch({ "https://github.com/owner/repo": { ok: true } });
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
        DEFAULT_SOURCES,
      ),
    );

    it.effect("returns empty when sources excludes both github and registry", () =>
      withDependencies(
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
      withDependencies(
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
      withDependencies(
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
      withDependencies(
        Effect.gen(function* () {
          mockFetch({ "https://github.com/owner/repo": { ok: true } });
          const result = yield* resolveAmbiguous(
            "owner/repo",
            makeOptions({ cwd: tempDir, sources: ["github"] }),
          );

          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("github");
        }),
        DEFAULT_SOURCES,
      ),
    );
  });

  describe("GitHub fallback patterns", () => {
    it.effect("returns GitHub ExtensionRef for owner/repo", () =>
      withDependencies(
        Effect.gen(function* () {
          mockFetch({ "https://github.com/owner/repo": { ok: true } });
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
        DEFAULT_SOURCES,
      ),
    );

    it.effect("returns empty for owner/repo@ref (use prefixed form)", () =>
      withDependencies(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "owner/repo@v1.0.0",
            makeOptions({ cwd: tempDir }),
          );

          // v2 parser does not support bare shorthand with @ref — use github:owner/repo@v1.0.0
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for owner/repo/path (use prefixed form)", () =>
      withDependencies(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "owner/repo/skills/my-skill",
            makeOptions({ cwd: tempDir }),
          );

          // v2 parser does not support bare shorthand with subpaths — use github:owner/repo/skills/my-skill
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for owner/repo/path@ref (use prefixed form)", () =>
      withDependencies(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "owner/repo/skills/my-skill@main",
            makeOptions({ cwd: tempDir }),
          );

          // v2 parser does not support bare shorthand with subpaths/refs — use github:owner/repo/skills/my-skill@main
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for deeply nested path (use prefixed form)", () =>
      withDependencies(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "owner/repo/a/b/c/d",
            makeOptions({ cwd: tempDir }),
          );

          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for owner/repo@feature/branch (use prefixed form)", () =>
      withDependencies(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(
            "owner/repo@feature/branch",
            makeOptions({ cwd: tempDir }),
          );

          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("version handling in AXM fallback", () => {
    it.effect("preserves version constraint when falling back to AXM", () =>
      withDependencies(
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
      withDependencies(
        Effect.gen(function* () {
          mockFetch({ "https://github.com/owner/repo": { ok: true } });
          const result = yield* resolveAmbiguous("  owner/repo  ", makeOptions({ cwd: tempDir }));

          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            source: "github",
            origin: "https://github.com/owner/repo",
          });
        }),
        DEFAULT_SOURCES,
      ),
    );

    it.effect("handles owner/repo with numbers and hyphens", () =>
      withDependencies(
        Effect.gen(function* () {
          mockFetch({ "https://github.com/my-org-123/my-repo-456": { ok: true } });
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
        DEFAULT_SOURCES,
      ),
    );

    it.effect("returns empty for owner/repo with underscores (not a valid name pattern)", () =>
      withDependencies(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("my_org/my_repo", makeOptions({ cwd: tempDir }));

          // v2 parser rejects underscores in NAME_PATTERN
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for single segment (no slash)", () =>
      withDependencies(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous("justname", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty for input starting with dot", () =>
      withDependencies(
        Effect.gen(function* () {
          const result = yield* resolveAmbiguous(".hidden/repo", makeOptions({ cwd: tempDir }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("handles global AXM directory with ~", () =>
      withDependencies(
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
      withDependencies(
        Effect.gen(function* () {
          mockFetch({ "https://github.com/owner/repo": { ok: true } });
          // a/b doesn't match local path pattern (no ./, /, ~, etc.)
          // So it should fall through to AXM name or GitHub shorthand
          const result = yield* resolveAmbiguous("owner/repo", makeOptions({ cwd: tempDir }));

          // Should resolve to GitHub (since no AXM exists)
          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("github");
        }),
        DEFAULT_SOURCES,
      ),
    );

    it.effect(
      "returns empty array for ./path inputs (handled by local-path resolver, not ambiguous)",
      () =>
        withDependencies(
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

  describe("workspace source ordering", () => {
    it.effect("uses default order (github, gitlab, bitbucket)", () =>
      withDependencies(
        Effect.gen(function* () {
          // GitLab responds 200, GitHub 404
          mockFetch({
            "https://github.com/owner/repo": { ok: false },
            "https://gitlab.com/owner/repo": { ok: true },
          });
          const result = yield* resolveAmbiguous("owner/repo", makeOptions({ cwd: tempDir }));

          // Should try GitHub first (default order), then GitLab
          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("gitlab");
        }),
        DEFAULT_SOURCES,
      ),
    );

    it.effect("respects custom source order (gitlab before github)", () =>
      withDependencies(
        Effect.gen(function* () {
          // Both respond 200, but GitLab is first in custom order
          mockFetch({
            "https://github.com/owner/repo": { ok: true },
            "https://gitlab.com/owner/repo": { ok: true },
          });
          const result = yield* resolveAmbiguous("owner/repo", makeOptions({ cwd: tempDir }));

          // Should use GitLab (first in custom sources list)
          expect(result).toHaveLength(1);
          expect(result[0]?.source).toBe("gitlab");
        }),
        [
          { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
          { name: "github", type: "github", url: new URL("https://github.com") },
        ],
      ),
    );

    it.effect("tries multiple sources of same type in order", () =>
      withDependencies(
        Effect.gen(function* () {
          // github.acme responds 200, github.com 404
          mockFetch({
            "https://github.com/owner/repo": { ok: false },
            "https://github.acme/owner/repo": { ok: true },
          });
          const result = yield* resolveAmbiguous("owner/repo", makeOptions({ cwd: tempDir }));

          // Should try github.com first, then github.acme
          expect(result).toHaveLength(1);
          expect(result[0]).toMatchObject({
            source: "github",
            origin: "https://github.acme/owner/repo",
          });
        }),
        [
          { name: "github", type: "github", url: new URL("https://github.com") },
          { name: "github-acme", type: "github", url: new URL("https://github.acme") },
        ],
      ),
    );

    it.effect("returns empty when all sources return 404", () =>
      withDependencies(
        Effect.gen(function* () {
          mockFetch({
            "https://github.com/owner/repo": { ok: false },
            "https://gitlab.com/owner/repo": { ok: false },
            "https://bitbucket.org/owner/repo": { ok: false },
          });
          const result = yield* resolveAmbiguous("owner/repo", makeOptions({ cwd: tempDir }));

          expect(result).toEqual([]);
        }),
        DEFAULT_SOURCES,
      ),
    );
  });
});
