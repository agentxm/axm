/**
 * Unit tests for resolve-source module.
 *
 * Tests resolving source strings into fully resolved Source values
 * by combining parsed input with matching source configs from WorkspaceMutations.
 */

import { describe, expect, it } from "@effect/vitest";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { AppError } from "../app-error/index.js";
import { resolveSource, resolveSlashInputSource } from "./resolve-source.js";
import type { SourceHostConfig } from "../settings/index.js";
import type { SkillsLockMap } from "../lockfile/index.js";
import { WorkspaceMutations } from "../workspace/index.js";
import { makeBaseWorkspaceMock } from "../workspace/test-stubs.js";

// -----------------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------------

/** Create a mock WorkspaceMutations layer with given sources and optional locked skills. */
const makeRegistryCollectionResponse = () =>
  JSON.stringify({
    extensions: [
      {
        owner: "@acme",
        type: "skill",
        name: "my-skill",
        description: null,
        repository: null,
        license: null,
        authors: [],
        dependencies: {},
        version: "1.0.0",
        integrity: "sha512-AAAA==",
      },
    ],
    total: 1,
  });

const remoteHttpLayer = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.sync(() => {
      const url = new URL(request.url);

      if (url.hostname === "localhost") {
        return HttpClientResponse.fromWeb(
          request,
          new Response("registry unavailable", { status: 500 }),
        );
      }

      if (request.method === "HEAD") {
        return HttpClientResponse.fromWeb(request, new Response(null, { status: 200 }));
      }

      if (request.method === "GET" && url.pathname.startsWith("/v1/extensions/@")) {
        return HttpClientResponse.fromWeb(
          request,
          new Response(makeRegistryCollectionResponse(), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }

      return HttpClientResponse.fromWeb(request, new Response("not found", { status: 404 }));
    }),
  ),
);

const makeWorkspaceLayer = (
  sources: ReadonlyArray<SourceHostConfig>,
  skills: SkillsLockMap = {},
  registrySources?: ReadonlyArray<Extract<SourceHostConfig, { type: "registry" }>>,
) =>
  Layer.merge(
    Layer.merge(
      Layer.succeed(
        WorkspaceMutations,
        makeBaseWorkspaceMock("/tmp/axm", {
          getConfiguredSources: () => Effect.succeed(sources),
          getLockedSkills: () => Effect.succeed(skills),
          getRegistrySourceHosts: () =>
            Effect.succeed(
              registrySources ??
                sources.filter(
                  (s): s is Extract<SourceHostConfig, { type: "registry" }> =>
                    s.type === "registry",
                ),
            ),
        }),
      ),
      remoteHttpLayer,
    ),
    NodeServices.layer,
  );

/** Default built-in sources matching workspace defaults. */
const BUILT_IN_SOURCES: ReadonlyArray<SourceHostConfig> = [
  { name: "default", type: "registry", location: new URL("https://registry.agentxm.ai") },
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
    it.effect("resolves @owner/skills/name with registry host config", () =>
      Effect.gen(function* () {
        const registryConfig: Extract<SourceHostConfig, { type: "registry" }> = {
          name: "default",
          type: "registry",
          location: new URL("https://registry.example.com"),
        };
        const sources: ReadonlyArray<SourceHostConfig> = [...BUILT_IN_SOURCES, registryConfig];
        const result = yield* resolveSource("@owner/skills/name").pipe(
          Effect.provide(makeWorkspaceLayer(sources, {}, [registryConfig])),
        );
        expect(result.type).toBe("registry");
        if (result.type === "registry") {
          expect(result.location).toEqual(new URL("https://registry.example.com"));
        }
      }),
    );

    it.effect("resolves @owner/skills/name with built-in registry", () =>
      Effect.gen(function* () {
        const result = yield* resolve("@owner/skills/name");
        expect(result.type).toBe("registry");
        if (result.type === "registry") {
          expect(result.location).toEqual(new URL("https://registry.agentxm.ai"));
        }
      }),
    );

    it.effect("resolves @owner with built-in registry", () =>
      Effect.gen(function* () {
        const result = yield* resolve("@owner");
        expect(result.type).toBe("registry");
        if (result.type === "registry") {
          expect(result.location).toEqual(new URL("https://registry.agentxm.ai"));
        }
      }),
    );

    it.effect("resolves @owner/skills with built-in registry", () =>
      Effect.gen(function* () {
        const result = yield* resolve("@owner/skills");
        expect(result.type).toBe("registry");
        if (result.type === "registry") {
          expect(result.location).toEqual(new URL("https://registry.agentxm.ai"));
        }
      }),
    );

    it.effect("resolves @acme/skills/my-skill to registry source", () =>
      Effect.gen(function* () {
        const registryConfig: Extract<SourceHostConfig, { type: "registry" }> = {
          name: "default",
          type: "registry",
          location: new URL("https://registry.example.com"),
        };
        const sources: ReadonlyArray<SourceHostConfig> = [...BUILT_IN_SOURCES, registryConfig];
        const result = yield* resolveSource("@acme/skills/my-skill").pipe(
          Effect.provide(makeWorkspaceLayer(sources, {}, [registryConfig])),
        );
        expect(result.type).toBe("registry");
        if (result.type === "registry") {
          expect(result.location).toEqual(new URL("https://registry.example.com"));
        }
      }),
    );

    it.effect("resolves registry source", () =>
      Effect.gen(function* () {
        const registryConfig: Extract<SourceHostConfig, { type: "registry" }> = {
          name: "acme-reg",
          type: "registry",
          location: new URL("https://acme-registry.example.com"),
        };
        const sources: ReadonlyArray<SourceHostConfig> = [...BUILT_IN_SOURCES, registryConfig];
        const result = yield* resolveSource("@acme/skills/my-skill").pipe(
          Effect.provide(makeWorkspaceLayer(sources, {}, [registryConfig])),
        );
        expect(result.type).toBe("registry");
        if (result.type === "registry") {
          expect(result.location).toEqual(new URL("https://acme-registry.example.com"));
        }
      }),
    );
  });

  describe("slash source resolution", () => {
    it.effect("resolves owner/type/name slash pattern to registry when extension exists", () =>
      Effect.gen(function* () {
        const registryRoot = mkdtempSync(nodePath.join(tmpdir(), "slash-reg-"));
        const extensionDir = nodePath.join(
          registryRoot,
          "extensions",
          "@acme",
          "skills",
          "my-skill",
        );
        mkdirSync(extensionDir, { recursive: true });
        writeFileSync(nodePath.join(extensionDir, "index.json"), "{}");

        const registryConfig: Extract<SourceHostConfig, { type: "registry" }> = {
          name: "default",
          type: "registry",
          location: new URL(`file://${registryRoot}`),
        };
        const sources: ReadonlyArray<SourceHostConfig> = [...BUILT_IN_SOURCES, registryConfig];
        const result = yield* resolveSlashInputSource(
          {
            first: "@acme",
            second: "skills",
            third: Option.some("my-skill"),
          },
          "@acme/skills/my-skill",
        ).pipe(
          Effect.provide(makeWorkspaceLayer(sources, {}, [registryConfig])),
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true, force: true })),
          ),
        );

        expect(result.type).toBe("registry");
        if (result.type === "registry") {
          expect(result.location.href).toBe(new URL(`file://${registryRoot}`).href);
        }
      }),
    );
  });

  describe("git passthrough", () => {
    it.effect("git SCP address for unknown host passes through as git source", () =>
      Effect.gen(function* () {
        // git@example.com:owner/repo.git fails in resolveSource
        // since example.com is not a configured host. This should fail with AppError.
        const error = yield* Effect.flip(resolve("git@example.com:owner/repo.git"));
        expect(error).toBeInstanceOf(AppError);
      }),
    );
  });

  describe("single config fallback", () => {
    it.effect("uses single config when only one exists for source type", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceHostConfig> = [
          { name: "my-github", type: "github", url: new URL("https://github.example.com") },
        ];
        const result = yield* resolveSource("github:owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
          expect(result.url).toEqual(new URL("https://github.example.com"));
        }
      }),
    );
  });

  describe("no config for source type", () => {
    it.effect("fails when no config exists for source type", () =>
      Effect.gen(function* () {
        // Only gitlab config, trying github
        const sources: ReadonlyArray<SourceHostConfig> = [
          { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
        ];
        const error = yield* Effect.flip(
          resolveSource("github:owner/repo").pipe(Effect.provide(makeWorkspaceLayer(sources))),
        );
        expect(error).toBeInstanceOf(AppError);
        expect(error.what).toContain("No source config");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Multi-config URL/SCP hostname matching
  // ---------------------------------------------------------------------------

  describe("multi-config URL hostname matching", () => {
    const multiGitHubSources: ReadonlyArray<SourceHostConfig> = [
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
          expect(result.url).toEqual(new URL("https://github.com"));
        }
      }),
    );

    it.effect("fails when URL hostname matches no config", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceHostConfig> = [
          { name: "ghe1", type: "github", url: new URL("https://github.acme.com") },
          { name: "ghe2", type: "github", url: new URL("https://github.corp.com") },
        ];
        const error = yield* Effect.flip(
          resolveSource("https://github.com/owner/repo").pipe(
            Effect.provide(makeWorkspaceLayer(sources)),
          ),
        );
        expect(error).toBeInstanceOf(AppError);
      }),
    );

    it.effect("hostname match but parse failure continues to next source", () =>
      Effect.gen(function* () {
        // GitLab URL structure (/-/tree/) with two configs sharing same hostname
        const sources: ReadonlyArray<SourceHostConfig> = [
          { name: "gh-corp", type: "github", url: new URL("https://git.corp.com") },
          { name: "gl-corp", type: "gitlab", url: new URL("https://git.corp.com") },
        ];
        const result = yield* resolveSource("https://git.corp.com/owner/repo/-/tree/main").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        // GitHub parser fails (GitLab URL structure), GitLab parser succeeds
        expect(result.type).toBe("gitlab");
        if (result.type === "gitlab") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
          expect(result.ref).toEqual(Option.some("main"));
        }
      }),
    );

    it.effect("custom hostname SCP matches user config", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceHostConfig> = [
          { name: "github", type: "github", url: new URL("https://github.com") },
          { name: "ghe", type: "github", url: new URL("https://ghe.corp.com") },
        ];
        const result = yield* resolveSource("git@ghe.corp.com:team/repo.git").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
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
        expect(error).toBeInstanceOf(AppError);
      }),
    );

    it.effect("user config takes precedence over built-in for URLs", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceHostConfig> = [
          // Project config first (takes precedence)
          { name: "my-github", type: "github", url: new URL("https://github.com") },
          // Built-in default second
          { name: "github", type: "github", url: new URL("https://github.com") },
        ];
        const result = yield* resolveSource("https://github.com/owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("github");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Config-name shorthand (two-phase parse)
  // ---------------------------------------------------------------------------

  describe("config-name shorthand (two-phase parse)", () => {
    it.effect("resolves ghe:owner/repo when ghe is a config name for github", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceHostConfig> = [
          { name: "github", type: "github", url: new URL("https://github.com") },
          { name: "ghe", type: "github", url: new URL("https://github.example.com") },
        ];
        const result = yield* resolveSource("ghe:owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
          expect(result.url).toEqual(new URL("https://github.example.com"));
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("resolves config-name shorthand with ref and path", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceHostConfig> = [
          { name: "github", type: "github", url: new URL("https://github.com") },
          { name: "ghe", type: "github", url: new URL("https://github.example.com") },
        ];
        const result = yield* resolveSource("ghe:owner/repo/skills/my-skill@v1.0.0").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
          expect(result.subPath).toEqual(Option.some("skills/my-skill"));
          expect(result.ref).toEqual(Option.some("v1.0.0"));
        }
      }),
    );

    it.effect("standard shorthand still works alongside config names", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceHostConfig> = [
          { name: "github", type: "github", url: new URL("https://github.com") },
          { name: "ghe", type: "github", url: new URL("https://github.example.com") },
        ];
        const result = yield* resolveSource("github:owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
          expect(result.url).toEqual(new URL("https://github.com"));
        }
      }),
    );

    it.effect("unknown prefix fails", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(resolve("unknown:owner/repo"));
        expect(error).toBeInstanceOf(AppError);
      }),
    );

    it.effect("config-name for gitlab works", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceHostConfig> = [
          { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
          { name: "gl-corp", type: "gitlab", url: new URL("https://gitlab.corp.com") },
        ];
        const result = yield* resolveSource("gl-corp:owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("gitlab");
        if (result.type === "gitlab") {
          expect(result.url).toEqual(new URL("https://gitlab.corp.com"));
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("config-name for bitbucket works", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceHostConfig> = [
          { name: "bitbucket", type: "bitbucket", url: new URL("https://bitbucket.org") },
          { name: "bb-corp", type: "bitbucket", url: new URL("https://bitbucket.corp.com") },
        ];
        const result = yield* resolveSource("bb-corp:owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("bitbucket");
        if (result.type === "bitbucket") {
          expect(result.url).toEqual(new URL("https://bitbucket.corp.com"));
          expect(result.owner).toBe("owner");
          expect(result.repo).toBe("repo");
        }
      }),
    );

    it.effect("source-type prefix selects first config when multiple exist", () =>
      Effect.gen(function* () {
        const sources: ReadonlyArray<SourceHostConfig> = [
          { name: "ghe1", type: "github", url: new URL("https://github.acme.com") },
          { name: "ghe2", type: "github", url: new URL("https://github.corp.com") },
        ];
        const result = yield* resolveSource("github:owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer(sources)),
        );
        expect(result.type).toBe("github");
        if (result.type === "github") {
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
        const sources: ReadonlyArray<SourceHostConfig> = [
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
          expect(result.url).toEqual(new URL("https://dev.azure.com"));
        }
      }),
    );
  });
});
