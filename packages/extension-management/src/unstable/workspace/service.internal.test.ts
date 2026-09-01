/**
 * Unit tests for WorkspaceMutationsService.
 *
 * Tests nonInteractive resolution from Option<boolean> to plain boolean,
 * including CI environment detection fallback.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { afterEach, beforeEach } from "vitest";
import { TestRenderer } from "../cli-renderer/index.js";
import YAML from "yaml";
import { InvalidAgentId, LockedSkillMissing, SettingsEntryMissing } from "./errors.js";
import { TestFlagsLayer } from "../cli-flags/index.js";
import type { SourceHostConfig } from "../settings/index.js";
import type { McpServerLockEntry, SkillLockEntry, SubagentLockEntry } from "../lockfile/index.js";
import {
  exactVersion,
  expectDefined,
  extensionName,
  getAppError,
  handle,
  property,
  recordEntry,
  stringProperty,
  versionRange,
} from "../test-helpers.js";
import { computeSourceHash } from "./rendered-files.js";
import { TreeIntegritySchema } from "./materialized-tree.js";
import { computePackManifestContentIdentity } from "./pack-manifest-content-identity.js";
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { layer as workspaceLayer } from "./operations/load-workspace.js";
import {
  WorkspaceMutations,
  type SetMcpServerArgs,
  type SetPackArgs,
  type WorkspaceMutationsOptions,
} from "./service-interface.js";
import {
  bootstrapWorkspace,
  WorkspaceInitializationInteractionTest,
} from "../workspace-configuration/index.js";
import { installableExtensionTypes } from "./installable-types.js";
import {
  configuredRowsByName,
  installedRowsByName,
  unmanagedRowsByName,
} from "./read-model-record-rows.js";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";

describe("WorkspaceMutationsService", () => {
  const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
    `sha256-tree-v1:${"0".repeat(64)}`,
  );
  let tempDir: string;
  let projectDir: string;
  let homeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let defaultOptions: WorkspaceMutationsOptions;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-service-test-"));

    // Separate project and home dirs so local != global .axm
    projectDir = path.join(tempDir, "project");
    homeDir = path.join(tempDir, "home");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(homeDir, { recursive: true });

    process.chdir(projectDir);
    process.env["HOME"] = homeDir;
    defaultOptions = {
      scope: "project",
      projectRoot: decodeAbsolutePathSync(projectDir),
    };

    // Pre-create an initialized workspace so the service doesn't prompt
    const axmDir = projectDir;
    fs.mkdirSync(path.join(projectDir, ".axm"), { recursive: true });
    fs.writeFileSync(path.join(axmDir, "axm.json"), JSON.stringify({ agents: ["claude-code"] }));
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 6\nskills: {}\n");
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome === undefined) {
      delete process.env["HOME"];
    } else {
      process.env["HOME"] = originalHome;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const { layer: testLogLayer } = TestRenderer.make();
  const BaseLayer = Layer.mergeAll(NodeServices.layer, testLogLayer, TestFlagsLayer());

  const makeWsLayer = (options: WorkspaceMutationsOptions) =>
    Layer.provide(workspaceLayer(options), BaseLayer);

  const getService = (options: WorkspaceMutationsOptions) =>
    WorkspaceMutations.pipe(Effect.provide(makeWsLayer(options)));

  describe("baseDir", () => {
    it.effect("returns the parent of path", () =>
      Effect.gen(function* () {
        const ws = yield* getService({
          scope: "project",
          projectRoot: decodeAbsolutePathSync(projectDir),
        });

        expect(ws.baseDir).toBe(path.dirname(ws.path));
      }),
    );
  });

  describe("Knowledge instruction config", () => {
    it.effect("enables the discovery table by default", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const config = yield* ws.getKnowledgeDiscoveryConfig();

        expect(config).toEqual({ instructions: true });
      }),
    );

    it.effect("disables the discovery table when configured", () =>
      Effect.gen(function* () {
        fs.writeFileSync(
          path.join(projectDir, "axm.json"),
          JSON.stringify({
            agents: ["claude-code"],
            knowledgeConfig: { instructions: false },
          }),
        );

        const ws = yield* getService(defaultOptions);
        const config = yield* ws.getKnowledgeDiscoveryConfig();

        expect(config).toEqual({ instructions: false });
      }),
    );
  });

  describe("instruction-file config", () => {
    it.effect("reads the top-level instructionFiles setting", () =>
      Effect.gen(function* () {
        fs.writeFileSync(
          path.join(projectDir, "axm.json"),
          JSON.stringify({
            agents: ["claude-code"],
            instructionFiles: {
              fileName: "TEAM.md",
              gitignoreAliases: false,
            },
          }),
        );

        const ws = yield* getService(defaultOptions);
        const config = yield* ws.getInstructionsConfig();

        expect(config).toEqual(
          Option.some({
            fileName: "TEAM.md",
            gitignoreAliases: false,
          }),
        );
      }),
    );

    it.effect("writes instructionFiles without creating rule-owned config", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);

        yield* ws.setInstructionsConfig(false);

        const settings: unknown = JSON.parse(
          fs.readFileSync(path.join(projectDir, "axm.json"), "utf-8"),
        );
        expect(settings).toMatchObject({
          agents: ["claude-code"],
          instructionFiles: false,
        });
        if (typeof settings !== "object" || settings === null) {
          throw new Error("Expected settings to decode as an object");
        }
        expect(Reflect.get(settings, "rulesConfig")).toBeUndefined();
      }),
    );
  });

  describe("workspace readiness", () => {
    it.effect("loads project state when the project root is the user home", () =>
      Effect.gen(function* () {
        fs.writeFileSync(
          path.join(homeDir, "axm.json"),
          JSON.stringify({ agents: ["claude-code"], owner: "@project" }),
        );
        fs.writeFileSync(path.join(homeDir, "axm-lock.yaml"), "lockfileVersion: 6\nskills: {}\n");

        const ws = yield* getService({
          scope: "project",
          projectRoot: decodeAbsolutePathSync(homeDir),
        });

        expect(ws.scope).toBe("project");
        expect(yield* ws.getConfiguredOwner()).toEqual(Option.some("@project"));
      }),
    );

    it.effect("requires setup when root project state is missing", () =>
      Effect.gen(function* () {
        fs.rmSync(path.join(projectDir, "axm.json"), { force: true });
        fs.rmSync(path.join(projectDir, "axm-lock.yaml"), { force: true });

        const error = yield* getService(defaultOptions).pipe(Effect.flip);

        expect(getAppError(error)).toMatchObject({
          code: "internal",
          suggestions: [{ description: "Create the workspace.", cmd: "axm setup" }],
        });
        expect(fs.existsSync(path.join(projectDir, "axm.json"))).toBe(false);
        expect(fs.existsSync(path.join(projectDir, "axm-lock.yaml"))).toBe(false);
      }),
    );

    it.effect("allows read-only inventory when settings and lockfile are absent", () =>
      Effect.gen(function* () {
        fs.rmSync(path.join(projectDir, ".axm"), { recursive: true, force: true });
        const skillDir = path.join(projectDir, ".agents", "skills", "native-only");
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Native only\n");

        const ws = yield* getService({ ...defaultOptions, allowUninitialized: true });
        const inventory = yield* ws.records.getExtensionInventory("skill", {});

        expect(inventory).toMatchObject({
          count: 1,
          installedCount: 1,
          unmanagedCount: 1,
          items: [
            {
              name: "native-only",
              classification: { kind: "lifecycle", lifecycle: "unmanaged" },
            },
          ],
        });
      }),
    );

    it.effect("does not treat malformed settings as absent for inventory", () =>
      Effect.gen(function* () {
        fs.writeFileSync(path.join(projectDir, "axm.json"), "{ not-json");

        const error = yield* getService({ ...defaultOptions, allowUninitialized: true }).pipe(
          Effect.flip,
        );

        const appError = getAppError(error);
        expect(appError.code).toBe("validation");
        expect(appError.detail).toContain("not valid JSON");
        expect(appError.cause).toMatchObject({ _tag: "SettingsParseError" });
      }),
    );

    it.effect("does not treat malformed lockfiles as absent for inventory", () =>
      Effect.gen(function* () {
        fs.writeFileSync(path.join(projectDir, "axm-lock.yaml"), "lockfileVersion: invalid\n");

        const ws = yield* getService({ ...defaultOptions, allowUninitialized: true });
        const error = yield* ws.records.getExtensionInventory("skill", {}).pipe(Effect.flip);

        const appError = getAppError(error);
        expect(appError.code).toBe("validation");
        expect(appError.detail).toBe(
          "Failed to read the workspace lockfile. Fix the file's permissions or restore it from version control, then rerun.",
        );
        expect(appError.cause).toMatchObject({ _tag: "LockfileDecodeError" });
      }),
    );
  });

  // nonInteractive resolution is tested in cli-flags/service.test.ts
  // preview flag is tested in cli-flags

  /** Helper to write project settings JSON at the workspace root. */
  const writeSettingsTo = (dir: string, settings: Record<string, unknown>) => {
    const settingsPath =
      dir === homeDir
        ? path.join(dir, ".axm", "workspace", "axm.json")
        : path.join(dir, "axm.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  };

  describe("settings validity prerequisite", () => {
    /**
     * Internal evidence for the executable specification
     * `cli/settings-validity-gates-operations`, including its
     * workspace-construction-gate claims.
     */
    const sources = [
      {
        owner: "project",
        path: () => path.join(projectDir, "axm.json"),
      },
      {
        owner: "user",
        path: () => path.join(homeDir, ".axm", "workspace", "axm.json"),
      },
    ] as const;
    const failures = [
      {
        name: "malformed JSON",
        tag: "SettingsParseError",
        write: (settingsPath: string) => fs.writeFileSync(settingsPath, "{ not-json"),
        detail: "not valid JSON",
      },
      {
        name: "schema-invalid values",
        tag: "SettingsDecodeError",
        write: (settingsPath: string) =>
          fs.writeFileSync(settingsPath, JSON.stringify({ agents: "claude-code" })),
        detail: "Invalid workspace settings",
      },
      {
        name: "unreadable I/O",
        tag: "SettingsIoError",
        write: (settingsPath: string) => fs.mkdirSync(settingsPath, { recursive: true }),
        detail: "could not be read",
      },
    ] as const;

    for (const source of sources) {
      for (const failure of failures) {
        it.effect(`blocks construction for ${source.owner} ${failure.name}`, () =>
          Effect.gen(function* () {
            const settingsPath = source.path();
            fs.rmSync(settingsPath, { recursive: true, force: true });
            fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
            failure.write(settingsPath);
            const lockfilePath = path.join(projectDir, "axm-lock.yaml");
            const lockfileBefore = fs.readFileSync(lockfilePath, "utf8");

            const error = yield* getService({
              ...defaultOptions,
              allowUninitialized: true,
            }).pipe(Effect.flip);

            const appError = getAppError(error);
            expect(appError.code).toBe("validation");
            expect(appError.detail).toContain(settingsPath);
            expect(appError.detail).toContain(failure.detail);
            expect(appError.cause).toMatchObject({ _tag: failure.tag, path: settingsPath });
            expect(appError.suggestions?.[0]?.description).toMatch(/fix|repair|restore/i);
            expect(fs.readFileSync(lockfilePath, "utf8")).toBe(lockfileBefore);
            expect(fs.existsSync(path.join(projectDir, ".axm", "tmp"))).toBe(false);
            if (failure.tag === "SettingsIoError") {
              expect(fs.statSync(settingsPath).isDirectory()).toBe(true);
            } else {
              expect(fs.existsSync(settingsPath)).toBe(true);
            }
          }),
        );
      }

      it.effect(`preserves missing-file semantics for ${source.owner} settings`, () =>
        Effect.gen(function* () {
          const settingsPath = source.path();
          fs.rmSync(settingsPath, { recursive: true, force: true });

          yield* getService({ ...defaultOptions, allowUninitialized: true });

          expect(fs.existsSync(settingsPath)).toBe(false);
          expect(fs.existsSync(path.join(projectDir, ".axm", "tmp"))).toBe(false);
        }),
      );
    }
  });

  const writePackManifestTo = (
    dir: string,
    owner: string,
    name: string,
    dependencies: Readonly<Record<string, string>>,
  ) => {
    const packDir = path.join(dir, "agent_extensions", "agentxm", owner, "packs", name);
    fs.mkdirSync(packDir, { recursive: true });
    const decodedManifest = Schema.decodeUnknownSync(PackManifestSchema)({
      owner,
      type: "pack",
      name,
      version: "1.0.0",
      dependencies,
    });
    const manifest = JSON.stringify(decodedManifest);
    fs.writeFileSync(path.join(packDir, "pack.json"), manifest);
    return computePackManifestContentIdentity(decodedManifest);
  };

  const writeAcceptedPackResolutionTo = (
    dir: string,
    owner: string,
    name: string,
    contentIdentity: string,
  ) => {
    fs.writeFileSync(
      path.join(dir, "axm-lock.yaml"),
      YAML.stringify({
        lockfileVersion: 6,
        skills: {},
        packs: {
          [name]: {
            type: "registry",
            sourceType: "registry",
            endpoint: "https://registry.agentxm.ai",
            extensionType: "pack",
            workspaceName: name,
            packageFormat: "agentxm",
            owner,
            name,
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            treeIntegrity,
            manifestContentIdentity: contentIdentity,
          },
        },
      }),
    );
  };

  describe("getConfiguredSources", () => {
    it.effect("returns only built-in defaults when no sources configured", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getConfiguredSources();

        expect(sources).toHaveLength(3);
        expect(sources.map((s) => s.name)).toEqual(["github", "gitlab", "bitbucket"]);
      }),
    );

    it.effect("merge ordering: project first, then global, then built-in", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [
            { name: "my-registry", type: "registry", location: "https://registry.example.com" },
          ],
        });
        writeSettingsTo(homeDir, {
          sources: [
            { name: "corp-registry", type: "registry", location: "https://corp.example.com" },
          ],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getConfiguredSources();

        const names = sources.map((s) => s.name);
        expect(names).toEqual(["my-registry", "corp-registry", "github", "gitlab", "bitbucket"]);
      }),
    );

    it.effect("project source overrides global source with same name", () =>
      Effect.gen(function* () {
        const projectSource: SourceHostConfig = {
          name: "github",
          type: "github",
          url: new URL("https://github.mycompany.com"),
        };
        const globalSource: SourceHostConfig = {
          name: "github",
          type: "github",
          url: new URL("https://github.example.com"),
        };

        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [projectSource],
        });
        writeSettingsTo(homeDir, {
          sources: [globalSource],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getConfiguredSources();

        const githubSource = expectDefined(
          sources.find((s) => s.name === "github"),
          "Expected github source",
        );
        // Project wins over global
        expect("url" in githubSource).toBe(true);
        if ("url" in githubSource) {
          expect(githubSource.url).toEqual(new URL("https://github.mycompany.com"));
        }
        // Built-in github is also overridden (only one "github" entry)
        expect(sources.filter((s) => s.name === "github")).toHaveLength(1);
      }),
    );

    it.effect("global source overrides built-in source with same name", () =>
      Effect.gen(function* () {
        const globalSource: SourceHostConfig = {
          name: "gitlab",
          type: "gitlab",
          url: new URL("https://gitlab.corp.example.com"),
        };

        writeSettingsTo(homeDir, {
          sources: [globalSource],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getConfiguredSources();

        const gitlabSource = expectDefined(
          sources.find((s) => s.name === "gitlab"),
          "Expected gitlab source",
        );
        expect("url" in gitlabSource).toBe(true);
        if ("url" in gitlabSource) {
          expect(gitlabSource.url).toEqual(new URL("https://gitlab.corp.example.com"));
        }
        expect(sources.filter((s) => s.name === "gitlab")).toHaveLength(1);
      }),
    );

    it.effect("caches result across multiple calls", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [
            { name: "custom", type: "registry", location: new URL("https://r.example.com") },
          ],
        });

        const ws = yield* getService(defaultOptions);
        const first = yield* ws.getConfiguredSources();
        const second = yield* ws.getConfiguredSources();

        // Same reference (cached)
        expect(first).toBe(second);
      }),
    );
  });

  describe("getConfiguredSourceByName", () => {
    it.effect("returns Some when source exists", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getConfiguredSourceByName("github");

        expect(Option.isSome(result)).toBe(true);
        expect(Option.getOrThrow(result).name).toBe("github");
      }),
    );

    it.effect("returns None when source does not exist", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getConfiguredSourceByName("nonexistent");

        expect(Option.isNone(result)).toBe(true);
      }),
    );
  });

  describe("getRegistrySourceHosts", () => {
    it.effect("returns empty when no registry sources configured", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getRegistrySourceHosts();

        // Built-in sources are github/gitlab/bitbucket, none are registry type
        expect(sources).toHaveLength(0);
      }),
    );

    it.effect("returns all configured registry sources", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [
            {
              name: "r1",
              type: "registry",
              location: new URL("https://r1.example.com"),
            },
            {
              name: "r2",
              type: "registry",
              location: new URL("https://r2.example.com"),
            },
          ],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getRegistrySourceHosts();

        expect(sources).toHaveLength(2);
        expect(sources.map((s) => s.name)).toEqual(["r1", "r2"]);
      }),
    );

    it.effect("returns all registry sources without owner filtering", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          sources: [
            {
              name: "corp-reg",
              type: "registry",
              location: new URL("https://corp.example.com"),
            },
            {
              name: "public-reg",
              type: "registry",
              location: new URL("https://public.example.com"),
            },
          ],
        });

        const ws = yield* getService(defaultOptions);
        const sources = yield* ws.getRegistrySourceHosts();

        expect(sources).toHaveLength(2);
        expect(sources.map((s) => s.name)).toEqual(["corp-reg", "public-reg"]);
      }),
    );
  });

  describe("getConfiguredOwner", () => {
    it.effect("returns Option.some with project owner when configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          owner: "@myorg",
        });

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getConfiguredOwner();

        expect(Option.isSome(result)).toBe(true);
        expect(Option.getOrThrow(result)).toBe("@myorg");
      }),
    );

    it.effect("returns Option.some with user owner when project has none", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
        });
        writeSettingsTo(homeDir, {
          owner: "@globalorg",
        });

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getConfiguredOwner();

        expect(Option.isSome(result)).toBe(true);
        expect(Option.getOrThrow(result)).toBe("@globalorg");
      }),
    );

    it.effect("returns Option.none when neither project nor user has owner", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
        });

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getConfiguredOwner();

        expect(Option.isNone(result)).toBe(true);
      }),
    );

    it.effect("rejects bare owner in settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          owner: "myorg",
        });

        const error = getAppError(yield* getService(defaultOptions).pipe(Effect.flip));
        expect(error.code).toBe("validation");
      }),
    );
  });

  describe("getMinimumReleaseAgeExclude", () => {
    it.effect("uses project patterns and reports their scope", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { minimumReleaseAgeExclude: ["@project/*"] });

        const ws = yield* getService(defaultOptions);

        expect(yield* ws.getMinimumReleaseAgeExclude()).toEqual([
          {
            pattern: { owner: "@project", type: "*", name: "*" },
            scope: "project",
          },
        ]);
      }),
    );

    it.effect("inherits user patterns for a project workspace", () =>
      Effect.gen(function* () {
        writeSettingsTo(homeDir, { minimumReleaseAgeExclude: ["@user/skills/*"] });

        const ws = yield* getService(defaultOptions);

        expect(yield* ws.getMinimumReleaseAgeExclude()).toEqual([
          {
            pattern: { owner: "@user", type: "skill", name: "*" },
            scope: "user",
          },
        ]);
      }),
    );

    it.effect("lets an explicit project [] suppress user inheritance", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { minimumReleaseAgeExclude: [] });
        writeSettingsTo(homeDir, { minimumReleaseAgeExclude: ["@user/*"] });

        const ws = yield* getService(defaultOptions);

        expect(yield* ws.getMinimumReleaseAgeExclude()).toEqual([]);
      }),
    );

    it.effect("does not consult project settings from user scope", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { minimumReleaseAgeExclude: ["@project/*"] });
        writeSettingsTo(homeDir, { minimumReleaseAgeExclude: ["@user/*"] });

        const ws = yield* getService({
          scope: "user",
          projectRoot: decodeAbsolutePathSync(projectDir),
        });

        expect(yield* ws.getMinimumReleaseAgeExclude()).toEqual([
          {
            pattern: { owner: "@user", type: "*", name: "*" },
            scope: "user",
          },
        ]);
      }),
    );

    it.effect("defaults to an empty list", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);

        expect(yield* ws.getMinimumReleaseAgeExclude()).toEqual([]);
      }),
    );
  });

  describe("addConfiguredSource", () => {
    it.effect("appends source to project settings", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);

        const newSource: SourceHostConfig = {
          name: "my-registry",
          type: "registry",
          location: new URL("https://registry.example.com"),
        };
        yield* ws.addConfiguredSource(newSource);

        // Verify it was written to disk
        const settingsPath = path.join(projectDir, "axm.json");
        const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(content.sources).toBeDefined();
        expect(content.sources).toHaveLength(1);
        expect(content.sources[0].name).toBe("my-registry");
      }),
    );

    it.effect("source visible in subsequent getConfiguredSources calls (cache invalidated)", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);

        // Populate cache
        const before = yield* ws.getConfiguredSources();
        expect(before.find((s) => s.name === "new-source")).toBeUndefined();

        // Add a new source
        const newSource: SourceHostConfig = {
          name: "new-source",
          type: "registry",
          location: new URL("https://new.example.com"),
        };
        yield* ws.addConfiguredSource(newSource);

        // Cache should be invalidated, new source visible
        const after = yield* ws.getConfiguredSources();
        expect(after.find((s) => s.name === "new-source")).toBeDefined();
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Lockfile helpers
  // ---------------------------------------------------------------------------

  /**
   * Helper to write a lockfile YAML to the .axm directory.
   */
  const writeLockfileTo = (
    dir: string,
    skills: Record<string, unknown>,
    packs?: Record<string, unknown>,
    mcpServers?: Record<string, unknown>,
    subagents?: Record<string, unknown>,
    knowledge?: Record<string, unknown>,
  ) => {
    fs.mkdirSync(dir, { recursive: true });
    const normalizeEntry = (
      name: string,
      value: unknown,
      extensionType: "skill" | "mcp-server" | "subagent" | "knowledge" | "pack",
    ): unknown => {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
      const entry: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(value)) {
        if (
          key === "installedAt" ||
          key === "updatedAt" ||
          key === "agents" ||
          key === "sourceHash" ||
          key === "gitTreeHash" ||
          key.startsWith("resolvedSkills") ||
          key.startsWith("resolvedMcpServers") ||
          key.startsWith("resolvedSubagents") ||
          key.startsWith("resolvedRules") ||
          key.startsWith("resolvedHooks") ||
          key.startsWith("resolvedKnowledge")
        ) {
          continue;
        }
        entry[key] = field;
      }
      const type = entry["type"];
      entry["sourceType"] ??= type;
      entry["extensionType"] ??= extensionType;
      entry["workspaceName"] ??= typeof entry["name"] === "string" ? entry["name"] : name;
      entry["packageFormat"] ??= "agentxm";
      entry["treeIntegrity"] ??= `sha256-tree-v1:${"0".repeat(64)}`;
      if (
        type === "github" ||
        type === "gitlab" ||
        type === "bitbucket" ||
        type === "azurerepos" ||
        type === "git"
      ) {
        entry["resolvedCommit"] ??= "test-commit";
        entry["resolvedTree"] ??= "test-tree";
        entry["contentIdentity"] ??= computeSourceHash("test-content");
        entry["packageOwner"] ??= "@acme";
        entry["packageName"] ??= name;
        entry["sourceName"] ??= type;
        if (type !== "git") {
          entry["endpoint"] ??=
            type === "azurerepos"
              ? "https://dev.azure.com"
              : type === "gitlab"
                ? "https://gitlab.com"
                : type === "bitbucket"
                  ? "https://bitbucket.org"
                  : "https://github.com";
        }
      } else if (type === "local") {
        entry["sourceName"] ??= "local";
        entry["contentIdentity"] ??= computeSourceHash("test-content");
        entry["packageOwner"] ??= "@acme";
        entry["packageName"] ??= name;
      } else if (type === "registry") {
        entry["endpoint"] ??= "https://registry.agentxm.ai";
        if (entry["sourceName"] === undefined || entry["sourceName"] === "default") {
          entry["sourceName"] = "agentxm";
        }
        if (extensionType === "pack") {
          entry["manifestContentIdentity"] ??= computeSourceHash("test-pack-manifest");
        }
      }
      return entry;
    };
    const normalizeEntries = (
      entries: Record<string, unknown>,
      extensionType: "skill" | "mcp-server" | "subagent" | "knowledge" | "pack",
    ) =>
      Object.fromEntries(
        Object.entries(entries).map(([name, value]) => [
          name,
          normalizeEntry(name, value, extensionType),
        ]),
      );
    const lockfileData: Record<string, unknown> = {
      lockfileVersion: 6,
      skills: normalizeEntries(skills, "skill"),
    };
    if (packs !== undefined) {
      lockfileData["packs"] = normalizeEntries(packs, "pack");
    }
    if (mcpServers !== undefined) {
      lockfileData["mcpServers"] = normalizeEntries(mcpServers, "mcp-server");
    }
    if (subagents !== undefined) {
      lockfileData["subagents"] = normalizeEntries(subagents, "subagent");
    }
    if (knowledge !== undefined) {
      lockfileData["knowledge"] = normalizeEntries(knowledge, "knowledge");
    }
    fs.writeFileSync(path.join(dir, "axm-lock.yaml"), YAML.stringify(lockfileData));
  };

  interface TestLockfileDiskData {
    readonly lockfileVersion: number;
    readonly skills: Record<string, unknown>;
    readonly packs?: Record<string, unknown>;
    readonly mcpServers?: Record<string, unknown>;
    readonly subagents?: Record<string, unknown>;
    readonly knowledge?: Record<string, unknown>;
  }

  /** Read lockfile from disk for verification. */
  const readLockfileFromDisk = (dir: string): TestLockfileDiskData => {
    const lockfile: TestLockfileDiskData = YAML.parse(
      fs.readFileSync(path.join(dir, "axm-lock.yaml"), "utf-8"),
    );
    return lockfile;
  };

  /** Create a sample SkillLockEntry for testing. */
  const makeSampleLockEntry = (): Extract<SkillLockEntry, { readonly type: "github" }> => ({
    type: "github" as const,
    sourceType: "github",
    sourceName: "github",
    endpoint: new URL("https://github.com"),
    extensionType: "skill",
    workspaceName: extensionName("code-review"),
    packageFormat: "agentxm",
    packageOwner: handle("@acme"),
    packageName: extensionName("code-review"),
    owner: "acme",
    repo: "code-review",
    resolvedCommit: "test-commit",
    resolvedTree: "test-tree",
    contentIdentity: computeSourceHash("test-content"),
    treeIntegrity,
  });

  const makeSampleSubagentLockEntry = (): Extract<
    SubagentLockEntry,
    { readonly type: "github" }
  > => ({
    type: "github" as const,
    sourceType: "github",
    sourceName: "github",
    endpoint: new URL("https://github.com"),
    extensionType: "subagent",
    workspaceName: extensionName("planner"),
    packageFormat: "agentxm",
    packageOwner: handle("@acme"),
    packageName: extensionName("planner"),
    owner: "acme",
    repo: "planner",
    resolvedCommit: "test-commit",
    resolvedTree: "test-tree",
    contentIdentity: computeSourceHash("test-content"),
    treeIntegrity,
  });

  const registryLockFields = <
    T extends "skill" | "mcp-server" | "subagent" | "rule" | "hook" | "knowledge" | "pack",
  >(
    extensionType: T,
    workspaceName: string,
  ) => ({
    sourceType: "registry" as const,
    endpoint: new URL("https://registry.agentxm.ai"),
    extensionType,
    workspaceName: extensionName(workspaceName),
    packageFormat: "agentxm" as const,
  });

  const githubLockFields = <
    T extends "skill" | "mcp-server" | "subagent" | "rule" | "hook" | "knowledge",
  >(
    extensionType: T,
    workspaceName: string,
  ) => ({
    sourceType: "github" as const,
    sourceName: "github",
    endpoint: new URL("https://github.com"),
    extensionType,
    workspaceName: extensionName(workspaceName),
    packageFormat: "agentxm" as const,
  });

  const localLockFields = <
    T extends "skill" | "mcp-server" | "subagent" | "rule" | "hook" | "knowledge",
  >(
    extensionType: T,
    workspaceName: string,
  ) => ({
    sourceType: "local" as const,
    sourceName: "local" as const,
    extensionType,
    workspaceName: extensionName(workspaceName),
    packageFormat: "agentxm" as const,
  });

  describe("getLockfileState", () => {
    it.effect("returns missing when lockfile file is absent", () =>
      Effect.gen(function* () {
        fs.rmSync(path.join(projectDir, "axm-lock.yaml"), { force: true });

        const ws = yield* getService(defaultOptions);
        const state = yield* ws.getLockfileState();

        expect(state).toBe("missing");
      }),
    );

    it.effect("returns invalid when lockfile cannot be parsed", () =>
      Effect.gen(function* () {
        fs.writeFileSync(path.join(projectDir, "axm-lock.yaml"), "lockfileVersion: [");

        const ws = yield* getService(defaultOptions);
        const state = yield* ws.getLockfileState();

        expect(state).toBe("invalid");
      }),
    );

    it.effect("returns invalid when lockfile does not match the schema", () =>
      Effect.gen(function* () {
        fs.writeFileSync(
          path.join(projectDir, "axm-lock.yaml"),
          "lockfileVersion: 3\nskills: []\n",
        );

        const ws = yield* getService(defaultOptions);
        const state = yield* ws.getLockfileState();

        expect(state).toBe("invalid");
      }),
    );

    it.effect("returns ok for valid lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const state = yield* ws.getLockfileState();

        expect(state).toBe("ok");
      }),
    );
  });

  describe("strict lockfile reads", () => {
    it.effect("rejects an unreadable lockfile", () =>
      Effect.gen(function* () {
        fs.writeFileSync(
          path.join(projectDir, "axm-lock.yaml"),
          "lockfileVersion: 3\nskills: []\n",
        );

        const ws = yield* getService({ ...defaultOptions, allowUninitialized: true });
        const error = yield* ws.getLockedSkills().pipe(Effect.flip);

        expect(getAppError(error).code).toBe("validation");
        expect(getAppError(error).suggestions).toBeUndefined();
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Query methods
  // ---------------------------------------------------------------------------

  describe('rows("skill") — installed', () => {
    it.effect("returns normalized installed skills when skills are configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "code-review": "github:acme/code-review", "test-gen": "local:/tmp/test-gen" },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.records.rows("skill").pipe(Effect.map(installedRowsByName));

        expect(skills).toEqual({
          "code-review": {
            type: "skill",
            name: "code-review",
            lifecycle: "configured",
            source: "github:acme/code-review",
            enabled: true,
            packagingKind: "non-native",
          },
          "test-gen": {
            type: "skill",
            name: "test-gen",
            lifecycle: "configured",
            source: "local:/tmp/test-gen",
            enabled: true,
            packagingKind: "non-native",
          },
        });
      }),
    );

    it.effect("returns empty record when no skills configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.records.rows("skill").pipe(Effect.map(installedRowsByName));

        expect(skills).toEqual({});
      }),
    );
  });

  describe("getConfiguredAgents", () => {
    it.effect("returns agents array when agents are configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code", "cursor"] });

        const ws = yield* getService(defaultOptions);
        const agents = yield* ws.getConfiguredAgents();

        expect(agents).toEqual(["claude-code", "cursor"]);
      }),
    );

    it.effect("returns empty array when no agents configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const agents = yield* ws.getConfiguredAgents();

        expect(agents).toEqual([]);
      }),
    );
  });

  describe("getLockedSkills", () => {
    it.effect("returns skills lock map when lock entries are present", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "github",
            owner: "acme",
            repo: "code-review",
          },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getLockedSkills();

        expect(Object.keys(skills)).toEqual(["code-review"]);
        expect(skills["code-review"]?.type).toBe("github");
      }),
    );

    it.effect("returns empty record when no lock entries", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.getLockedSkills();

        expect(skills).toEqual({});
      }),
    );
  });

  describe("getLockedSkill", () => {
    it.effect("returns Option.some when skill exists in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "github",
            owner: "acme",
            repo: "code-review",
          },
        });

        const ws = yield* getService(defaultOptions);
        const entry = yield* ws.getLockedSkill("code-review");

        expect(Option.isSome(entry)).toBe(true);
        if (Option.isSome(entry)) {
          expect(entry.value.type).toBe("github");
        }
      }),
    );

    it.effect("returns Option.none when skill not in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const entry = yield* ws.getLockedSkill("nonexistent");

        expect(Option.isNone(entry)).toBe(true);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Compound mutations
  // ---------------------------------------------------------------------------

  describe("setKnowledge", () => {
    it.effect("preserves an explicit instruction-entry override while updating source state", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          knowledge: {
            platform: {
              source: "@acme/knowledge/platform@^1.0.0",
              instructionEntry: false,
            },
          },
        });
        writeLockfileTo(projectDir, {}, undefined, undefined, undefined, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.setKnowledge({
          name: "platform",
          lockEntry: {
            type: "registry",
            ...registryLockFields("knowledge", "platform"),
            owner: handle("@acme"),
            name: extensionName("platform"),
            resolvedVersion: exactVersion("1.1.0"),
            integrity: "sha512-AAAA==",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            treeIntegrity,
          },
          versionRange: Option.some(versionRange("^1.1.0")),
        });

        const settings: unknown = JSON.parse(
          fs.readFileSync(path.join(projectDir, "axm.json"), "utf8"),
        );
        expect(settings).toMatchObject({
          knowledge: {
            platform: {
              source: "agentxm:@acme/knowledge/platform@^1.1.0",
              instructionEntry: false,
            },
          },
        });
      }),
    );
  });

  describe("setSkill", () => {
    it.effect("installs new skill: adds to settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.setSkill({
          name: "code-review",
          lockEntry: makeSampleLockEntry(),
          versionRange: Option.none(),
        });

        // Verify settings on disk — source derived from lock entry
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills).toBeDefined();
        expect(settings.skills["code-review"]).toBe("github:acme/code-review");

        // Verify lockfile on disk
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.skills).toHaveProperty("code-review");
        expect(property(recordEntry(lockfile.skills, "code-review"), "type")).toBe("github");
      }),
    );

    it.effect("persists no receipt-history fields", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.setSkill({
          name: "code-review",
          lockEntry: makeSampleLockEntry(),
          versionRange: Option.none(),
        });
        const lockfile = readLockfileFromDisk(projectDir);
        const entry = recordEntry(lockfile.skills, "code-review");
        expect(entry).not.toHaveProperty("installedAt");
        expect(entry).not.toHaveProperty("updatedAt");
      }),
    );

    it.effect("does not rewrite files when the skill entry is unchanged", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "code-review": "github:acme/code-review" },
        });
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "github",
            owner: "acme",
            repo: "code-review",
          },
        });
        const settingsPath = path.join(projectDir, "axm.json");
        const lockfilePath = path.join(projectDir, "axm-lock.yaml");
        const settingsBefore = fs.readFileSync(settingsPath, "utf-8");
        const lockfileBefore = fs.readFileSync(lockfilePath, "utf-8");

        const ws = yield* getService(defaultOptions);
        yield* ws.setSkill({
          name: "code-review",
          lockEntry: {
            ...makeSampleLockEntry(),
          },
          versionRange: Option.none(),
        });

        expect(fs.readFileSync(settingsPath, "utf-8")).toBe(settingsBefore);
        expect(fs.readFileSync(lockfilePath, "utf-8")).toBe(lockfileBefore);
      }),
    );

    it.effect("does not rewrite an unchanged local skill lock entry", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "local-review": "skills/local-review" },
        });
        writeLockfileTo(projectDir, {
          "local-review": {
            type: "local",
            path: "skills/local-review",
          },
        });
        const settingsPath = path.join(projectDir, "axm.json");
        const lockfilePath = path.join(projectDir, "axm-lock.yaml");
        const lockfileBefore = fs.readFileSync(lockfilePath, "utf-8");

        const ws = yield* getService(defaultOptions);
        yield* ws.setSkill({
          name: "local-review",
          lockEntry: {
            type: "local",
            ...localLockFields("skill", "local-review"),
            packageOwner: handle("@acme"),
            packageName: extensionName("local-review"),
            path: "skills/local-review",
            contentIdentity: computeSourceHash("test-content"),
            treeIntegrity,
          },
          versionRange: Option.none(),
        });

        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills["local-review"]).toBe("./skills/local-review");
        expect(fs.readFileSync(lockfilePath, "utf-8")).toBe(lockfileBefore);
      }),
    );

    it.effect("updates existing skill: replaces in settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "code-review": "github:acme/code-review" },
        });
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "github",
            packageOwner: handle("@acme"),
            packageName: extensionName("code-review"),
            owner: "acme",
            repo: "code-review",
          },
          unrelated: {
            type: "github",
            owner: "acme",
            repo: "unrelated",
          },
        });

        const ws = yield* getService(defaultOptions);
        const updatedEntry: SkillLockEntry = {
          ...makeSampleLockEntry(),
          repo: "code-review-v2",
        };
        yield* ws.setSkill({
          name: "code-review",
          lockEntry: updatedEntry,
          versionRange: Option.none(),
        });

        // Verify settings updated — source derived from lock entry
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills["code-review"]).toBe("github:acme/code-review-v2");

        // Verify lockfile updated
        const lockfile = readLockfileFromDisk(projectDir);
        expect(recordEntry(lockfile.skills, "code-review")).not.toHaveProperty("agents");
        expect(stringProperty(recordEntry(lockfile.skills, "code-review"), "repo")).toBe(
          "code-review-v2",
        );
        expect(stringProperty(recordEntry(lockfile.skills, "unrelated"), "repo")).toBe("unrelated");
      }),
    );

    it.effect("replaces the accepted immutable identity when the lock entry changes", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "code-review": "github:acme/code-review" },
        });
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "github",
            owner: "acme",
            repo: "code-review",
          },
        });

        const ws = yield* getService(defaultOptions);
        const replacementIdentity = computeSourceHash("replacement-content");
        yield* ws.setSkill({
          name: "code-review",
          lockEntry: {
            type: "github",
            ...githubLockFields("skill", "code-review"),
            packageOwner: handle("@acme"),
            packageName: extensionName("code-review"),
            owner: "acme",
            repo: "code-review-v2",
            resolvedCommit: "replacement-commit",
            resolvedTree: "replacement-tree",
            contentIdentity: replacementIdentity,
            treeIntegrity,
          },
          versionRange: Option.none(),
        });

        const entry = recordEntry(readLockfileFromDisk(projectDir).skills, "code-review");
        expect(stringProperty(entry, "resolvedCommit")).toBe("replacement-commit");
        expect(stringProperty(entry, "resolvedTree")).toBe("replacement-tree");
        expect(stringProperty(entry, "contentIdentity")).toBe(replacementIdentity);
      }),
    );

    it.effect("preserves version constraint in settings for registry skills", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const registryEntry: SkillLockEntry = {
          type: "registry",
          ...registryLockFields("skill", "tool"),
          owner: handle("@acme"),
          name: extensionName("tool"),
          resolvedVersion: exactVersion("1.2.3"),
          integrity: "sha512-AAAA==",
          sourceName: "agentxm",

          publisherBindingId: "hbnd_test",
          treeIntegrity,
        };

        yield* ws.setSkill({
          name: "tool",
          lockEntry: registryEntry,
          versionRange: Option.some(versionRange("^1.0.0")),
        });

        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills.tool).toBe("agentxm:@acme/skills/tool@^1.0.0");
      }),
    );

    it.effect("omits version constraint in settings when none provided", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const registryEntry: SkillLockEntry = {
          type: "registry",
          ...registryLockFields("skill", "tool"),
          owner: handle("@acme"),
          name: extensionName("tool"),
          resolvedVersion: exactVersion("1.2.3"),
          integrity: "sha512-AAAA==",
          sourceName: "agentxm",

          publisherBindingId: "hbnd_test",
          treeIntegrity,
        };

        yield* ws.setSkill({
          name: "tool",
          lockEntry: registryEntry,
          versionRange: Option.none(),
        });

        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills.tool).toBe("agentxm:@acme/skills/tool");
      }),
    );

    it.effect("preserves exact pin version constraint", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const registryEntry: SkillLockEntry = {
          type: "registry",
          ...registryLockFields("skill", "tool"),
          owner: handle("@acme"),
          name: extensionName("tool"),
          resolvedVersion: exactVersion("1.2.3"),
          integrity: "sha512-AAAA==",
          sourceName: "agentxm",

          publisherBindingId: "hbnd_test",
          treeIntegrity,
        };

        yield* ws.setSkill({
          name: "tool",
          lockEntry: registryEntry,
          versionRange: Option.some(versionRange("1.2.3")),
        });

        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills.tool).toBe("agentxm:@acme/skills/tool@1.2.3");
      }),
    );
  });

  describe("setSkillLock", () => {
    it.effect("writes the replacement accepted identity when the lock entry changes", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "github",
            packageOwner: handle("@acme"),
            packageName: extensionName("code-review"),
            owner: "acme",
            repo: "code-review",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.setSkillLock({
          name: "code-review",
          lockEntry: {
            type: "github",
            ...githubLockFields("skill", "code-review"),
            packageOwner: handle("@acme"),
            packageName: extensionName("code-review"),
            owner: "acme",
            repo: "code-review-v2",
            resolvedCommit: "replacement-commit",
            resolvedTree: "replacement-tree",
            contentIdentity: computeSourceHash("replacement-content"),
            treeIntegrity,
          },
          versionRange: Option.none(),
        });

        const entry = recordEntry(readLockfileFromDisk(projectDir).skills, "code-review");
        expect(stringProperty(entry, "repo")).toBe("code-review-v2");
        expect(stringProperty(entry, "resolvedCommit")).toBe("replacement-commit");
        expect(stringProperty(entry, "resolvedTree")).toBe("replacement-tree");
      }),
    );

    it.effect("does not rewrite the lockfile when the entry is unchanged", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "github",
            owner: "acme",
            repo: "code-review",
          },
        });
        const lockfilePath = path.join(projectDir, "axm-lock.yaml");
        const lockfileBefore = fs.readFileSync(lockfilePath, "utf-8");

        const ws = yield* getService(defaultOptions);
        yield* ws.setSkillLock({
          name: "code-review",
          lockEntry: {
            ...makeSampleLockEntry(),
          },
          versionRange: Option.none(),
        });

        expect(fs.readFileSync(lockfilePath, "utf-8")).toBe(lockfileBefore);
      }),
    );
  });

  describe("registry constraint parity", () => {
    it.effect("preserves subagent and MCP constraints in direct settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});
        const ws = yield* getService(defaultOptions);

        yield* ws.setSubagent({
          name: "reviewer",
          versionRange: Option.some(versionRange("~2.0.0")),
          lockEntry: {
            type: "registry",
            ...registryLockFields("subagent", "reviewer"),
            owner: handle("@acme"),
            name: extensionName("reviewer"),
            resolvedVersion: exactVersion("2.0.4"),
            integrity: "sha512-BBBB==",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            treeIntegrity,
          },
        });
        yield* ws.setMcpServer({
          name: "browser",
          versionRange: Option.some(versionRange("3.x")),
          lockEntry: {
            type: "registry",
            ...registryLockFields("mcp-server", "browser"),
            owner: handle("@acme"),
            name: extensionName("browser"),
            resolvedVersion: exactVersion("3.1.0"),
            integrity: "sha512-CCCC==",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            treeIntegrity,
          },
        });

        const settings = JSON.parse(fs.readFileSync(path.join(projectDir, "axm.json"), "utf8"));
        expect(settings.subagents.reviewer).toBe("agentxm:@acme/subagents/reviewer@~2.0.0");
        expect(settings.mcpServers.browser).toBe("agentxm:@acme/mcps/browser@3.x");
      }),
    );
  });

  describe("setSubagent", () => {
    it.effect("does not rewrite files when the subagent entry is unchanged", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          subagents: {
            planner: {
              source: "github:acme/planner",
              enabled: true,
            },
          },
        });
        writeLockfileTo(projectDir, {}, undefined, undefined, {
          planner: {
            type: "github",
            owner: "acme",
            repo: "planner",
            sourceHash: "abc123",
          },
        });
        const settingsPath = path.join(projectDir, "axm.json");
        const lockfilePath = path.join(projectDir, "axm-lock.yaml");
        const settingsBefore = fs.readFileSync(settingsPath, "utf-8");
        const lockfileBefore = fs.readFileSync(lockfilePath, "utf-8");

        const ws = yield* getService(defaultOptions);
        yield* ws.setSubagent({
          name: "planner",
          versionRange: Option.none(),
          lockEntry: {
            ...makeSampleSubagentLockEntry(),
          },
        });

        expect(fs.readFileSync(settingsPath, "utf-8")).toBe(settingsBefore);
        expect(fs.readFileSync(lockfilePath, "utf-8")).toBe(lockfileBefore);
      }),
    );
  });

  describe("removeSkill", () => {
    it.effect("removes existing skill from both settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: {
            "code-review": "github:acme/code-review",
            "test-gen": "local:/tmp/test-gen",
          },
        });
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "github",
            owner: "acme",
            repo: "code-review",
          },
          "test-gen": {
            type: "local",
            path: "test-gen",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeSkill("code-review");

        // Verify settings: code-review removed, test-gen remains
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills).not.toHaveProperty("code-review");
        expect(settings.skills).toHaveProperty("test-gen");

        // Verify lockfile: code-review removed, test-gen remains
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.skills).not.toHaveProperty("code-review");
        expect(lockfile.skills).toHaveProperty("test-gen");
      }),
    );

    it.effect("no-op when skill does not exist", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "test-gen": "local:/tmp/test-gen" },
        });
        writeLockfileTo(projectDir, {
          "test-gen": {
            type: "local",
            path: "test-gen",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeSkill("nonexistent");

        // Verify nothing changed
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills).toHaveProperty("test-gen");
        expect(Object.keys(expectDefined(settings.skills))).toHaveLength(1);

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.skills).toHaveProperty("test-gen");
        expect(Object.keys(lockfile.skills)).toHaveLength(1);
      }),
    );

    it.effect("removes lockfile-only skill when not in settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
        });
        writeLockfileTo(projectDir, {
          implicit: {
            type: "local",
            path: "implicit",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeSkill("implicit");

        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills).toBeUndefined();

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.skills).not.toHaveProperty("implicit");
      }),
    );
  });

  describe("addConfiguredAgent", () => {
    it.effect("adds new agent to settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        yield* ws.addConfiguredAgent("cursor");

        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.agents).toEqual(["claude-code", "cursor"]);
      }),
    );

    it.effect("no-op when agent already present", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        yield* ws.addConfiguredAgent("claude-code");

        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.agents).toEqual(["claude-code"]);
      }),
    );

    it.effect("fails with InvalidAgentId for an invalid agent ID", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.addConfiguredAgent("invalid-agent-xyz").pipe(Effect.flip);

        expect(result).toBeInstanceOf(InvalidAgentId);
        expect(result._tag).toBe("InvalidAgentId");

        // Verify settings were not changed
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.agents).toEqual(["claude-code"]);
      }),
    );

    it.effect("fails with InvalidAgentId for the synthetic universal agent", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.addConfiguredAgent("universal").pipe(Effect.flip);

        expect(result).toBeInstanceOf(InvalidAgentId);
        expect(result._tag).toBe("InvalidAgentId");

        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.agents).toEqual(["claude-code"]);
      }),
    );
  });

  describe("removeConfiguredAgent", () => {
    it.effect("removes existing agent from settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code", "cursor"] });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeConfiguredAgent("cursor");

        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.agents).toEqual(["claude-code"]);
      }),
    );

    it.effect("no-op when agent is absent", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeConfiguredAgent("cursor");

        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.agents).toEqual(["claude-code"]);
      }),
    );

    it.effect("fails with InvalidAgentId for an invalid agent ID", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code", "cursor"] });

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.removeConfiguredAgent("invalid-agent-xyz").pipe(Effect.flip);

        expect(result).toBeInstanceOf(InvalidAgentId);
        expect(result._tag).toBe("InvalidAgentId");

        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.agents).toEqual(["claude-code", "cursor"]);
      }),
    );

    it.effect("fails with InvalidAgentId for the synthetic universal agent", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code", "cursor"] });

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.removeConfiguredAgent("universal").pipe(Effect.flip);

        expect(result).toBeInstanceOf(InvalidAgentId);
        expect(result._tag).toBe("InvalidAgentId");

        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.agents).toEqual(["claude-code", "cursor"]);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Initialization flow (bootstrapWorkspace)
  // ---------------------------------------------------------------------------

  describe("bootstrapWorkspace", () => {
    /**
     * Helper to remove the pre-created settings so init triggers.
     */
    const removePreCreatedSettings = () => {
      fs.rmSync(path.join(projectDir, "axm.json"), { force: true });
      fs.rmSync(path.join(projectDir, "axm-lock.yaml"), { force: true });
    };

    /**
     * Helper to create workspace layer with custom TUI behaviors for init testing.
     * Uses multiselect behavior to control which agents are "selected".
     */
    const getServiceWithInit = (flags: {
      verbose?: boolean;
      debug?: boolean;
      nonInteractive?: boolean;
    }) => {
      const { layer: logLayer } = TestRenderer.make();
      const workspaceInitInteraction = WorkspaceInitializationInteractionTest({
        selectAgents: () => Effect.succeed([]),
      });
      const flagsLayer = TestFlagsLayer(flags);
      const base = Layer.mergeAll(
        NodeServices.layer,
        logLayer,
        workspaceInitInteraction.layer,
        flagsLayer,
      );
      // Initialization reads non-interactivity from the options, not the flag.
      const wsOptions = {
        ...defaultOptions,
        ...(flags.nonInteractive === undefined ? {} : { nonInteractive: flags.nonInteractive }),
      };
      return {
        run: bootstrapWorkspace(wsOptions).pipe(
          Effect.map((r) => r.settings),
          Effect.provide(base),
          Effect.scoped,
        ),
        promptState: workspaceInitInteraction.state,
      };
    };

    it.effect("interactive mode calls multiselect directly (no select prompt)", () =>
      Effect.gen(function* () {
        removePreCreatedSettings();
        const { run, promptState } = getServiceWithInit({
          nonInteractive: false,
        });

        yield* run;

        // Should have called multiselect once (no select prompt)
        expect(promptState.selectAgentsCalls).toHaveLength(1);
        expect(promptState.selectAgentsCalls[0]).toEqual(
          expect.objectContaining({
            detectedIds: expect.any(Array),
          }),
        );
      }),
    );

    it.effect("--non-interactive auto-selects detected agents without prompting", () =>
      Effect.gen(function* () {
        removePreCreatedSettings();
        // Create .claude dir in project to trigger detection
        fs.mkdirSync(path.join(projectDir, ".claude"), { recursive: true });

        const { run, promptState } = getServiceWithInit({
          nonInteractive: true,
        });

        const settings = yield* run;

        // --non-interactive skips prompting entirely
        expect(promptState.selectAgentsCalls).toHaveLength(0);
        // claude-code should be auto-selected via project-level detection
        expect(settings.agents).toContain("claude-code");
      }),
    );

    it.effect("--yes still prompts for agent selection", () =>
      Effect.gen(function* () {
        removePreCreatedSettings();
        // Create .claude dir in project to trigger detection
        fs.mkdirSync(path.join(projectDir, ".claude"), { recursive: true });

        const { run, promptState } = getServiceWithInit({
          nonInteractive: false,
        });

        yield* run;

        // --yes alone does not skip selection prompts
        expect(promptState.selectAgentsCalls).toHaveLength(1);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // getSkillDir
  // ---------------------------------------------------------------------------

  describe("getSkillDir", () => {
    it.effect("name-only lookup with registry lock entry returns registry paths", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {
          "my-skill": {
            type: "registry",
            owner: "@acme",
            name: "my-skill",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "agentxm",

            publisherBindingId: "hbnd_test",
          },
        });

        const ws = yield* getService(defaultOptions);
        const paths = yield* ws.getSkillDir("my-skill");

        expect(paths.canonicalPath).toContain("agent_extensions/agentxm/@acme/skills/my-skill");
        expect(paths.skillSrcPath).toContain(
          "agent_extensions/agentxm/@acme/skills/my-skill" + path.sep + "src",
        );
        expect(paths.skillSrcPath).toBe(paths.canonicalPath + path.sep + "src");
      }),
    );

    it.effect(
      "name-only lookup with non-registry lock entry returns external extensions paths",
      () =>
        Effect.gen(function* () {
          writeLockfileTo(projectDir, {
            "code-review": {
              type: "github",
              owner: "acme",
              repo: "code-review",
            },
          });

          const ws = yield* getService(defaultOptions);
          const paths = yield* ws.getSkillDir("code-review");

          expect(paths.canonicalPath).toContain("agent_extensions/github/acme/code-review");
          expect(paths.skillSrcPath).toBe(paths.canonicalPath + path.sep + "src");
        }),
    );

    it.effect("explicit registry source returns correct paths without lockfile lookup", () =>
      Effect.gen(function* () {
        // Empty lockfile — explicit source should not need it
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const paths = yield* ws.getSkillDir("my-skill", {
          refType: "registry",
          owner: handle("@corp"),
          source: {
            type: "registry",
            name: "agentxm",
            location: new URL("https://registry.agentxm.ai"),
            owner: Option.none(),
          },
        });

        expect(paths.canonicalPath).toContain("agent_extensions/agentxm/@corp/skills/my-skill");
        expect(paths.skillSrcPath).toBe(paths.canonicalPath + path.sep + "src");
      }),
    );

    it.effect("explicit non-registry source returns correct paths without lockfile lookup", () =>
      Effect.gen(function* () {
        // Empty lockfile — explicit source should not need it
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const paths = yield* ws.getSkillDir("code-review", {
          refType: "git-hosted",
          source: {
            type: "github",
            name: "github",
            url: new URL("https://github.com"),
            owner: "acme",
            repo: "code-review",
            ref: Option.none(),
            subPath: Option.none(),
          },
        });

        expect(paths.canonicalPath).toContain("agent_extensions/github/acme/code-review");
        expect(paths.skillSrcPath).toBe(paths.canonicalPath + path.sep + "src");
      }),
    );

    it.effect("name-only with missing lock entry fails with SKILL_NOT_LOCKED", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getSkillDir("nonexistent").pipe(Effect.flip);

        expect(result).toBeInstanceOf(LockedSkillMissing);
        expect(result._tag).toBe("LockedSkillMissing");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Semaphore serialization
  // ---------------------------------------------------------------------------

  describe("semaphore serialization", () => {
    it.effect("concurrent setSkill and addConfiguredSource do not interleave", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);

        const newSource: SourceHostConfig = {
          name: "my-registry",
          type: "registry",
          location: new URL("https://registry.example.com"),
        };

        yield* Effect.all(
          [
            ws.setSkill({
              name: "code-review",
              lockEntry: makeSampleLockEntry(),
              versionRange: Option.none(),
            }),
            ws.addConfiguredSource(newSource),
          ],
          { concurrency: "unbounded" },
        );

        // Both mutations should be present in final state
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills).toHaveProperty("code-review");
        expect(settings.sources).toBeDefined();
        expect(settings.sources).toHaveLength(1);
        expect(settings.sources[0].name).toBe("my-registry");

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.skills).toHaveProperty("code-review");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // rows("skill") — configured lifecycle
  // ---------------------------------------------------------------------------

  describe('rows("skill") — configured', () => {
    it.effect("returns all configured entries normalized", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: {
            "code-review": "github:acme/code-review",
            "my-linter": { source: "github:acme/linter", enabled: false },
          },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.records.rows("skill").pipe(Effect.map(configuredRowsByName));

        expect(Object.keys(skills)).toEqual(["code-review", "my-linter"]);

        // String entry normalizes to enabled with source + metadata
        expect(skills["code-review"]).toEqual({
          type: "skill",
          name: "code-review",
          lifecycle: "configured",
          source: "github:acme/code-review",
          enabled: true,
          packagingKind: "non-native",
        });

        // Object entry normalizes to disabled with source + metadata
        expect(skills["my-linter"]).toEqual({
          type: "skill",
          name: "my-linter",
          lifecycle: "configured",
          source: "github:acme/linter",
          enabled: false,
          packagingKind: "non-native",
        });
      }),
    );

    it.effect("returns empty record when no skills configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.records.rows("skill").pipe(Effect.map(configuredRowsByName));

        expect(skills).toEqual({});
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // rows("skill") — installed lifecycle, normalized row shapes
  // ---------------------------------------------------------------------------

  describe('rows("skill") — installed, normalized', () => {
    it.effect("returns all configured entries as SkillEntry", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: {
            "code-review": "github:acme/code-review",
            "my-linter": { source: "github:acme/linter", enabled: false },
          },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.records.rows("skill").pipe(Effect.map(installedRowsByName));

        expect(Object.keys(skills)).toEqual(["code-review", "my-linter"]);

        expect(skills["code-review"]).toEqual({
          type: "skill",
          name: "code-review",
          lifecycle: "configured",
          source: "github:acme/code-review",
          enabled: true,
          packagingKind: "non-native",
        });

        expect(skills["my-linter"]).toEqual({
          type: "skill",
          name: "my-linter",
          lifecycle: "configured",
          source: "github:acme/linter",
          enabled: false,
          packagingKind: "non-native",
        });
      }),
    );

    it.effect("returns empty record when no skills configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.records.rows("skill").pipe(Effect.map(installedRowsByName));

        expect(skills).toEqual({});
      }),
    );

    it.effect("configured entries have source as string", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: {
            "code-review": "github:acme/code-review",
          },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.records.rows("skill").pipe(Effect.map(installedRowsByName));

        for (const entry of Object.values(skills)) {
          if (entry.lifecycle === "configured") {
            expect(typeof entry.source).toBe("string");
          }
        }
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // updateSkillEntry
  // ---------------------------------------------------------------------------

  describe("updateSkillEntry", () => {
    it.effect("applies updater and collapses result back to settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "code-review": "github:acme/code-review" },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.updateSkillEntry("code-review", (entry) => ({ ...entry, enabled: false }));

        // Verify on disk: collapsed to object form since enabled=false
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills["code-review"]).toEqual({
          source: "github:acme/code-review",
          enabled: false,
        });
      }),
    );

    it.effect("collapses to string form when enabled stays true", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "code-review": { source: "github:acme/code-review", enabled: false } },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.updateSkillEntry("code-review", (entry) => ({ ...entry, enabled: true }));

        // Collapsed to plain string since enabled=true
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills["code-review"]).toBe("github:acme/code-review");
      }),
    );

    it.effect("fails with SettingsEntryMissing for a missing skill name", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"], skills: {} });

        const ws = yield* getService(defaultOptions);
        const result = yield* ws
          .updateSkillEntry("nonexistent", (entry) => entry)
          .pipe(Effect.flip);

        expect(result).toBeInstanceOf(SettingsEntryMissing);
        expect(result._tag).toBe("SettingsEntryMissing");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Pack methods
  // ---------------------------------------------------------------------------

  /** Create sample SetPackArgs for testing. */
  const makeSampleSetPackArgs = (
    overrides?: Partial<Extract<SetPackArgs, { type: "registry" }>>,
  ): Extract<SetPackArgs, { type: "registry" }> => ({
    type: "registry",
    sourceType: "registry",
    endpoint: new URL("https://registry.agentxm.ai"),
    extensionType: "pack",
    workspaceName: extensionName("starter-pack"),
    packageFormat: "agentxm",
    owner: handle("@acme"),
    name: extensionName("starter-pack"),
    resolvedVersion: exactVersion("1.0.0"),
    integrity: "sha512-AAAA==",
    manifestContentIdentity: computeSourceHash("test-pack-manifest"),
    treeIntegrity,
    sourceName: "agentxm",
    versionRange: Option.none(),
    ...overrides,
    publisherBindingId: overrides?.publisherBindingId ?? "hbnd_test",
  });

  describe('rows("pack") — configured', () => {
    it.effect("returns packs map when packs are configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "starter-pack": "@acme/packs/starter-pack" },
        });

        const ws = yield* getService(defaultOptions);
        const packs = yield* ws.records.rows("pack").pipe(Effect.map(configuredRowsByName));

        expect(packs).toEqual({
          "starter-pack": {
            type: "pack",
            name: "starter-pack",
            lifecycle: "configured",
            source: "@acme/packs/starter-pack",
            enabled: true,
            packagingKind: "native",
          },
        });
      }),
    );

    it.effect("returns empty record when no packs configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const packs = yield* ws.records.rows("pack").pipe(Effect.map(configuredRowsByName));

        expect(packs).toEqual({});
      }),
    );
  });

  describe('rows("pack") — installed', () => {
    it.effect("returns packs map when packs are configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "starter-pack": "@acme/packs/starter-pack" },
        });

        const ws = yield* getService(defaultOptions);
        const packs = yield* ws.records.rows("pack").pipe(Effect.map(installedRowsByName));

        expect(packs).toEqual({
          "starter-pack": {
            type: "pack",
            name: "starter-pack",
            lifecycle: "configured",
            source: "@acme/packs/starter-pack",
            enabled: true,
            packagingKind: "native",
          },
        });
      }),
    );

    it.effect("returns empty record when no packs configured", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const packs = yield* ws.records.rows("pack").pipe(Effect.map(installedRowsByName));

        expect(packs).toEqual({});
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // records.rows / getExtensionInventory totality
  // ---------------------------------------------------------------------------

  describe("records.rows", () => {
    it.effect("is total and non-throwing for every installable extension type", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const byType = yield* Effect.forEach(installableExtensionTypes, (type) =>
          ws.records.rows(type).pipe(Effect.map((rows) => [type, rows] as const)),
        );

        expect(byType.map(([type]) => type)).toEqual([...installableExtensionTypes]);
        for (const [, rows] of byType) {
          expect(Array.isArray(rows)).toBe(true);
        }
      }),
    );

    it.effect("projects declared hooks and knowledge bundles the families now own", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          hooks: { "block-secrets": "@acme/hooks/block-secrets@^1.0.0" },
          knowledge: { payments: "@acme/knowledge/payments@^1.0.0" },
        });

        const ws = yield* getService(defaultOptions);
        const hooks = yield* ws.records.rows("hook").pipe(Effect.map(configuredRowsByName));
        const knowledge = yield* ws.records
          .rows("knowledge")
          .pipe(Effect.map(configuredRowsByName));

        expect(hooks["block-secrets"]?.source).toBe("@acme/hooks/block-secrets@^1.0.0");
        expect(knowledge["payments"]?.source).toBe("@acme/knowledge/payments@^1.0.0");
      }),
    );

    it.effect("uses the accepted pack resolution with the authored manifest", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "starter-pack": "@acme/packs/starter-pack" },
        });
        const contentIdentity = writePackManifestTo(projectDir, "@acme", "starter-pack", {});
        writeAcceptedPackResolutionTo(projectDir, "@acme", "starter-pack", contentIdentity);

        const ws = yield* getService(defaultOptions);
        const graph = yield* ws.getDesiredStateGraph();

        expect(graph.complete).toBe(true);
        expect(graph.problems).toEqual([]);
        expect(graph.nodes).toContainEqual(
          expect.objectContaining({
            type: "pack",
            name: "starter-pack",
          }),
        );
      }),
    );

    it.effect(
      "keeps direct desired declarations independent of unrelated accepted resolutions",
      () =>
        Effect.gen(function* () {
          writeSettingsTo(projectDir, {
            agents: ["claude-code"],
            skills: { review: "@acme/skills/review@^1.0.0" },
            mcpServers: { browser: "@acme/mcps/browser@^1.0.0" },
            subagents: { planner: "@acme/subagents/planner@^1.0.0" },
            rules: { security: "@acme/rules/security@^1.0.0" },
            hooks: { preflight: "@acme/hooks/preflight@^1.0.0" },
            knowledge: { handbook: "@acme/knowledge/handbook@^1.0.0" },
          });

          const resolutionEntry = (name: string, owner = "@acme") => ({
            type: "registry",
            ...registryLockFields("skill", name),
            owner,
            name,
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
          });
          const lock = (suffix = "", owner = "@acme") => ({
            lockfileVersion: 6,
            skills: { [`unrelated${suffix}`]: resolutionEntry(`unrelated${suffix}`, owner) },
          });
          const lockfilePath = path.join(projectDir, "axm-lock.yaml");
          const variants = [
            {
              name: "missing",
              write: () => fs.rmSync(lockfilePath, { force: true }),
            },
            {
              name: "empty",
              write: () =>
                fs.writeFileSync(lockfilePath, YAML.stringify({ lockfileVersion: 6, skills: {} })),
            },
            {
              name: "unrelated",
              write: () => fs.writeFileSync(lockfilePath, YAML.stringify(lock("-old", "@other"))),
            },
          ] as const;

          const snapshots: Array<unknown> = [];
          let observedTypes: ReadonlyArray<string> = [];
          for (const variant of variants) {
            variant.write();
            const ws = yield* getService(defaultOptions);
            const graph = yield* ws.getDesiredStateGraph();
            snapshots.push({
              complete: graph.complete,
              nodes: graph.nodes,
              problems: graph.problems,
            });
            if (observedTypes.length === 0) {
              observedTypes = graph.nodes.map((node) => node.type);
            }
          }

          expect(snapshots.slice(1)).toEqual(snapshots.slice(1).map(() => snapshots[0]));
          expect(observedTypes).toEqual([
            "skill",
            "mcp-server",
            "subagent",
            "rule",
            "hook",
            "knowledge",
          ]);
        }),
    );
  });

  describe("getInventory", () => {
    it.effect("aggregates every type deterministically and supports a type filter", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: {
            zeta: "@acme/skills/zeta",
            alpha: "@acme/skills/alpha",
          },
          hooks: { audit: "@acme/hooks/audit" },
          knowledge: { handbook: "@acme/knowledge/handbook" },
        });

        const ws = yield* getService(defaultOptions);
        const inventory = yield* ws.records.getInventory({});
        const skills = yield* ws.records.getInventory({ type: "skill" });

        expect(inventory.items.map((item) => `${item.type}:${item.name}`)).toEqual([
          "hook:audit",
          "knowledge:handbook",
          "skill:alpha",
          "skill:zeta",
        ]);
        expect(inventory.count).toBe(4);
        expect(inventory.configuredCount).toBe(4);
        expect(skills.items.map((item) => item.name)).toEqual(["alpha", "zeta"]);
        expect(skills.count).toBe(2);
      }),
    );
  });

  describe("getExtensionInventory", () => {
    it.effect("derives implicit lifecycle for every pack leaf from the pack manifest", () =>
      Effect.gen(function* () {
        const cases = [
          { type: "skill", name: "review", fqn: "@acme/skills/review" },
          { type: "mcp-server", name: "browser", fqn: "@acme/mcps/browser" },
          { type: "subagent", name: "planner", fqn: "@acme/subagents/planner" },
          { type: "rule", name: "security", fqn: "@acme/rules/security" },
          { type: "hook", name: "preflight", fqn: "@acme/hooks/preflight" },
          { type: "knowledge", name: "handbook", fqn: "@acme/knowledge/handbook" },
        ] as const;
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "starter-pack": "@acme/packs/starter-pack" },
        });
        const contentIdentity = writePackManifestTo(
          projectDir,
          "@acme",
          "starter-pack",
          Object.fromEntries(cases.map((entry) => [entry.fqn, "^1.0.0"])),
        );
        writeAcceptedPackResolutionTo(projectDir, "@acme", "starter-pack", contentIdentity);

        const ws = yield* getService(defaultOptions);
        for (const entry of cases) {
          const rows = yield* ws.records.rows(entry.type);
          expect(rows).toContainEqual(
            expect.objectContaining({
              type: entry.type,
              name: entry.name,
              lifecycle: "implicit",
            }),
          );

          const inventory = yield* ws.records.getExtensionInventory(entry.type, {});
          expect(inventory.items).toContainEqual(
            expect.objectContaining({
              type: entry.type,
              name: entry.name,
              classification: { kind: "lifecycle", lifecycle: "implicit" },
              installed: false,
            }),
          );
        }
      }),
    );

    it.effect("returns lifecycle rows for an installed knowledge bundle", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          knowledge: { payments: "@acme/knowledge/payments@^1.0.0" },
        });
        const bundleSrc = path.join(
          projectDir,
          ".axm",
          "extensions",
          "@acme",
          "knowledge",
          "payments",
          "src",
        );
        fs.mkdirSync(bundleSrc, { recursive: true });
        fs.writeFileSync(path.join(bundleSrc, "index.md"), "# Payments\n");

        const ws = yield* getService(defaultOptions);
        const inventory = yield* ws.records.getExtensionInventory("knowledge", {});

        expect(inventory.count).toBe(1);
        expect(inventory.configuredCount).toBe(1);
        expect(inventory.items[0]?.name).toBe("payments");
      }),
    );

    it.effect("is total and non-throwing for every installable extension type", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const inventories = yield* Effect.forEach(installableExtensionTypes, (type) =>
          ws.records.getExtensionInventory(type, {}),
        );

        expect(inventories).toHaveLength(installableExtensionTypes.length);
      }),
    );
  });

  describe("getLockedPacks", () => {
    it.effect("returns packs lock map when lock entries are present", () =>
      Effect.gen(function* () {
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              owner: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
              sourceName: "agentxm",

              publisherBindingId: "hbnd_test",
              resolvedSkills: {
                "@acme/skills/code-review": {
                  source: "registry",
                  version: "1.2.0",
                  publisherBindingId: "hbnd_test",
                  integrity: "sha512-member",
                },
              },
              resolvedMcpServers: {},
              resolvedSubagents: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const packs = yield* ws.getLockedPacks();

        expect(Object.keys(packs)).toEqual(["starter-pack"]);
        expect(packs["starter-pack"]?.type).toBe("registry");
        expect(packs["starter-pack"]).not.toHaveProperty("resolvedSkills");
      }),
    );

    it.effect("returns empty record when no pack lock entries", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const packs = yield* ws.getLockedPacks();

        expect(packs).toEqual({});
      }),
    );
  });

  describe("getLockedPack", () => {
    it.effect("returns Option.some when pack exists in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              owner: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
              sourceName: "agentxm",

              publisherBindingId: "hbnd_test",
              resolvedSkills: {},
              resolvedMcpServers: {},
              resolvedSubagents: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const entry = yield* ws.getLockedPack("starter-pack");

        expect(Option.isSome(entry)).toBe(true);
        if (Option.isSome(entry) && entry.value.type === "registry") {
          expect(entry.value.resolvedVersion).toBe("1.0.0");
        }
      }),
    );

    it.effect("returns Option.none when pack not in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const entry = yield* ws.getLockedPack("nonexistent");

        expect(Option.isNone(entry)).toBe(true);
      }),
    );
  });

  describe("setPack", () => {
    it.effect("installs new pack: adds to settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.setPack(makeSampleSetPackArgs());

        // Verify settings on disk
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.packs).toBeDefined();
        expect(settings.packs["starter-pack"]).toBe("agentxm:@acme/packs/starter-pack");

        // Verify lockfile on disk
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.packs).toHaveProperty("starter-pack");
        expect(property(recordEntry(expectDefined(lockfile.packs), "starter-pack"), "type")).toBe(
          "registry",
        );
      }),
    );

    it.effect("persists no receipt-history fields", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.setPack(makeSampleSetPackArgs());

        const lockfile = readLockfileFromDisk(projectDir);
        const entry = recordEntry(expectDefined(lockfile.packs), "starter-pack");
        expect(entry).not.toHaveProperty("installedAt");
        expect(entry).not.toHaveProperty("updatedAt");
      }),
    );
  });

  describe("removePack", () => {
    it.effect("removes existing pack from both settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: {
            "starter-pack": "@acme/packs/starter-pack",
            "other-pack": "@acme/packs/other-pack",
          },
        });
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              owner: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
              sourceName: "agentxm",

              publisherBindingId: "hbnd_test",
              resolvedSkills: {},
              resolvedMcpServers: {},
              resolvedSubagents: {},
            },
            "other-pack": {
              type: "registry",
              owner: "@acme",
              name: "other-pack",
              resolvedVersion: "2.0.0",
              integrity: "sha512-CCCC==",
              sourceName: "agentxm",

              publisherBindingId: "hbnd_test",
              resolvedSkills: {},
              resolvedMcpServers: {},
              resolvedSubagents: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        yield* ws.removePack("starter-pack");

        // Verify settings: starter-pack removed, other-pack remains
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.packs).not.toHaveProperty("starter-pack");
        expect(settings.packs).toHaveProperty("other-pack");

        // Verify lockfile: starter-pack removed, other-pack remains
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.packs).not.toHaveProperty("starter-pack");
        expect(lockfile.packs).toHaveProperty("other-pack");
      }),
    );

    it.effect("no-op when pack does not exist", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "other-pack": "@acme/packs/other-pack" },
        });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.removePack("nonexistent");

        // Verify nothing changed
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.packs).toHaveProperty("other-pack");
        expect(Object.keys(expectDefined(settings.packs))).toHaveLength(1);
      }),
    );
  });

  describe("getPackDir", () => {
    it.effect("returns registry extensions path with owner", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getPackDir("starter-pack", handle("@acme"), "agentxm");

        expect(result.canonicalPath).toContain("agent_extensions/agentxm/@acme/packs/starter-pack");
      }),
    );

    it.effect("handles different namespaces correctly", () =>
      Effect.gen(function* () {
        const ws = yield* getService(defaultOptions);
        const result = yield* ws.getPackDir("my-pack", handle("@community"), "private");

        expect(result.canonicalPath).toContain("agent_extensions/private/@community/packs/my-pack");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // rows("skill") — installed lifecycle, with transitive pack skills
  // ---------------------------------------------------------------------------

  describe('rows("skill") — installed, with pack members', () => {
    it.effect("does not manufacture an installed skill from a receipt-only row", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
        });
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "registry",
            owner: "@acme",
            name: "code-review",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "agentxm",

            publisherBindingId: "hbnd_test",
          },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.records.rows("skill").pipe(Effect.map(installedRowsByName));

        expect(skills).not.toHaveProperty("code-review");
      }),
    );

    it.effect("configured entry takes precedence over lockfile-only", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "code-review": "github:acme/code-review" },
        });
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "registry",
            owner: "@acme",
            name: "code-review",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "agentxm",

            publisherBindingId: "hbnd_test",
          },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.records.rows("skill").pipe(Effect.map(installedRowsByName));

        expect(recordEntry(skills, "code-review").lifecycle).toBe("configured");
      }),
    );

    it.effect("configured rows only include direct settings entries", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "my-skill": "github:acme/my-skill" },
        });
        writeLockfileTo(projectDir, {
          "my-skill": {
            type: "registry",
            owner: "@acme",
            name: "my-skill",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "agentxm",

            publisherBindingId: "hbnd_test",
          },
          "implicit-skill": {
            type: "registry",
            owner: "@acme",
            name: "implicit-skill",
            resolvedVersion: "1.0.0",
            integrity: "sha512-BBBB==",
            sourceName: "agentxm",

            publisherBindingId: "hbnd_test",
          },
        });

        const ws = yield* getService(defaultOptions);
        const configured = yield* ws.records.rows("skill").pipe(Effect.map(configuredRowsByName));

        expect(Object.keys(configured)).toEqual(["my-skill"]);
        expect(configured).not.toHaveProperty("implicit-skill");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Read-model record getter contracts (skills)
  // ---------------------------------------------------------------------------

  describe('rows("skill") — unmanaged', () => {
    it.effect("returns empty when no unmanaged skills detected", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const unmanaged = yield* ws.records.rows("skill").pipe(Effect.map(unmanagedRowsByName));

        expect(unmanaged).toEqual({});
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Read-model record getter contracts (MCP servers)
  // ---------------------------------------------------------------------------

  describe('rows("mcp-server") — unmanaged', () => {
    it.effect("returns empty (phase 1 - no MCP server unmanaged detection)", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const unmanaged = yield* ws.records
          .rows("mcp-server")
          .pipe(Effect.map(unmanagedRowsByName));

        expect(unmanaged).toEqual({});
      }),
    );
  });

  describe('rows("mcp-server") — installed', () => {
    it.effect("excludes receipt-only MCP servers while preserving configured intent", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: { "configured-mcp": "github:acme/configured-mcp" },
        });
        writeLockfileTo(projectDir, {}, undefined, {
          "configured-mcp": {
            type: "github",
            owner: "acme",
            repo: "configured-mcp",
          },
          "implicit-mcp": {
            type: "registry",
            owner: "@acme",
            name: "implicit-mcp",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "agentxm",

            publisherBindingId: "hbnd_test",
          },
        });

        const ws = yield* getService(defaultOptions);
        const installed = yield* ws.records
          .rows("mcp-server")
          .pipe(Effect.map(installedRowsByName));

        expect(recordEntry(installed, "configured-mcp").lifecycle).toBe("configured");
        expect(installed).not.toHaveProperty("implicit-mcp");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Read-model record getter contracts (packs)
  // ---------------------------------------------------------------------------

  describe('rows("pack") — unmanaged', () => {
    it.effect("returns empty (phase 1 - no pack unmanaged detection)", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        const unmanaged = yield* ws.records.rows("pack").pipe(Effect.map(unmanagedRowsByName));

        expect(unmanaged).toEqual({});
      }),
    );
  });

  describe('rows("pack") — installed, with pack members', () => {
    it.effect("does not manufacture an installed pack from a receipt-only row", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(
          projectDir,
          {},
          {
            "@axm/packs/default": {
              type: "registry",
              owner: "@axm",
              name: "agentxm",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
              sourceName: "agentxm",

              publisherBindingId: "hbnd_test",
              resolvedSkills: {},
              resolvedMcpServers: {},
              resolvedSubagents: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const installed = yield* ws.records.rows("pack").pipe(Effect.map(installedRowsByName));

        expect(installed).not.toHaveProperty("@axm/packs/default");
      }),
    );

    it.effect("excludes receipt-only packs while preserving configured intent", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "my-pack": "@acme/packs/my-pack" },
        });
        writeLockfileTo(
          projectDir,
          {},
          {
            "my-pack": {
              type: "registry",
              owner: "@acme",
              name: "my-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
              sourceName: "agentxm",

              publisherBindingId: "hbnd_test",
              resolvedSkills: {},
              resolvedMcpServers: {},
              resolvedSubagents: {},
            },
            "@axm/packs/default": {
              type: "registry",
              owner: "@axm",
              name: "agentxm",
              resolvedVersion: "1.0.0",
              integrity: "sha512-BBBB==",
              sourceName: "agentxm",

              publisherBindingId: "hbnd_test",
              resolvedSkills: {},
              resolvedMcpServers: {},
              resolvedSubagents: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        const installed = yield* ws.records.rows("pack").pipe(Effect.map(installedRowsByName));

        expect(recordEntry(installed, "my-pack").lifecycle).toBe("configured");
        expect(installed).not.toHaveProperty("@axm/packs/default");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // MCP settings API consistency (camelCase)
  // ---------------------------------------------------------------------------

  describe("MCP settings API camelCase consistency", () => {
    it.effect("setMcpServer writes to mcpServers key in settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });

        const ws = yield* getService(defaultOptions);
        yield* ws.setMcpServer({
          name: "my-mcp",
          versionRange: Option.none(),
          lockEntry: {
            ...makeSampleMcpServerLockEntry(),
            repo: "my-mcp",
          },
        });

        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings).toHaveProperty("mcpServers");
        expect(settings["mcpServers"]).toHaveProperty("my-mcp");
      }),
    );

    it.effect("removeMcpServer reads from mcpServers key in settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: { "my-mcp": "github:acme/my-mcp" },
        });
        writeLockfileTo(projectDir, {}, undefined, {
          "my-mcp": {
            type: "github",
            owner: "acme",
            repo: "my-mcp",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeMcpServer("my-mcp");

        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings["mcpServers"]).not.toHaveProperty("my-mcp");
      }),
    );

    it.effect("configured mcp-server rows read from the mcpServers key", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: { "my-mcp": "github:acme/my-mcp" },
        });

        const ws = yield* getService(defaultOptions);
        const servers = yield* ws.records.rows("mcp-server").pipe(Effect.map(configuredRowsByName));

        expect(servers).toHaveProperty("my-mcp");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Read-model record shapes: no managed marker
  // ---------------------------------------------------------------------------

  describe("read-model record shapes have no managed marker", () => {
    it.effect("configured skill rows have no managed field", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "my-skill": "github:acme/my-skill" },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.records.rows("skill").pipe(Effect.map(configuredRowsByName));

        for (const entry of Object.values(skills)) {
          expect(entry).not.toHaveProperty("managed");
        }
      }),
    );

    it.effect("installed skill rows have no managed field", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "my-skill": "github:acme/my-skill" },
        });

        const ws = yield* getService(defaultOptions);
        const skills = yield* ws.records.rows("skill").pipe(Effect.map(installedRowsByName));

        for (const entry of Object.values(skills)) {
          expect(entry).not.toHaveProperty("managed");
        }
      }),
    );
  });

  const makeSampleMcpServerLockEntry = (): Extract<
    McpServerLockEntry,
    { readonly type: "github" }
  > => ({
    type: "github",
    sourceType: "github",
    sourceName: "github",
    endpoint: new URL("https://github.com"),
    extensionType: "mcp-server",
    workspaceName: extensionName("my-mcp-server"),
    packageFormat: "agentxm",
    packageOwner: handle("@acme"),
    packageName: extensionName("my-mcp-server"),
    owner: "acme",
    repo: "my-mcp-server",
    resolvedCommit: "test-commit",
    resolvedTree: "test-tree",
    contentIdentity: computeSourceHash("test-content"),
    treeIntegrity,
  });

  const makeSampleSetMcpServerArgs = (overrides?: Partial<SetMcpServerArgs>): SetMcpServerArgs => ({
    name: "my-mcp-server",
    lockEntry: makeSampleMcpServerLockEntry(),
    versionRange: Option.none(),
    ...overrides,
  });

  describe("getLockedMcpServers", () => {
    it.effect("returns mcp servers lock map when lock entries are present", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {}, undefined, {
          "my-mcp-server": {
            type: "github",
            owner: "acme",
            repo: "my-mcp-server",
          },
        });

        const ws = yield* getService(defaultOptions);
        const mcpServers = yield* ws.getLockedMcpServers();

        expect(Object.keys(mcpServers)).toEqual(["my-mcp-server"]);
        expect(mcpServers["my-mcp-server"]?.type).toBe("github");
      }),
    );

    it.effect("returns empty record when no mcp server lock entries", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const mcpServers = yield* ws.getLockedMcpServers();

        expect(mcpServers).toEqual({});
      }),
    );
  });

  describe("getLockedMcpServer", () => {
    it.effect("returns Option.some when mcp server exists in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {}, undefined, {
          "my-mcp-server": {
            type: "github",
            owner: "acme",
            repo: "my-mcp-server",
          },
        });

        const ws = yield* getService(defaultOptions);
        const entry = yield* ws.getLockedMcpServer("my-mcp-server");

        expect(Option.isSome(entry)).toBe(true);
        if (Option.isSome(entry)) {
          expect(entry.value.type).toBe("github");
        }
      }),
    );

    it.effect("returns Option.none when mcp server not in lockfile", () =>
      Effect.gen(function* () {
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const entry = yield* ws.getLockedMcpServer("nonexistent");

        expect(Option.isNone(entry)).toBe(true);
      }),
    );
  });

  describe("setMcpServer", () => {
    it.effect("installs new mcp server: adds to settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.setMcpServer(makeSampleSetMcpServerArgs());

        // Verify settings on disk
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings["mcpServers"]).toBeDefined();
        expect(settings["mcpServers"]["my-mcp-server"]).toBe("github:acme/my-mcp-server");

        // Verify lockfile on disk
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.mcpServers).toHaveProperty("my-mcp-server");
        expect(
          property(recordEntry(expectDefined(lockfile.mcpServers), "my-mcp-server"), "type"),
        ).toBe("github");
      }),
    );

    it.effect("persists no receipt-history fields", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.setMcpServer(makeSampleSetMcpServerArgs());

        const lockfile = readLockfileFromDisk(projectDir);
        const entry = recordEntry(expectDefined(lockfile.mcpServers), "my-mcp-server");
        expect(entry).not.toHaveProperty("installedAt");
        expect(entry).not.toHaveProperty("updatedAt");
      }),
    );

    it.effect("updates existing mcp server: replaces in settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: { "my-mcp-server": "github:acme/my-mcp-server" },
        });
        writeLockfileTo(projectDir, {}, undefined, {
          "my-mcp-server": {
            type: "github",
            owner: "acme",
            repo: "my-mcp-server",
          },
        });

        const ws = yield* getService(defaultOptions);
        const updatedEntry: McpServerLockEntry = {
          ...makeSampleMcpServerLockEntry(),
          repo: "my-mcp-server-v2",
        };
        yield* ws.setMcpServer({
          name: "my-mcp-server",
          lockEntry: updatedEntry,
          versionRange: Option.none(),
        });

        // Verify settings updated
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings["mcpServers"]["my-mcp-server"]).toBe("github:acme/my-mcp-server-v2");

        // Verify lockfile updated
        const lockfile = readLockfileFromDisk(projectDir);
        expect(
          property(recordEntry(expectDefined(lockfile.mcpServers), "my-mcp-server"), "repo"),
        ).toBe("my-mcp-server-v2");
      }),
    );
  });

  describe("setMcpServerLock", () => {
    it.effect("writes to lockfile only, not settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.setMcpServerLock(makeSampleSetMcpServerArgs());

        // Settings should NOT have mcps
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings["mcpServers"]).toBeUndefined();

        // Lockfile should have the mcp server
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.mcpServers).toHaveProperty("my-mcp-server");
        expect(
          property(recordEntry(expectDefined(lockfile.mcpServers), "my-mcp-server"), "type"),
        ).toBe("github");
      }),
    );
  });

  describe("removeMcpServer", () => {
    it.effect("removes existing mcp server from both settings and lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: {
            "my-mcp-server": "github:acme/my-mcp-server",
            "other-server": "local:/tmp/other",
          },
        });
        writeLockfileTo(projectDir, {}, undefined, {
          "my-mcp-server": {
            type: "github",
            owner: "acme",
            repo: "my-mcp-server",
          },
          "other-server": {
            type: "local",
            path: "other",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeMcpServer("my-mcp-server");

        // Verify settings: my-mcp-server removed, other-server remains
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings["mcpServers"]).not.toHaveProperty("my-mcp-server");
        expect(settings["mcpServers"]).toHaveProperty("other-server");

        // Verify lockfile: my-mcp-server removed, other-server remains
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.mcpServers).not.toHaveProperty("my-mcp-server");
        expect(lockfile.mcpServers).toHaveProperty("other-server");
      }),
    );

    it.effect("no-op when mcp server does not exist", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: { "other-server": "local:/tmp/other" },
        });
        writeLockfileTo(projectDir, {}, undefined, {
          "other-server": {
            type: "local",
            path: "other",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeMcpServer("nonexistent");

        // Verify nothing changed
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings["mcpServers"]).toHaveProperty("other-server");
        expect(Object.keys(expectDefined(settings["mcpServers"]))).toHaveLength(1);

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.mcpServers).toHaveProperty("other-server");
        expect(Object.keys(expectDefined(lockfile.mcpServers))).toHaveLength(1);
      }),
    );

    it.effect("removes lockfile-only mcp server when not in settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
        });
        writeLockfileTo(projectDir, {}, undefined, {
          implicit: {
            type: "local",
            path: "implicit-mcp",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeMcpServer("implicit");

        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.mcpServers).toBeUndefined();

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.mcpServers).toBeUndefined();
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Granular removal methods (Phase 3)
  // ---------------------------------------------------------------------------

  describe("removeSkillLock", () => {
    it.effect("removes skill from lockfile only, not settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          skills: { "code-review": "github:acme/code-review" },
        });
        writeLockfileTo(projectDir, {
          "code-review": {
            type: "github",
            owner: "acme",
            repo: "code-review",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeSkillLock("code-review");

        // Settings should still have the skill
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills).toHaveProperty("code-review");

        // Lockfile should NOT have the skill
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.skills).not.toHaveProperty("code-review");
      }),
    );

    it.effect("no-op when skill not in lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.removeSkillLock("nonexistent");

        const lockfile = readLockfileFromDisk(projectDir);
        expect(Object.keys(lockfile.skills)).toHaveLength(0);
      }),
    );
  });

  describe("removeMcpServerSettings", () => {
    it.effect("removes mcp server from settings only, not lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: { "my-mcp": "github:acme/my-mcp" },
        });
        writeLockfileTo(projectDir, {}, undefined, {
          "my-mcp": {
            type: "github",
            owner: "acme",
            repo: "my-mcp",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeMcpServerSettings("my-mcp");

        // Settings should NOT have the mcp server
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.mcpServers).not.toHaveProperty("my-mcp");

        // Lockfile should still have the mcp server
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.mcpServers).toHaveProperty("my-mcp");
      }),
    );

    it.effect("no-op when mcp server not in settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.removeMcpServerSettings("nonexistent");

        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.mcpServers).toBeUndefined();
      }),
    );
  });

  describe("removeMcpServerLock", () => {
    it.effect("removes mcp server from lockfile only, not settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          mcpServers: { "my-mcp": "github:acme/my-mcp" },
        });
        writeLockfileTo(projectDir, {}, undefined, {
          "my-mcp": {
            type: "github",
            owner: "acme",
            repo: "my-mcp",
          },
        });

        const ws = yield* getService(defaultOptions);
        yield* ws.removeMcpServerLock("my-mcp");

        // Settings should still have the mcp server
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.mcpServers).toHaveProperty("my-mcp");

        // Lockfile should NOT have the mcp server
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.mcpServers).toBeUndefined();
      }),
    );

    it.effect("no-op when mcp server not in lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.removeMcpServerLock("nonexistent");

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.mcpServers).toBeUndefined();
      }),
    );
  });

  describe("removePackSettings", () => {
    it.effect("removes pack from settings only, not lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "starter-pack": "@acme/packs/starter-pack" },
        });
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              owner: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
              sourceName: "agentxm",

              publisherBindingId: "hbnd_test",
              resolvedSkills: {},
              resolvedMcpServers: {},
              resolvedSubagents: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        yield* ws.removePackSettings("starter-pack");

        // Settings should NOT have the pack
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.packs).not.toHaveProperty("starter-pack");

        // Lockfile should still have the pack
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.packs).toHaveProperty("starter-pack");
      }),
    );

    it.effect("no-op when pack not in settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.removePackSettings("nonexistent");

        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.packs).toBeUndefined();
      }),
    );
  });

  describe("removePackLock", () => {
    it.effect("removes pack from lockfile only, not settings", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, {
          agents: ["claude-code"],
          packs: { "starter-pack": "@acme/packs/starter-pack" },
        });
        writeLockfileTo(
          projectDir,
          {},
          {
            "starter-pack": {
              type: "registry",
              owner: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
              sourceName: "agentxm",

              publisherBindingId: "hbnd_test",
              resolvedSkills: {},
              resolvedMcpServers: {},
              resolvedSubagents: {},
            },
          },
        );

        const ws = yield* getService(defaultOptions);
        yield* ws.removePackLock("starter-pack");

        // Settings should still have the pack
        const settingsPath = path.join(projectDir, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.packs).toHaveProperty("starter-pack");

        // Lockfile should NOT have the pack
        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.packs).toBeUndefined();
      }),
    );

    it.effect("no-op when pack not in lockfile", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        yield* ws.removePackLock("nonexistent");

        const lockfile = readLockfileFromDisk(projectDir);
        expect(lockfile.packs).toBeUndefined();
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Pack dependency queries (Phase 3)
  // ---------------------------------------------------------------------------

  describe("isExtensionRequiredByInstalledPack", () => {
    const writeConfiguredPack = (dependencies: Readonly<Record<string, string>>) => {
      writeSettingsTo(projectDir, {
        agents: ["claude-code"],
        packs: { "starter-pack": "@acme/packs/starter-pack" },
      });
      const contentIdentity = writePackManifestTo(
        projectDir,
        "@acme",
        "starter-pack",
        dependencies,
      );
      writeAcceptedPackResolutionTo(projectDir, "@acme", "starter-pack", contentIdentity);
    };

    it.effect("uses the authoritative pack manifest for every leaf extension type", () =>
      Effect.gen(function* () {
        writeConfiguredPack({
          "@acme/skills/review": "^1.0.0",
          "@acme/mcps/browser": "^1.0.0",
          "@acme/subagents/planner": "^1.0.0",
          "@acme/rules/security": "^1.0.0",
          "@acme/hooks/preflight": "^1.0.0",
          "@acme/knowledge/handbook": "^1.0.0",
        });
        const ws = yield* getService(defaultOptions);
        const targets = [
          { type: "skill", name: "review" },
          { type: "mcp-server", name: "browser" },
          { type: "subagent", name: "planner" },
          { type: "rule", name: "security" },
          { type: "hook", name: "preflight" },
          { type: "knowledge", name: "handbook" },
        ] as const;

        for (const target of targets) {
          expect(yield* ws.isExtensionRequiredByInstalledPack(target)).toBe(true);
        }
        expect(
          yield* ws.isExtensionRequiredByInstalledPack({
            type: "knowledge",
            name: "scratch-notes",
          }),
        ).toBe(false);
      }),
    );

    it.effect("returns false when no packs are installed", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.isExtensionRequiredByInstalledPack({
          type: "skill",
          name: "some-skill",
        });

        expect(result).toBe(false);
      }),
    );

    it.effect("returns false for pack target type (packs don't depend on packs)", () =>
      Effect.gen(function* () {
        writeSettingsTo(projectDir, { agents: ["claude-code"] });
        writeLockfileTo(projectDir, {});

        const ws = yield* getService(defaultOptions);
        const result = yield* ws.isExtensionRequiredByInstalledPack({
          type: "pack",
          name: "some-pack",
          owner: handle("@acme"),
        });

        expect(result).toBe(false);
      }),
    );
  });
});
