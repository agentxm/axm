/**
 * Unit tests for the publish command handler.
 *
 * Tests the registry guard -> owner resolution -> validation -> plan build -> apply flow.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import {
  AuthClientTest,
  CredentialStoreTest,
  RegistryUrl,
} from "@agentxm/client-core/unstable/auth";
import { normalizeHandle } from "@agentxm/client-core/unstable/extensions";
import type { WorkspaceMutationsOptions } from "@agentxm/client-core/unstable/workspace";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import {
  expectNoOpPlanResult,
  expectPublishResult,
  getAppError,
  getErrorResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handlePublish, type PublishHandlerArgs } from "./publish.js";

const TESTUSER = normalizeHandle("@testuser");

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile + registry source. */
const initWorkspace = (
  axmDir: string,
  registryRoot: string,
  lockfileSkills: Record<string, unknown> = {},
  skills?: Record<string, unknown>,
  sources?: ReadonlyArray<{
    readonly name: string;
    readonly type: "registry";
    readonly location: URL;
  }>,
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.mkdirSync(registryRoot, { recursive: true });
  fs.writeFileSync(
    path.join(axmDir, "settings.json"),
    JSON.stringify({
      owner: "@test",
      agents: ["claude-code"],
      sources: sources ?? [
        { name: "local", type: "registry", location: new URL(`file://${registryRoot}`) },
      ],
      ...(skills && { skills }),
    }),
  );
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 3, skills: lockfileSkills }),
  );
};

/** Create an extension in .axm/extensions/ with a manifest at root and content in src/. */
const createManagedExtension = (
  tempDir: string,
  owner: string,
  name: string,
  manifest: Record<string, unknown>,
) => {
  const extDir = path.join(tempDir, ".axm", "extensions", owner, "skills", name);
  const srcDir = path.join(extDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  const manifestFields = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== "agents"),
  );
  const normalizedManifest = {
    ...manifestFields,
    owner,
    type: "skill",
    name,
    version: manifest["version"] ?? "0.0.1",
  };
  fs.writeFileSync(path.join(extDir, "skill.json"), JSON.stringify(normalizedManifest));
  fs.writeFileSync(path.join(srcDir, "SKILL.md"), `---\nname: "${name}"\n---\n\n# ${name}\n`);
  return extDir;
};

const defaultArgs = (
  extensions: ReadonlyArray<string>,
  overrides?: Partial<PublishHandlerArgs>,
): PublishHandlerArgs => ({
  extensions,
  registry: Option.none(),
  yes: false,
  force: false,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("publish.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (options?: {
    wsOverrides?: Partial<WorkspaceMutationsOptions>;
    authCredentials?: Parameters<typeof CredentialStoreTest>[1] | null;
    machine?: boolean;
    quiet?: boolean;
  }) => {
    const handlerTestContext = makeWorkspaceHandlerTestContext({
      ...(options?.quiet === undefined ? {} : { flags: { quiet: options.quiet } }),
      prompt: {
        confirmResponses: [true],
      },
      machine: options?.machine,
      wsOptions: options?.wsOverrides,
    });
    const authCredStoreLayer =
      options?.authCredentials === null
        ? CredentialStoreTest()
        : CredentialStoreTest(
            "restricted-file",
            options?.authCredentials ?? {
              version: 1,
              registries: {
                "https://registry.agentxm.ai": {
                  accounts: {
                    [TESTUSER]: {
                      access_token: "axm_ses_test",
                      refresh_token: "axm_ref_test",
                      expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
                      active: true,
                    },
                  },
                },
              },
            },
          );
    const BaseLayer = Layer.mergeAll(
      handlerTestContext.baseLayer,
      AuthClientTest(),
      authCredStoreLayer,
      Layer.succeed(RegistryUrl, "https://registry.agentxm.ai"),
    );
    const WsLayer = handlerTestContext.wsLayer;
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer);
    const provide = makeEffectProvide(FullLayer);

    return {
      provide,
      logs: handlerTestContext.logs,
      rendererState: handlerTestContext.rendererState,
    };
  };

  describe("publish with explicit registry", () => {
    it.effect("publishes an extension to a named registry", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "code-review", {
        name: "@test/skills/code-review",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(
            defaultArgs(["@test/skills/code-review"], { registry: Option.some("local") }),
          );

          expect(logs.success.some((m) => m.includes("Published"))).toBe(true);

          // Registry should have the published extension index
          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "skills",
            "code-review",
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(true);
        }),
      );
    });

    it.effect("rejects a manifest with deprecated agents targeting", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");
      const extDir = createManagedExtension(tempDir, "@test", "targeted-skill", {
        name: "@test/skills/targeted-skill",
        version: "1.0.0",
      });
      fs.writeFileSync(
        path.join(extDir, "skill.json"),
        JSON.stringify({
          owner: "@test",
          type: "skill",
          name: "targeted-skill",
          version: "1.0.0",
          agents: ["claude-code"],
        }),
      );

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const caught = yield* handlePublish(
            defaultArgs(["@test/skills/targeted-skill"], { registry: Option.some("local") }),
          ).pipe(Effect.flip);
          const error = getAppError(caught);

          expect(error.code).toBe("internal");
          expect(error.detail).toContain("Failed to publish");
        }),
      );
    });
  });

  describe("local registry auth bypass", () => {
    it.effect("publishes to a local registry without requiring remote auth", () => {
      const { provide, logs } = makeLayers({ authCredentials: null });
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "offline-skill", {
        name: "@test/skills/offline-skill",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(
            defaultArgs(["@test/skills/offline-skill"], { registry: Option.some("local") }),
          );

          expect(logs.success.some((m) => m.includes("Published"))).toBe(true);
          expect(
            fs.existsSync(
              path.join(
                registryRoot,
                "extensions",
                "@test",
                "skills",
                "offline-skill",
                "index.json",
              ),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("previews against a registry without requiring auth", () => {
      const { provide } = makeLayers({ authCredentials: null });
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "preview-skill", {
        name: "@test/skills/preview-skill",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(
            defaultArgs(["@test/skills/preview-skill"], {
              preview: true,
            }),
          );

          expect(
            fs.existsSync(
              path.join(registryRoot, "extensions", "@test", "skills", "preview-skill"),
            ),
          ).toBe(false);
        }),
      );
    });

    it.effect("blocks preview when the manifest version is already published", () => {
      const { provide } = makeLayers({ authCredentials: null });
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "preview-conflict", {
        name: "@test/skills/preview-conflict",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["@test/skills/preview-conflict"]));

          const error = yield* handlePublish(
            defaultArgs(["@test/skills/preview-conflict"], { preview: true }),
          ).pipe(Effect.flip);
          const appError = getAppError(error);

          expect(appError.code).toBe("conflict");
          expect(appError.detail).toContain("version 1.0.0 is already published");
          expect(appError.suggestions).toContainEqual({
            description: "Bump the manifest version.",
            cmd: "axm version @test/skills/preview-conflict patch",
          });
        }),
      );
    });

    it.effect("does not let --force overwrite an already published version", () => {
      const { provide } = makeLayers({ authCredentials: null });
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "force-conflict", {
        name: "@test/skills/force-conflict",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["@test/skills/force-conflict"]));

          const error = yield* handlePublish(
            defaultArgs(["@test/skills/force-conflict"], { force: true }),
          ).pipe(Effect.flip);
          const appError = getAppError(error);

          expect(appError.code).toBe("conflict");
          expect(appError.detail).toContain("Published versions are immutable");
        }),
      );
    });

    it.effect("lets --force publish an older unpublished version", () => {
      const { provide, logs } = makeLayers({ authCredentials: null });
      const registryRoot = path.join(tempDir, "registry");
      const extDir = createManagedExtension(tempDir, "@test", "force-older", {
        name: "@test/skills/force-older",
        version: "2.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["@test/skills/force-older"]));

          fs.writeFileSync(
            path.join(extDir, "skill.json"),
            JSON.stringify({
              owner: "@test",
              type: "skill",
              name: "force-older",
              version: "1.0.0",
            }),
          );

          yield* handlePublish(defaultArgs(["@test/skills/force-older"], { force: true }));

          expect(logs.success.some((m) => m.includes("Published"))).toBe(true);
        }),
      );
    });

    it.effect("emits publish plan JSON in machine mode without human success logs", () => {
      const { provide, logs, rendererState } = makeLayers({
        authCredentials: null,
        machine: true,
      });
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "machine-skill", {
        name: "@test/skills/machine-skill",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(
            defaultArgs(["@test/skills/machine-skill"], { registry: Option.some("local") }),
          );

          expect(logs.success).toEqual([]);
          const result = expectPublishResult(rendererState.results[0]?.data, {
            mode: "apply",
            count: 1,
          });
          expect(result).toMatchObject({
            results: [
              {
                owner: "@test",
                type: "skill",
                name: "machine-skill",
                version: "1.0.0",
                action: "publish",
                status: "success",
                message: "Published @test/skills/machine-skill@1.0.0",
              },
            ],
          });
          expect(rendererState.suggestions).toEqual([
            {
              description: "View published metadata",
              cmd: "axm view @test/skills/machine-skill",
            },
          ]);
        }),
      );
    });

    it.effect("skips an already published version when skipExisting is true", () => {
      const { provide, rendererState } = makeLayers({
        authCredentials: null,
        machine: true,
      });
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "skip-skill", {
        name: "@test/skills/skip-skill",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(
            defaultArgs(["@test/skills/skip-skill"], { registry: Option.some("local") }),
          );
          yield* handlePublish(
            defaultArgs(["@test/skills/skip-skill"], {
              registry: Option.some("local"),
              skipExisting: true,
            }),
          );

          const result = expectPublishResult(rendererState.results[1]?.data, {
            mode: "apply",
            count: 1,
          });
          expect(result).toMatchObject({
            results: [
              {
                owner: "@test",
                type: "skill",
                name: "skip-skill",
                version: "1.0.0",
                action: "skip",
                reason: "version_already_published",
                status: "success",
                message: "Skipped @test/skills/skip-skill@1.0.0: version already published",
              },
            ],
          });
        }),
      );
    });

    it.effect("suppresses publish suggestions in quiet mode", () => {
      const { provide, logs, rendererState } = makeLayers({
        authCredentials: null,
        quiet: true,
      });
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "quiet-skill", {
        name: "@test/skills/quiet-skill",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(
            defaultArgs(["@test/skills/quiet-skill"], { registry: Option.some("local") }),
          );

          expect(logs.success).toEqual(["Published @test/skills/quiet-skill@1.0.0"]);
          expect(rendererState.suggestions).toEqual([]);
        }),
      );
    });
  });

  describe("publish with default registry", () => {
    it.effect("publishes to the first configured registry when no --registry flag", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "my-skill", {
        name: "@test/skills/my-skill",
        version: "0.1.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["@test/skills/my-skill"]));

          expect(logs.success.some((m) => m.includes("Published"))).toBe(true);

          // Registry should have the published extension
          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "skills",
            "my-skill",
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(true);
        }),
      );
    });
  });

  describe("bare name owner resolution", () => {
    it.effect("resolves bare name using owner from settings entry", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      // Create extension under @test owner
      createManagedExtension(tempDir, "@test", "code-review", {
        name: "@test/skills/code-review",
        version: "0.1.0",
        agents: ["claude-code"],
      });

      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {},
        {
          "code-review": "@test/skills/code-review",
        },
      );

      return provide(
        Effect.gen(function* () {
          // Pass bare name without owner
          yield* handlePublish(defaultArgs(["code-review"]));

          expect(logs.success.some((m) => m.includes("Published"))).toBe(true);

          // Should have published under @test owner
          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "skills",
            "code-review",
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(true);
        }),
      );
    });
  });

  describe("missing manifest error", () => {
    it.effect("fails when extension directory has no manifest", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      // Create extension directory without manifest
      const srcDir = path.join(
        tempDir,
        ".axm",
        "extensions",
        "@test",
        "skills",
        "no-manifest",
        "src",
      );
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "SKILL.md"), "# No manifest\n");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handlePublish(defaultArgs(["@test/skills/no-manifest"])).pipe(
            Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, message: e.detail })),
          );
          expect(getErrorResult(result).message).toContain("Missing manifest");
        }),
      );
    });
  });

  describe("non-installed skill error", () => {
    it.effect("fails when extension directory does not exist in .axm/extensions/", () => {
      const { provide, rendererState } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handlePublish(defaultArgs(["@test/skills/nonexistent"])).pipe(
            Effect.catchTag("AppError", (e) =>
              Effect.succeed({
                error: true,
                message: e.detail,
                guidance: (e.suggestions ?? [])
                  .map((suggestion) =>
                    [suggestion.description, suggestion.cmd].filter(Boolean).join(" · "),
                  )
                  .join("\n"),
              }),
            ),
          );
          const errorResult = getErrorResult(result);
          expect(errorResult.message).toContain("Managed extension not found");
          expect(errorResult.guidance).toContain("Scaffold a managed skill");
          expect(errorResult.guidance).toContain("axm skills new");
          expect(rendererState.spinnerMessages).toEqual([]);
        }),
      );
    });
  });

  describe("glob expansion", () => {
    it.effect("expands glob pattern against installed skill names", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "effect-basics", {
        name: "@test/skills/effect-basics",
        version: "1.0.0",
        agents: ["claude-code"],
      });
      createManagedExtension(tempDir, "@test", "effect-advanced", {
        name: "@test/skills/effect-advanced",
        version: "1.0.0",
        agents: ["claude-code"],
      });
      createManagedExtension(tempDir, "@test", "commit", {
        name: "@test/skills/commit",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {},
        {
          "effect-basics": "@test/skills/effect-basics",
          "effect-advanced": "@test/skills/effect-advanced",
          commit: "@test/skills/commit",
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["effect-*"]));

          expect(logs.success.some((m) => m.includes("Published"))).toBe(true);

          // Both effect- skills should be published
          expect(
            fs.existsSync(
              path.join(
                registryRoot,
                "extensions",
                "@test",
                "skills",
                "effect-basics",
                "index.json",
              ),
            ),
          ).toBe(true);
          expect(
            fs.existsSync(
              path.join(
                registryRoot,
                "extensions",
                "@test",
                "skills",
                "effect-advanced",
                "index.json",
              ),
            ),
          ).toBe(true);
          // commit should NOT be published
          expect(
            fs.existsSync(
              path.join(registryRoot, "extensions", "@test", "skills", "commit", "index.json"),
            ),
          ).toBe(false);
        }),
      );
    });

    it.effect("literal names pass through without glob expansion", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "commit", {
        name: "@test/skills/commit",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {},
        {
          commit: "@test/skills/commit",
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["commit"]));

          expect(logs.success.some((m) => m.includes("Published"))).toBe(true);
          expect(
            fs.existsSync(
              path.join(registryRoot, "extensions", "@test", "skills", "commit", "index.json"),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("mixed glob and literal deduplicates", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "effect-basics", {
        name: "@test/skills/effect-basics",
        version: "1.0.0",
        agents: ["claude-code"],
      });
      createManagedExtension(tempDir, "@test", "commit", {
        name: "@test/skills/commit",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {},
        {
          "effect-basics": "@test/skills/effect-basics",
          commit: "@test/skills/commit",
        },
      );

      return provide(
        Effect.gen(function* () {
          // effect-basics matches both the glob and the literal
          yield* handlePublish(defaultArgs(["effect-*", "effect-basics", "commit"]));

          expect(logs.success.some((m) => m.includes("Published"))).toBe(true);
          expect(
            fs.existsSync(
              path.join(
                registryRoot,
                "extensions",
                "@test",
                "skills",
                "effect-basics",
                "index.json",
              ),
            ),
          ).toBe(true);
          expect(
            fs.existsSync(
              path.join(registryRoot, "extensions", "@test", "skills", "commit", "index.json"),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("glob matching zero skills warns and exits cleanly", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {},
        {
          commit: "@test/skills/commit",
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["nonexistent-*"]));

          expect(logs.warn).toEqual([]);
          expect(logs.success.some((m) => m.includes("No skills matched"))).toBe(true);
          expect(logs.success.some((m) => m.includes("No skills published"))).toBe(true);
        }),
      );
    });

    it.effect("glob matching zero skills emits JSON no-op in machine mode", () => {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      const registryRoot = path.join(tempDir, "registry");

      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {},
        {
          commit: "@test/skills/commit",
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["nonexistent-*"]));

          expect(logs.success).toEqual([]);
          expectNoOpPlanResult(rendererState.results[0]?.data, {
            planName: "Publish skill",
            message: "No skills matched. No skills published.",
          });
        }),
      );
    });

    it.effect("FQN input bypasses glob expansion", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "code-review", {
        name: "@test/skills/code-review",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["@test/skills/code-review"]));

          expect(logs.success.some((m) => m.includes("Published"))).toBe(true);
          expect(
            fs.existsSync(
              path.join(registryRoot, "extensions", "@test", "skills", "code-review", "index.json"),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("all configured skills included in glob matches", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "effect-basics", {
        name: "@test/skills/effect-basics",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {},
        {
          "effect-basics": { source: "@test/skills/effect-basics" },
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["effect-*"]));

          expect(logs.success.some((m) => m.includes("Published"))).toBe(true);
          // Only configured skill should be published
          expect(
            fs.existsSync(
              path.join(
                registryRoot,
                "extensions",
                "@test",
                "skills",
                "effect-basics",
                "index.json",
              ),
            ),
          ).toBe(true);
          // Only configured skills with sources are in installed set
        }),
      );
    });
  });

  describe("completion status", () => {
    it.effect("fails when plan contains failed publish steps", () => {
      const { provide, logs } = makeLayers({
        authCredentials: {
          version: 1,
          registries: {
            "http://127.0.0.1:1": {
              accounts: {
                [TESTUSER]: {
                  access_token: "axm_ses_test",
                  refresh_token: "axm_ref_test",
                  expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
                  active: true,
                },
              },
            },
          },
        },
      });
      const registryRoot = path.join(tempDir, "registry");

      createManagedExtension(tempDir, "@test", "effect-basics", {
        name: "@test/skills/effect-basics",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot, {}, undefined, [
        { name: "local-registry", type: "registry", location: new URL("http://127.0.0.1:1/") },
      ]);

      return provide(
        Effect.gen(function* () {
          const result = yield* handlePublish(
            defaultArgs(["@test/skills/effect-basics"], {
              registry: Option.some("local-registry"),
              force: true,
            }),
          ).pipe(
            Effect.as({ error: false as const }),
            Effect.catchTag("AppError", (e) =>
              Effect.succeed({
                error: true as const,
                code: e.code,
                message: e.detail,
                cause: e.cause,
              }),
            ),
          );

          expect(result).toMatchObject({ error: true, code: "network" });
          if (result.error) {
            expect(result.message).toContain("remote registry discovery");
          }
          expect(logs.warn.some((m) => m.includes("Done with errors"))).toBe(false);
          expect(logs.success.some((m) => m.includes("Done"))).toBe(false);
        }),
      );
    });
  });
});
