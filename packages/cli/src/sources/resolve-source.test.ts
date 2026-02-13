/**
 * Unit tests for resolve-source module.
 *
 * Tests resolving source input strings into fully resolved Source types
 * by combining parsed input with matching source configs from Workspace.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { CliError } from "../cli-error/index.js";
import { resolveSource } from "./resolve-source.js";
import type { SourceConfig } from "../settings/index.js";
import type { SkillsLockMap } from "../lockfile/index.js";
import { Workspace } from "../workspace/index.js";

// -----------------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------------

/** Create a mock Workspace layer with given sources and optional locked skills. */
const makeWorkspaceLayer = (sources: ReadonlyArray<SourceConfig>, skills: SkillsLockMap = {}) =>
  Layer.succeed(Workspace, {
    getConfiguredSources: () => Effect.succeed(sources),
    getLockedSkills: () => Effect.succeed(skills),
  } as unknown as Workspace["Type"]);

/** Default built-in sources matching workspace defaults. */
const BUILT_IN_SOURCES: ReadonlyArray<SourceConfig> = [
  { name: "github", type: "github", url: new URL("https://github.com") },
  { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
  { name: "bitbucket", type: "bitbucket", url: new URL("https://bitbucket.org") },
];

/** Helper: resolve with default built-in sources. */
const resolve = (input: string) =>
  resolveSource(input).pipe(Effect.provide(makeWorkspaceLayer(BUILT_IN_SOURCES)));

// -----------------------------------------------------------------------------
// Tests: Basic resolution (Phase 1)
// -----------------------------------------------------------------------------

describe("resolveSource", () => {
  describe("GitHub shorthand", () => {
    it.effect("resolves github:owner/repo to GitHubSource with config", () =>
      Effect.gen(function* () {
        const result = yield* resolve("github:owner/repo");
        expect(result.type).toBe("github");
        if (result.type === "github") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
          expect(result.name).toBe("github");
          expect(result.url).toEqual(new URL("https://github.com"));
          expect(result.ref).toEqual(Option.none());
          expect(result.subPath).toEqual(Option.none());
        }
      }),
    );

    it.effect("resolves github:owner/repo/path@ref with config", () =>
      Effect.gen(function* () {
        const result = yield* resolve("github:owner/repo/skills/my-skill@v1.0.0");
        expect(result.type).toBe("github");
        if (result.type === "github") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
          expect(result.subPath).toEqual(Option.some("skills/my-skill"));
          expect(result.ref).toEqual(Option.some("v1.0.0"));
          expect(result.name).toBe("github");
          expect(result.url).toEqual(new URL("https://github.com"));
        }
      }),
    );
  });

  describe("GitLab shorthand", () => {
    it.effect("resolves gitlab:owner/repo to GitLabSource with config", () =>
      Effect.gen(function* () {
        const result = yield* resolve("gitlab:owner/repo");
        expect(result.type).toBe("gitlab");
        if (result.type === "gitlab") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
          expect(result.name).toBe("gitlab");
          expect(result.url).toEqual(new URL("https://gitlab.com"));
        }
      }),
    );
  });

  describe("Bitbucket shorthand", () => {
    it.effect("resolves bitbucket:owner/repo to BitbucketSource with config", () =>
      Effect.gen(function* () {
        const result = yield* resolve("bitbucket:owner/repo");
        expect(result.type).toBe("bitbucket");
        if (result.type === "bitbucket") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
          expect(result.name).toBe("bitbucket");
          expect(result.url).toEqual(new URL("https://bitbucket.org"));
        }
      }),
    );
  });

  describe("local path passthrough", () => {
    it.effect("resolves local path without config", () =>
      Effect.gen(function* () {
        const result = yield* resolve("./my-skill");
        expect(result.type).toBe("local");
        if (result.type === "local") {
          expect(result.path).toBe("./my-skill");
        }
      }),
    );

    it.effect("resolves absolute path without config", () =>
      Effect.gen(function* () {
        const result = yield* resolve("/home/user/skills/my-skill");
        expect(result.type).toBe("local");
        if (result.type === "local") {
          expect(result.path).toBe("/home/user/skills/my-skill");
        }
      }),
    );
  });

  describe("registry resolution", () => {
    it.effect("resolves @scope/name to registry source with no config fields", () =>
      Effect.gen(function* () {
        const result = yield* resolve("@scope/name");
        expect(result.type).toBe("registry");
        if (result.type === "registry") {
          expect(result.scope).toBe("scope");
          expect(result.name).toBe("name");
        }
        // No config fields (name, url) — registry source is self-describing
        expect(Object.keys(result)).toEqual(["type", "scope", "name"]);
      }),
    );

    it.effect("resolves @acme/my-skill to registry source", () =>
      Effect.gen(function* () {
        const result = yield* resolve("@acme/my-skill");
        expect(result.type).toBe("registry");
        if (result.type === "registry") {
          expect(result.scope).toBe("acme");
          expect(result.name).toBe("my-skill");
        }
      }),
    );
  });

  describe("git passthrough", () => {
    it.effect("git SCP address for unknown host passes through as git source", () =>
      Effect.gen(function* () {
        // git@example.com:owner/repo.git fails in resolveSource
        // since example.com is not a configured host. This should fail with CliError.
        const error = yield* Effect.flip(resolve("git@example.com:owner/repo.git"));
        expect(error).toBeInstanceOf(CliError);
      }),
    );
  });

  describe("single config fallback", () => {
    it.effect("uses single config when only one exists for source type", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceConfig> = [
          { name: "my-github", type: "github", url: new URL("https://github.example.com") },
        ];
        const result = yield* resolveSource("github:owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
          expect(result.name).toBe("my-github");
          expect(result.url).toEqual(new URL("https://github.example.com"));
        }
      }),
    );
  });

  describe("no config for source type", () => {
    it.effect("fails when no config exists for source type", () =>
      Effect.gen(function* () {
        // Only gitlab config, trying github
        const sources: ReadonlyArray<SourceConfig> = [
          { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
        ];
        const error = yield* Effect.flip(
          resolveSource("github:owner/repo").pipe(Effect.provide(makeWorkspaceLayer(sources))),
        );
        expect(error).toBeInstanceOf(CliError);
        expect(error.what).toContain("No source config");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Multi-config URL/SCP hostname matching
  // ---------------------------------------------------------------------------

  describe("multi-config URL hostname matching", () => {
    const multiGitHubSources: ReadonlyArray<SourceConfig> = [
      { name: "github", type: "github", url: new URL("https://github.com") },
      { name: "ghe", type: "github", url: new URL("https://github.example.com") },
    ];

    it.effect("URL input matches correct config by hostname", () =>
      Effect.gen(function* () {
        const result = yield* resolveSource("https://github.example.com/owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(multiGitHubSources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
          expect(result.name).toBe("ghe");
          expect(result.url).toEqual(new URL("https://github.example.com"));
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("URL input matches standard github.com config", () =>
      Effect.gen(function* () {
        const result = yield* resolveSource("https://github.com/owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(multiGitHubSources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
          expect(result.name).toBe("github");
          expect(result.url).toEqual(new URL("https://github.com"));
        }
      }),
    );

    it.effect("SCP input matches by hostname", () =>
      Effect.gen(function* () {
        const result = yield* resolveSource("git@github.com:owner/repo.git").pipe(
          Effect.provide(makeWorkspaceLayer(multiGitHubSources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
          expect(result.name).toBe("github");
          expect(result.url).toEqual(new URL("https://github.com"));
        }
      }),
    );

    it.effect("shorthand selects first config of that type when multiple exist", () =>
      Effect.gen(function* () {
        const result = yield* resolveSource("github:owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(multiGitHubSources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
          // Shorthand takes first config of that type
          expect(result.name).toBe("github");
          expect(result.url).toEqual(new URL("https://github.com"));
        }
      }),
    );

    it.effect("fails when URL hostname matches no config", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceConfig> = [
          { name: "ghe1", type: "github", url: new URL("https://github.acme.com") },
          { name: "ghe2", type: "github", url: new URL("https://github.corp.com") },
        ];
        const error = yield* Effect.flip(
          resolveSource("https://github.com/owner/repo").pipe(
            Effect.provide(makeWorkspaceLayer(sources)),
          ),
        );
        expect(error).toBeInstanceOf(CliError);
      }),
    );

    it.effect("hostname match but parse failure continues to next source", () =>
      Effect.gen(function* () {
        // GitLab URL structure (/-/tree/) with two configs sharing same hostname
        const sources: ReadonlyArray<SourceConfig> = [
          { name: "gh-corp", type: "github", url: new URL("https://git.corp.com") },
          { name: "gl-corp", type: "gitlab", url: new URL("https://git.corp.com") },
        ];
        const result = yield* resolveSource("https://git.corp.com/owner/repo/-/tree/main").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        // GitHub parser fails (GitLab URL structure), GitLab parser succeeds
        expect(result.type).toBe("gitlab");
        if (result.type === "gitlab") {
          expect(result.name).toBe("gl-corp");
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
          expect(result.ref).toEqual(Option.some("main"));
        }
      }),
    );

    it.effect("custom hostname SCP matches user config", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceConfig> = [
          { name: "github", type: "github", url: new URL("https://github.com") },
          { name: "ghe", type: "github", url: new URL("https://ghe.corp.com") },
        ];
        const result = yield* resolveSource("git@ghe.corp.com:team/repo.git").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
          expect(result.name).toBe("ghe");
          expect(result.url).toEqual(new URL("https://ghe.corp.com"));
          expect(result.owner).toBe("team");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("SCP with no matching config fails", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          resolveSource("git@unknown-host.com:owner/repo.git").pipe(
            Effect.provide(makeWorkspaceLayer(BUILT_IN_SOURCES)),
          ),
        );
        expect(error).toBeInstanceOf(CliError);
      }),
    );

    it.effect("user config takes precedence over built-in for URLs", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceConfig> = [
          // Project config first (takes precedence)
          { name: "my-github", type: "github", url: new URL("https://github.com") },
          // Built-in default second
          { name: "github", type: "github", url: new URL("https://github.com") },
        ];
        const result = yield* resolveSource("https://github.com/owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
          expect(result.name).toBe("my-github");
        }
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Config-name shorthand (two-phase parse)
  // ---------------------------------------------------------------------------

  describe("config-name shorthand (two-phase parse)", () => {
    it.effect("resolves ghe:owner/repo when ghe is a config name for github", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceConfig> = [
          { name: "github", type: "github", url: new URL("https://github.com") },
          { name: "ghe", type: "github", url: new URL("https://github.example.com") },
        ];
        const result = yield* resolveSource("ghe:owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
          expect(result.name).toBe("ghe");
          expect(result.url).toEqual(new URL("https://github.example.com"));
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("resolves config-name shorthand with ref and path", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceConfig> = [
          { name: "github", type: "github", url: new URL("https://github.com") },
          { name: "ghe", type: "github", url: new URL("https://github.example.com") },
        ];
        const result = yield* resolveSource("ghe:owner/repo/skills/my-skill@v1.0.0").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
          expect(result.name).toBe("ghe");
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
          expect(result.subPath).toEqual(Option.some("skills/my-skill"));
          expect(result.ref).toEqual(Option.some("v1.0.0"));
        }
      }),
    );

    it.effect("standard shorthand still works alongside config names", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceConfig> = [
          { name: "github", type: "github", url: new URL("https://github.com") },
          { name: "ghe", type: "github", url: new URL("https://github.example.com") },
        ];
        const result = yield* resolveSource("github:owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
          expect(result.name).toBe("github");
          expect(result.url).toEqual(new URL("https://github.com"));
        }
      }),
    );

    it.effect("unknown prefix fails", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(resolve("unknown:owner/repo"));
        expect(error).toBeInstanceOf(CliError);
      }),
    );

    it.effect("config-name for gitlab works", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceConfig> = [
          { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
          { name: "gl-corp", type: "gitlab", url: new URL("https://gitlab.corp.com") },
        ];
        const result = yield* resolveSource("gl-corp:owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("gitlab");
        if (result.type === "gitlab") {
          expect(result.name).toBe("gl-corp");
          expect(result.url).toEqual(new URL("https://gitlab.corp.com"));
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("config-name for bitbucket works", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceConfig> = [
          { name: "bitbucket", type: "bitbucket", url: new URL("https://bitbucket.org") },
          { name: "bb-corp", type: "bitbucket", url: new URL("https://bitbucket.corp.com") },
        ];
        const result = yield* resolveSource("bb-corp:owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("bitbucket");
        if (result.type === "bitbucket") {
          expect(result.name).toBe("bb-corp");
          expect(result.url).toEqual(new URL("https://bitbucket.corp.com"));
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("source-type prefix selects first config when multiple exist", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceConfig> = [
          { name: "ghe1", type: "github", url: new URL("https://github.acme.com") },
          { name: "ghe2", type: "github", url: new URL("https://github.corp.com") },
        ];
        const result = yield* resolveSource("github:owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
          expect(result.name).toBe("ghe1");
          expect(result.url).toEqual(new URL("https://github.acme.com"));
        }
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Azure Repos
  // ---------------------------------------------------------------------------

  describe("Azure Repos", () => {
    it.effect("resolves Azure Repos URL with config", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceConfig> = [
          { name: "azure", type: "azurerepos", url: new URL("https://dev.azure.com") },
        ];
        const result = yield* resolveSource(
          "https://dev.azure.com/myorg/myproject/_git/myrepo",
        ).pipe(Effect.provide(makeWorkspaceLayer(sources)));
        expect(result.type).toBe("azurerepos");
        if (result.type === "azurerepos") {
          expect(result.organization).toBe("myorg");
          expect(result.project).toBe("myproject");
          expect(result.repo).toBe("myrepo");
          expect(result.name).toBe("azure");
          expect(result.url).toEqual(new URL("https://dev.azure.com"));
        }
      }),
    );
  });
});
