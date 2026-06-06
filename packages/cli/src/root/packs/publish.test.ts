/**
 * Unit tests for the packs publish command handler.
 *
 * Tests the registry guard -> owner resolution -> validation -> plan build -> apply flow.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
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
  expectAppliedPlanResult,
  getErrorResult,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handlePublishPack, type PublishPackHandlerArgs } from "./publish.js";

const TESTUSER = normalizeHandle("@testuser");

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile + registry source. */
const initWorkspace = (
  axmDir: string,
  registryRoot: string,
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
    }),
  );
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: {} }),
  );
};

/** Create a pack in .axm/extensions/ with a manifest. */
const createManagedPack = (
  tempDir: string,
  owner: string,
  name: string,
  manifest: Record<string, unknown>,
) => {
  const packDir = path.join(tempDir, ".axm", "extensions", owner, "packs", name);
  fs.mkdirSync(packDir, { recursive: true });
  const normalizedManifest = {
    ...manifest,
    owner,
    type: "pack",
    name,
    version: manifest["version"] ?? "0.0.1",
  };
  fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify(normalizedManifest));
  return packDir;
};

/** Create an extension (skill, command, mcp-server) in .axm/extensions/. */
const createManagedExtension = (
  tempDir: string,
  owner: string,
  type: "skills" | "commands" | "mcps",
  name: string,
  manifest: Record<string, unknown>,
) => {
  const manifestFilename =
    type === "skills" ? "skill.json" : type === "commands" ? "command.json" : "mcp-server.json";
  const extDir = path.join(tempDir, ".axm", "extensions", owner, type, name);
  const srcDir = path.join(extDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  const normalizedManifest = {
    ...manifest,
    owner,
    type: type === "skills" ? "skill" : type === "commands" ? "command" : "mcp-server",
    name,
    version: manifest["version"] ?? "0.0.1",
  };
  fs.writeFileSync(path.join(extDir, manifestFilename), JSON.stringify(normalizedManifest));
  if (type === "skills") {
    fs.writeFileSync(path.join(srcDir, "SKILL.md"), `---\nname: "${name}"\n---\n\n# ${name}\n`);
  }
  if (type === "commands") {
    fs.writeFileSync(
      path.join(srcDir, `${name}.md`),
      `---\nname: "${name}"\ndescription: "A test command"\n---\n\n# ${name}\n`,
    );
  }
  return extDir;
};

/** Create a managed subagent (manifest + src/<name>.md with name frontmatter). */
const createManagedSubagent = (
  tempDir: string,
  owner: string,
  name: string,
  manifest: Record<string, unknown>,
) => {
  const extDir = path.join(tempDir, ".axm", "extensions", owner, "subagents", name);
  const srcDir = path.join(extDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  const normalizedManifest = {
    ...manifest,
    owner,
    type: "subagent",
    name,
    version: manifest["version"] ?? "0.0.1",
  };
  fs.writeFileSync(path.join(extDir, "subagent.json"), JSON.stringify(normalizedManifest));
  fs.writeFileSync(path.join(srcDir, `${name}.md`), `---\nname: ${name}\n---\n\nBody.\n`);
  return extDir;
};

const defaultArgs = (
  pack: string,
  overrides: Partial<PublishPackHandlerArgs> = {},
): PublishPackHandlerArgs => ({
  pack,
  registry: Option.none(),
  includeDependencies: false,
  yes: false,
  force: false,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("packs publish.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "packs-publish-handler-test-"));
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
                      expires_at: "2099-01-01T00:00:00Z",
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

  describe("successful publish", () => {
    it.effect("publishes a pack to a named registry", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "frontend-tools", {
        name: "@test/packs/frontend-tools",
        version: "1.0.0",
        dependencies: { "@test/skills/code-review": "^1.0.0" },
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(
            defaultArgs("@test/packs/frontend-tools", { registry: Option.some("local") }),
          );

          expect(logs.success.some((m) => m.includes("Published"))).toBe(true);

          // Registry should have the published pack index
          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "packs",
            "frontend-tools",
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(true);

          // Verify index content
          const indexContent = JSON.parse(fs.readFileSync(registryIndexPath, "utf-8"));
          expect(indexContent.name).toBe("frontend-tools");
          expect(indexContent.owner).toBe("@test");
          expect(indexContent.type).toBe("pack");
          expect(indexContent.versions).toHaveLength(1);
          expect(indexContent.versions[0].version).toBe("1.0.0");
        }),
      );
    });
  });

  describe("local registry auth bypass", () => {
    it.effect("publishes to a local registry without requiring remote auth", () => {
      const { provide, logs } = makeLayers({ authCredentials: null });
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "offline-pack", {
        name: "@test/packs/offline-pack",
        version: "1.0.0",
        dependencies: { "@test/skills/example": "^1.0.0" },
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(
            defaultArgs("@test/packs/offline-pack", { registry: Option.some("local") }),
          );

          expect(logs.success.some((m) => m.includes("Published"))).toBe(true);
          expect(
            fs.existsSync(
              path.join(registryRoot, "extensions", "@test", "packs", "offline-pack", "index.json"),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("emits publish plan JSON in machine mode without human success logs", () => {
      const { provide, logs, rendererState } = makeLayers({
        authCredentials: null,
        machine: true,
      });
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "machine-pack", {
        name: "@test/packs/machine-pack",
        version: "1.0.0",
        dependencies: { "@test/skills/example": "^1.0.0" },
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(
            defaultArgs("@test/packs/machine-pack", { registry: Option.some("local") }),
          );

          expect(logs.success).toEqual([]);
          const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
            planName: "Publish pack",
          });
          expect(result).toMatchObject({
            steps: [
              {
                label: "Publish @test/packs/machine-pack",
                status: "applied",
                message: "Published @test/packs/machine-pack@1.0.0",
              },
            ],
          });
          expect(rendererState.suggestions).toEqual([
            {
              description: "View published metadata",
              cmd: "axm view @test/packs/machine-pack",
            },
          ]);
        }),
      );
    });

    it.effect("suppresses publish suggestions in quiet mode", () => {
      const { provide, logs, rendererState } = makeLayers({
        authCredentials: null,
        quiet: true,
      });
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "quiet-pack", {
        name: "@test/packs/quiet-pack",
        version: "1.0.0",
        dependencies: { "@test/skills/example": "^1.0.0" },
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(
            defaultArgs("@test/packs/quiet-pack", { registry: Option.some("local") }),
          );

          expect(logs.success).toEqual(["Published @test/packs/quiet-pack@1.0.0"]);
          expect(rendererState.suggestions).toEqual([]);
        }),
      );
    });

    it.effect("previews against a registry without requiring auth", () => {
      const { provide } = makeLayers({ authCredentials: null });
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "preview-pack", {
        name: "@test/packs/preview-pack",
        version: "1.0.0",
        dependencies: {},
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(
            defaultArgs("@test/packs/preview-pack", {
              force: true,
              preview: true,
            }),
          );

          expect(
            fs.existsSync(path.join(registryRoot, "extensions", "@test", "packs", "preview-pack")),
          ).toBe(false);
        }),
      );
    });
  });

  describe("publish with default registry", () => {
    it.effect("publishes to the first configured registry when no --registry flag", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "my-pack", {
        name: "@test/packs/my-pack",
        version: "0.1.0",
        dependencies: { "@test/skills/example": "^1.0.0" },
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(defaultArgs("@test/packs/my-pack"));

          expect(logs.success.some((m) => m.includes("Published"))).toBe(true);

          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "packs",
            "my-pack",
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(true);
        }),
      );
    });
  });

  describe("missing manifest error", () => {
    it.effect("fails when pack directory has no manifest", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      // Create pack directory without manifest
      const packDir = path.join(tempDir, ".axm", "extensions", "@test", "packs", "no-manifest");
      fs.mkdirSync(packDir, { recursive: true });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handlePublishPack(defaultArgs("@test/packs/no-manifest")).pipe(
            Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, message: e.detail })),
          );
          expect(getErrorResult(result).message).toContain("Missing manifest");
        }),
      );
    });
  });

  describe("idempotent publish", () => {
    it.effect("fails before publishing the same version with same content", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "idempotent-pack", {
        name: "@test/packs/idempotent-pack",
        version: "1.0.0",
        dependencies: { "@test/skills/example": "^1.0.0" },
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          // First publish
          yield* handlePublishPack(
            defaultArgs("@test/packs/idempotent-pack", { registry: Option.some("local") }),
          );

          const error = yield* handlePublishPack(
            defaultArgs("@test/packs/idempotent-pack", { registry: Option.some("local") }),
          ).pipe(Effect.flip);
          const appError = getAppError(error);

          expect(appError.code).toBe("conflict");
          expect(appError.detail).toContain("version 1.0.0 is already published");
        }),
      );
    });
  });

  describe("dependency flattening", () => {
    it.effect("flattens skills-only manifest into VersionEntry.dependencies", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "skills-pack", {
        name: "@test/packs/skills-pack",
        version: "1.0.0",
        dependencies: {
          "@acme/skills/code-review": "^1.0.0",
          "@acme/skills/linter": "~2.0.0",
        },
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(
            defaultArgs("@test/packs/skills-pack", { registry: Option.some("local") }),
          );

          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "packs",
            "skills-pack",
            "index.json",
          );
          const indexContent = JSON.parse(fs.readFileSync(registryIndexPath, "utf-8"));
          expect(indexContent.versions[0].dependencies).toEqual({
            "@acme/skills/code-review": "^1.0.0",
            "@acme/skills/linter": "~2.0.0",
          });
        }),
      );
    });

    it.effect("flattens mixed types into VersionEntry.dependencies", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "mixed-pack", {
        name: "@test/packs/mixed-pack",
        version: "2.0.0",
        dependencies: {
          "@acme/skills/code-review": "^1.0.0",
          "@acme/commands/formatter": "^1.5.0",
          "@acme/mcps/db": "*",
        },
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(
            defaultArgs("@test/packs/mixed-pack", { registry: Option.some("local") }),
          );

          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "packs",
            "mixed-pack",
            "index.json",
          );
          const indexContent = JSON.parse(fs.readFileSync(registryIndexPath, "utf-8"));
          expect(indexContent.versions[0].dependencies).toEqual({
            "@acme/skills/code-review": "^1.0.0",
            "@acme/commands/formatter": "^1.5.0",
            "@acme/mcps/db": "*",
          });
        }),
      );
    });

    it.effect("rejects publishing with no dependencies when manifest has none", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "empty-pack", {
        name: "@test/packs/empty-pack",
        version: "1.0.0",
        dependencies: {},
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const error = yield* handlePublishPack(
            defaultArgs("@test/packs/empty-pack", { registry: Option.some("local") }),
          ).pipe(Effect.flip);

          expect(getAppError(error).detail).toContain("at least one dependency");
        }),
      );
    });
  });

  describe("non-installed pack error", () => {
    it.effect("fails when pack directory does not exist in .axm/extensions/", () => {
      const { provide, rendererState } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handlePublishPack(defaultArgs("@test/packs/nonexistent")).pipe(
            Effect.catchTag("AppError", (e) =>
              Effect.succeed({
                error: true,
                message: e.detail,
                guidance: (e.suggestions ?? [])
                  .map((suggestion) => `${suggestion.description} · ${suggestion.cmd ?? ""}`)
                  .join("\n"),
              }),
            ),
          );
          const errorResult = getErrorResult(result);
          expect(errorResult.message).toContain("Managed pack not found");
          expect(errorResult.guidance).toContain(
            "Only managed packs in `.axm/extensions/` can be published. · axm packs new <name>",
          );
          expect(rendererState.spinnerMessages).toEqual([]);
        }),
      );
    });
  });

  describe("include-dependencies flag", () => {
    it.effect(
      "builds single-step plan when includeDependencies is false (existing behavior)",
      () => {
        const { provide, logs } = makeLayers();
        const registryRoot = path.join(tempDir, "registry");

        createManagedPack(tempDir, "@test", "dep-pack", {
          name: "@test/packs/dep-pack",
          version: "1.0.0",
          dependencies: { "@test/skills/code-review": "^1.0.0" },
        });

        // Create the dependency extension locally
        createManagedExtension(tempDir, "@test", "skills", "code-review", {
          name: "@test/skills/code-review",
          version: "1.0.0",
        });

        initWorkspace(path.join(tempDir, ".axm"), registryRoot);

        return provide(
          Effect.gen(function* () {
            yield* handlePublishPack(
              defaultArgs("@test/packs/dep-pack", {
                registry: Option.some("local"),
                includeDependencies: false,
              }),
            );

            expect(logs.success.some((m) => m.includes("Published"))).toBe(true);

            // Only the pack should be published, not the dependency
            const skillIndexPath = path.join(
              registryRoot,
              "extensions",
              "@test",
              "skills",
              "code-review",
              "index.json",
            );
            expect(fs.existsSync(skillIndexPath)).toBe(false);
          }),
        );
      },
    );

    it.effect("publishes local dependencies and pack when includeDependencies is true", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "full-pack", {
        name: "@test/packs/full-pack",
        version: "1.0.0",
        dependencies: {
          "@test/skills/linter": "^1.0.0",
          "@test/commands/formatter": "^2.0.0",
        },
      });

      // Create local extensions
      createManagedExtension(tempDir, "@test", "skills", "linter", {
        name: "@test/skills/linter",
        version: "1.0.0",
      });
      createManagedExtension(tempDir, "@test", "commands", "formatter", {
        name: "@test/commands/formatter",
        version: "2.0.0",
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(
            defaultArgs("@test/packs/full-pack", {
              registry: Option.some("local"),
              includeDependencies: true,
            }),
          );

          expect(logs.success.some((m) => m.includes("Published"))).toBe(true);

          // Both dependencies should be published
          const skillIndex = path.join(
            registryRoot,
            "extensions",
            "@test",
            "skills",
            "linter",
            "index.json",
          );
          const commandIndex = path.join(
            registryRoot,
            "extensions",
            "@test",
            "commands",
            "formatter",
            "index.json",
          );
          expect(fs.existsSync(skillIndex)).toBe(true);
          expect(fs.existsSync(commandIndex)).toBe(true);

          // Pack should also be published
          const packIndex = path.join(
            registryRoot,
            "extensions",
            "@test",
            "packs",
            "full-pack",
            "index.json",
          );
          expect(fs.existsSync(packIndex)).toBe(true);
        }),
      );
    });

    it.effect("skips non-local dependencies as unchanged plan steps", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "mixed-deps-pack", {
        name: "@test/packs/mixed-deps-pack",
        version: "1.0.0",
        dependencies: {
          "@test/skills/local-skill": "^1.0.0",
          "@external/skills/remote-skill": "^1.0.0",
        },
      });

      // Only create the local dependency, not the external one
      createManagedExtension(tempDir, "@test", "skills", "local-skill", {
        name: "@test/skills/local-skill",
        version: "1.0.0",
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(
            defaultArgs("@test/packs/mixed-deps-pack", {
              registry: Option.some("local"),
              includeDependencies: true,
            }),
          );

          expect(logs.success.some((m) => m.includes("Published"))).toBe(true);

          // Local dependency should be published
          const localSkillIndex = path.join(
            registryRoot,
            "extensions",
            "@test",
            "skills",
            "local-skill",
            "index.json",
          );
          expect(fs.existsSync(localSkillIndex)).toBe(true);

          expect(logs.warn).toEqual([]);

          // Pack should still be published
          const packIndex = path.join(
            registryRoot,
            "extensions",
            "@test",
            "packs",
            "mixed-deps-pack",
            "index.json",
          );
          expect(fs.existsSync(packIndex)).toBe(true);
        }),
      );
    });

    it.effect("emits skipped non-local dependencies as unchanged JSON plan steps", () => {
      const { provide, logs, rendererState } = makeLayers({
        authCredentials: null,
        machine: true,
      });
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "mixed-machine-deps-pack", {
        name: "@test/packs/mixed-machine-deps-pack",
        version: "1.0.0",
        dependencies: {
          "@test/skills/local-machine-skill": "^1.0.0",
          "@external/skills/remote-machine-skill": "^1.0.0",
        },
      });

      createManagedExtension(tempDir, "@test", "skills", "local-machine-skill", {
        name: "@test/skills/local-machine-skill",
        version: "1.0.0",
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(
            defaultArgs("@test/packs/mixed-machine-deps-pack", {
              registry: Option.some("local"),
              includeDependencies: true,
            }),
          );

          expect(logs.warn).toEqual([]);
          expect(logs.success).toEqual([]);
          const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
            planName: "Publish pack",
            totalSteps: 3,
            appliedCount: 2,
          });
          expect(result).toMatchObject({
            steps: [
              {
                label: "Publish dependency @test/skills/local-machine-skill",
                status: "applied",
                message: "Published @test/skills/local-machine-skill@1.0.0",
              },
              {
                label: "Skip @external/skills/remote-machine-skill",
                status: "unchanged",
                message: "Skipped non-local dependency: @external/skills/remote-machine-skill",
                artifact: {
                  scope: "project",
                  change: "unchanged",
                },
              },
              {
                label: "Publish @test/packs/mixed-machine-deps-pack",
                status: "applied",
                message: "Published @test/packs/mixed-machine-deps-pack@1.0.0",
              },
            ],
          });
        }),
      );
    });

    it.effect("publishes local subagent dependency when includeDependencies is true", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "agent-pack", {
        name: "@test/packs/agent-pack",
        version: "1.0.0",
        dependencies: { "@test/subagents/reviewer": "^1.0.0" },
      });

      createManagedSubagent(tempDir, "@test", "reviewer", {
        name: "@test/subagents/reviewer",
        version: "1.0.0",
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(
            defaultArgs("@test/packs/agent-pack", {
              registry: Option.some("local"),
              includeDependencies: true,
            }),
          );

          expect(logs.success.some((m) => m.includes("Published"))).toBe(true);

          const subagentIndex = path.join(
            registryRoot,
            "extensions",
            "@test",
            "subagents",
            "reviewer",
            "index.json",
          );
          expect(fs.existsSync(subagentIndex)).toBe(true);

          const packIndex = path.join(
            registryRoot,
            "extensions",
            "@test",
            "packs",
            "agent-pack",
            "index.json",
          );
          expect(fs.existsSync(packIndex)).toBe(true);
        }),
      );
    });

    it.effect("fails when pack has no dependencies and includeDependencies is true", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "no-deps-pack", {
        name: "@test/packs/no-deps-pack",
        version: "1.0.0",
        dependencies: {},
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const error = yield* handlePublishPack(
            defaultArgs("@test/packs/no-deps-pack", {
              registry: Option.some("local"),
              includeDependencies: true,
            }),
          ).pipe(Effect.flip);

          expect(getAppError(error).detail).toContain("at least one dependency");
          expect(logs.success.some((m) => m.includes("Done"))).toBe(false);
        }),
      );
    });
  });
});
