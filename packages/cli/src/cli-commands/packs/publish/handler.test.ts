/**
 * Unit tests for the packs publish command handler.
 *
 * Tests the registry guard -> profile resolution -> validation -> plan build -> apply flow.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { makeOutputTestLayer } from "../../../output/index.js";
import { makeActivityTestLayer } from "../../../activity/index.js";
import { makeInputTestLayer } from "../../../input/index.js";
import { CliFlagsTest } from "../../../cli-flags/index.js";
import { CliEnvConfig } from "../../../config/index.js";
import { TelemetryClientTest } from "../../../telemetry/index.js";
import { AuthClientTest } from "../../../auth/auth-client.js";
import { CredentialStoreTest } from "../../../auth/credential-store.js";
import { RegistryUrl } from "../../../auth/auth-middleware.js";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "../../../workspace/index.js";
import { SourceHostProvidersLive } from "../../../sources/index.js";
import { handlePublishPack, type PublishPackHandlerArgs } from "./handler.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile + registry source. */
const initWorkspace = (axmDir: string, registryRoot: string) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.mkdirSync(registryRoot, { recursive: true });
  fs.writeFileSync(
    path.join(axmDir, "settings.json"),
    JSON.stringify({
      profile: "@test",
      agents: ["claude-code"],
      sources: [{ name: "local", type: "registry", location: new URL(`file://${registryRoot}`) }],
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
  profile: string,
  name: string,
  manifest: Record<string, unknown>,
) => {
  const packDir = path.join(tempDir, ".axm", "extensions", profile, "packs", name);
  fs.mkdirSync(packDir, { recursive: true });
  const normalizedManifest = {
    ...manifest,
    profile,
    type: "pack",
    name,
    version: manifest["version"] ?? "0.0.1",
  };
  fs.writeFileSync(path.join(packDir, "axm-pack.json"), JSON.stringify(normalizedManifest));
  return packDir;
};

/** Create an extension (skill, command, mcp-server) in .axm/extensions/. */
const createManagedExtension = (
  tempDir: string,
  profile: string,
  type: "skills" | "commands" | "mcp-servers",
  name: string,
  manifest: Record<string, unknown>,
) => {
  const manifestFilename =
    type === "skills"
      ? "axm-skill.json"
      : type === "commands"
        ? "axm-command.json"
        : "axm-mcp-server.json";
  const extDir = path.join(tempDir, ".axm", "extensions", profile, type, name);
  fs.mkdirSync(extDir, { recursive: true });
  const normalizedManifest = {
    ...manifest,
    profile,
    type: type === "skills" ? "skill" : type === "commands" ? "command" : "mcp-server",
    name,
    version: manifest["version"] ?? "0.0.1",
  };
  fs.writeFileSync(path.join(extDir, manifestFilename), JSON.stringify(normalizedManifest));
  return extDir;
};

const defaultArgs = (
  pack: string,
  overrides: Partial<PublishPackHandlerArgs> = {},
): PublishPackHandlerArgs => ({
  pack,
  registry: Option.none(),
  includeDependencies: false,
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

  const makeLayers = (wsOverrides?: Partial<WorkspaceContextOptions>) => {
    const [outputLayer, mockLog] = makeOutputTestLayer();
    const [activityLayer, mockSpinner] = makeActivityTestLayer();
    const [inputLayer] = makeInputTestLayer({
      methodBehaviors: {
        confirm: { type: "return", value: true },
        select: { type: "select", index: 0 },
        multiselect: { type: "multiselect", indices: [] },
      },
    });
    const authCredStoreLayer = CredentialStoreTest("encrypted-file", {
      version: 1,
      registries: {
        "https://registry.agentxm.ai": {
          accounts: {
            testuser: {
              access_token: "axm_ses_test",
              refresh_token: "axm_ref_test",
              expires_at: "2099-01-01T00:00:00Z",
              active: true,
            },
          },
        },
      },
    });
    const BaseLayer = Layer.mergeAll(
      NodeServices.layer,
      outputLayer,
      activityLayer,
      inputLayer,
      CliFlagsTest(),
      TelemetryClientTest,
      AuthClientTest(),
      authCredStoreLayer,
      Layer.succeed(RegistryUrl, "https://registry.agentxm.ai"),
      CliEnvConfig.testDefaults,
    );
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
      agents: Option.none(),
      ...wsOverrides,
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog, mockSpinner };
  };

  describe("successful publish", () => {
    it.effect("publishes a pack to a named registry", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "frontend-tools", {
        name: "@test/packs/frontend-tools",
        version: "1.0.0",
        skills: { "@test/skills/code-review": "^1.0.0" },
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(
            defaultArgs("@test/packs/frontend-tools", { registry: Option.some("local") }),
          );

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

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
          expect(indexContent.profile).toBe("@test");
          expect(indexContent.type).toBe("pack");
          expect(indexContent.versions).toHaveLength(1);
          expect(indexContent.versions[0].version).toBe("1.0.0");
        }),
      );
    });
  });

  describe("publish with default registry", () => {
    it.effect("publishes to the first configured registry when no --registry flag", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "my-pack", {
        name: "@test/packs/my-pack",
        version: "0.1.0",
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(defaultArgs("@test/packs/my-pack"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

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
            Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, what: e.what })),
          );
          expect(result).toHaveProperty("error", true);
          expect((result as { what: string }).what).toContain("Missing manifest");
        }),
      );
    });
  });

  describe("idempotent publish", () => {
    it.effect("succeeds when publishing the same version with same content", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "idempotent-pack", {
        name: "@test/packs/idempotent-pack",
        version: "1.0.0",
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          // First publish
          yield* handlePublishPack(
            defaultArgs("@test/packs/idempotent-pack", { registry: Option.some("local") }),
          );

          // Second publish (same content, same version)
          yield* handlePublishPack(
            defaultArgs("@test/packs/idempotent-pack", { registry: Option.some("local") }),
          );

          expect(mockLog.logs.success.filter((m) => m.includes("Done"))).toHaveLength(2);
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
        skills: {
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
        skills: { "@acme/skills/code-review": "^1.0.0" },
        commands: { "@acme/commands/formatter": "^1.5.0" },
        "mcp-servers": { "@acme/mcp-servers/db": "*" },
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
            "@acme/mcp-servers/db": "*",
          });
        }),
      );
    });

    it.effect("publishes with no dependencies when manifest has none", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "empty-pack", {
        name: "@test/packs/empty-pack",
        version: "1.0.0",
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublishPack(
            defaultArgs("@test/packs/empty-pack", { registry: Option.some("local") }),
          );

          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "packs",
            "empty-pack",
            "index.json",
          );
          const indexContent = JSON.parse(fs.readFileSync(registryIndexPath, "utf-8"));
          // No dependencies field or empty
          const deps = indexContent.versions[0].dependencies;
          expect(deps === undefined || Object.keys(deps).length === 0).toBe(true);
        }),
      );
    });
  });

  describe("non-installed pack error", () => {
    it.effect("fails when pack directory does not exist in .axm/extensions/", () => {
      const { provide, mockSpinner } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handlePublishPack(defaultArgs("@test/packs/nonexistent")).pipe(
            Effect.catchTag("AppError", (e) =>
              Effect.succeed({
                error: true,
                what: e.what,
                howToFix: Option.getOrElse(e.howToFix, () => ""),
              }),
            ),
          );
          expect(result).toHaveProperty("error", true);
          expect((result as { what: string }).what).toContain("Managed pack not found");
          expect((result as { howToFix: string }).howToFix).toContain("axm packs new");
          expect(mockSpinner.starts).toContain("Validating pack...");
          expect(mockSpinner.stops).toContain("Failed");
        }),
      );
    });
  });

  describe("include-dependencies flag", () => {
    it.effect(
      "builds single-step plan when includeDependencies is false (existing behavior)",
      () => {
        const { provide, mockLog } = makeLayers();
        const registryRoot = path.join(tempDir, "registry");

        createManagedPack(tempDir, "@test", "dep-pack", {
          name: "@test/packs/dep-pack",
          version: "1.0.0",
          skills: { "@test/skills/code-review": "^1.0.0" },
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

            expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

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
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "full-pack", {
        name: "@test/packs/full-pack",
        version: "1.0.0",
        skills: { "@test/skills/linter": "^1.0.0" },
        commands: { "@test/commands/formatter": "^2.0.0" },
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

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

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

    it.effect("skips non-local dependencies with a warning", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedPack(tempDir, "@test", "mixed-deps-pack", {
        name: "@test/packs/mixed-deps-pack",
        version: "1.0.0",
        skills: {
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

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

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

          // Non-local dependency should be skipped with a warning
          expect(mockLog.logs.warn.some((m) => m.includes("@external/skills/remote-skill"))).toBe(
            true,
          );

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

    it.effect(
      "produces single-step plan when pack has no dependencies and includeDependencies is true",
      () => {
        const { provide, mockLog } = makeLayers();
        const registryRoot = path.join(tempDir, "registry");

        createManagedPack(tempDir, "@test", "no-deps-pack", {
          name: "@test/packs/no-deps-pack",
          version: "1.0.0",
        });

        initWorkspace(path.join(tempDir, ".axm"), registryRoot);

        return provide(
          Effect.gen(function* () {
            yield* handlePublishPack(
              defaultArgs("@test/packs/no-deps-pack", {
                registry: Option.some("local"),
                includeDependencies: true,
              }),
            );

            expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

            // Pack should be published
            const packIndex = path.join(
              registryRoot,
              "extensions",
              "@test",
              "packs",
              "no-deps-pack",
              "index.json",
            );
            expect(fs.existsSync(packIndex)).toBe(true);
          }),
        );
      },
    );
  });
});
