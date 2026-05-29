/**
 * Unit tests for the subagents publish command handler.
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
  getAppError,
  getErrorResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../../test-helpers.js";
import { handlePublish, type PublishHandlerArgs } from "./handler.js";

const TESTUSER = normalizeHandle("@testuser");

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile + registry source. */
const initWorkspace = (
  axmDir: string,
  registryRoot: string,
  lockfileSubagents: Record<string, unknown> = {},
  subagents?: Record<string, unknown>,
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
      ...(subagents && { subagents }),
    }),
  );
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: {}, subagents: lockfileSubagents }),
  );
};

/** Create a managed subagent extension in .axm/extensions/ with manifest and <name>.md. */
const createManagedSubagent = (
  tempDir: string,
  owner: string,
  name: string,
  manifest: Record<string, unknown>,
  frontmatter?: Record<string, string>,
  contentFilename = `${name}.md`,
) => {
  const extDir = path.join(tempDir, ".axm", "extensions", owner, "subagents", name);
  const srcDir = path.join(extDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  const manifestFields = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== "agents"),
  );
  const normalizedManifest = {
    ...manifestFields,
    owner,
    type: "subagent",
    name,
    version: manifest["version"] ?? "0.0.1",
  };
  fs.writeFileSync(path.join(extDir, "subagent.json"), JSON.stringify(normalizedManifest));
  const fm = frontmatter ?? { name, description: `The ${name} subagent` };
  const fmYaml = Object.entries(fm)
    .map(([k, v]) => `${k}: "${v}"`)
    .join("\n");
  fs.writeFileSync(path.join(srcDir, contentFilename), `---\n${fmYaml}\n---\n\n# ${name}\n`);
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

describe("subagents-publish.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagents-publish-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (options?: {
    wsOverrides?: Partial<WorkspaceMutationsOptions>;
    authCredentials?: Parameters<typeof CredentialStoreTest>[1] | null;
  }) => {
    const handlerTestContext = makeWorkspaceHandlerTestContext({
      prompt: {
        confirmResponses: [true],
      },
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

  describe("publish with explicit registry", () => {
    it.effect("publishes a subagent to a named registry", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedSubagent(tempDir, "@test", "researcher", {
        name: "@test/subagents/researcher",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(
            defaultArgs(["@test/subagents/researcher"], { registry: Option.some("local") }),
          );

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Registry should have the published extension index
          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "subagents",
            "researcher",
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(true);
        }),
      );
    });
  });

  describe("deprecated manifest targeting", () => {
    it.effect("rejects a manifest with an agents field", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");
      const extDir = createManagedSubagent(tempDir, "@test", "targeted-subagent", {
        name: "@test/subagents/targeted-subagent",
        version: "1.0.0",
      });
      fs.writeFileSync(
        path.join(extDir, "subagent.json"),
        JSON.stringify({
          owner: "@test",
          type: "subagent",
          name: "targeted-subagent",
          version: "1.0.0",
          agents: ["claude-code"],
        }),
      );

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const caught = yield* handlePublish(
            defaultArgs(["@test/subagents/targeted-subagent"], { registry: Option.some("local") }),
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

      createManagedSubagent(tempDir, "@test", "offline-subagent", {
        name: "@test/subagents/offline-subagent",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(
            defaultArgs(["@test/subagents/offline-subagent"], { registry: Option.some("local") }),
          );

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);
          expect(
            fs.existsSync(
              path.join(
                registryRoot,
                "extensions",
                "@test",
                "subagents",
                "offline-subagent",
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

      createManagedSubagent(tempDir, "@test", "preview-subagent", {
        name: "@test/subagents/preview-subagent",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(
            defaultArgs(["@test/subagents/preview-subagent"], {
              force: true,
              preview: true,
            }),
          );

          expect(
            fs.existsSync(
              path.join(registryRoot, "extensions", "@test", "subagents", "preview-subagent"),
            ),
          ).toBe(false);
        }),
      );
    });
  });

  describe("publish with default registry", () => {
    it.effect("publishes to the first configured registry when no --registry flag", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedSubagent(tempDir, "@test", "summarizer", {
        name: "@test/subagents/summarizer",
        version: "0.1.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["@test/subagents/summarizer"]));

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "subagents",
            "summarizer",
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(true);
        }),
      );
    });
  });

  describe("bare name owner resolution", () => {
    it.effect("resolves bare name from installed subagent settings entry", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedSubagent(tempDir, "@test", "researcher", {
        name: "@test/subagents/researcher",
        version: "0.1.0",
        agents: ["claude-code"],
      });

      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {},
        {
          researcher: "@test/subagents/researcher",
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["researcher"]));

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "subagents",
            "researcher",
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
        "subagents",
        "no-manifest",
        "src",
      );
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "no-manifest.md"), "# No manifest\n");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handlePublish(defaultArgs(["@test/subagents/no-manifest"])).pipe(
            Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, message: e.detail })),
          );
          expect(getErrorResult(result).message).toContain("Missing manifest");
        }),
      );
    });
  });

  describe("non-installed subagent error", () => {
    it.effect("fails when extension directory does not exist in .axm/extensions/", () => {
      const { provide, rendererState } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handlePublish(defaultArgs(["@test/subagents/nonexistent"])).pipe(
            Effect.catchTag("AppError", (e) =>
              Effect.succeed({
                error: true,
                message: e.detail,
                guidance: (e.suggestions ?? [])
                  .map((suggestion) => suggestion.description)
                  .join("\n"),
              }),
            ),
          );
          const errorResult = getErrorResult(result);
          expect(errorResult.message).toContain("Managed extension not found");
          expect(errorResult.guidance).toContain("axm subagents new");
          expect(rendererState.spinnerMessages).toContain("Validating extensions...");
          expect(rendererState.spinnerMessages).toContain("Failed");
        }),
      );
    });
  });

  describe("manifest is the source of truth", () => {
    it.effect("does not rewrite the manifest from frontmatter on publish", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      const extDir = createManagedSubagent(
        tempDir,
        "@test",
        "manifest-source-of-truth",
        {
          name: "@test/subagents/manifest-source-of-truth",
          version: "1.0.0",
          agents: ["claude-code"],
          description: "manifest description",
        },
        {
          name: "manifest-source-of-truth",
          description: "frontmatter description (should not be projected)",
        },
      );

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(
            defaultArgs(["@test/subagents/manifest-source-of-truth"], {
              registry: Option.some("local"),
            }),
          );

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          const manifestPath = path.join(extDir, "subagent.json");
          const updatedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(updatedManifest.description).toBe("manifest description");
        }),
      );
    });
  });

  describe("identity validation", () => {
    it.effect("fails when frontmatter name differs from manifest name", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedSubagent(
        tempDir,
        "@test",
        "identity-check",
        {
          name: "@test/subagents/identity-check",
          version: "1.0.0",
          agents: ["claude-code"],
        },
        {
          name: "other-name",
          description: "bad identity",
        },
      );

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const caught = yield* handlePublish(
            defaultArgs(["@test/subagents/identity-check"], { registry: Option.some("local") }),
          ).pipe(Effect.flip);
          const error = getAppError(caught);

          expect(error.code).toBe("internal");
          expect(error.suggestions?.[0]?.description ?? "").toContain("identity-check");
        }),
      );
    });

    it.effect("fails when content filename differs from manifest name", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedSubagent(
        tempDir,
        "@test",
        "identity-check",
        {
          name: "@test/subagents/identity-check",
          version: "1.0.0",
          agents: ["claude-code"],
        },
        {
          name: "identity-check",
          description: "bad filename",
        },
        "wrong-name.md",
      );

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const caught = yield* handlePublish(
            defaultArgs(["@test/subagents/identity-check"], { registry: Option.some("local") }),
          ).pipe(Effect.flip);
          const error = getAppError(caught);

          expect(error.code).toBe("internal");
          expect(error.suggestions?.[0]?.description ?? "").toContain("identity-check.md");
        }),
      );
    });
  });

  describe("glob expansion", () => {
    it.effect("expands glob pattern against installed subagent names", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedSubagent(tempDir, "@test", "research-code", {
        name: "@test/subagents/research-code",
        version: "1.0.0",
        agents: ["claude-code"],
      });
      createManagedSubagent(tempDir, "@test", "research-docs", {
        name: "@test/subagents/research-docs",
        version: "1.0.0",
        agents: ["claude-code"],
      });
      createManagedSubagent(tempDir, "@test", "summarizer", {
        name: "@test/subagents/summarizer",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      const now = new Date().toISOString();
      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {
          "research-code": {
            type: "registry",
            owner: "@test",
            name: "research-code",
            resolvedVersion: "1.0.0",
            integrity: "sha384-test",
            sourceName: "local",
            agents: ["claude-code"],
            installedAt: now,
            updatedAt: now,
          },
          "research-docs": {
            type: "registry",
            owner: "@test",
            name: "research-docs",
            resolvedVersion: "1.0.0",
            integrity: "sha384-test",
            sourceName: "local",
            agents: ["claude-code"],
            installedAt: now,
            updatedAt: now,
          },
          summarizer: {
            type: "registry",
            owner: "@test",
            name: "summarizer",
            resolvedVersion: "1.0.0",
            integrity: "sha384-test",
            sourceName: "local",
            agents: ["claude-code"],
            installedAt: now,
            updatedAt: now,
          },
        },
        {
          "research-code": "@test/subagents/research-code",
          "research-docs": "@test/subagents/research-docs",
          summarizer: "@test/subagents/summarizer",
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["research-*"]));

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Both research- subagents should be published
          expect(
            fs.existsSync(
              path.join(
                registryRoot,
                "extensions",
                "@test",
                "subagents",
                "research-code",
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
                "subagents",
                "research-docs",
                "index.json",
              ),
            ),
          ).toBe(true);
          // summarizer should NOT be published
          expect(
            fs.existsSync(
              path.join(
                registryRoot,
                "extensions",
                "@test",
                "subagents",
                "summarizer",
                "index.json",
              ),
            ),
          ).toBe(false);
        }),
      );
    });

    it.effect("glob matching zero subagents warns and exits cleanly", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      const now = new Date().toISOString();
      initWorkspace(path.join(tempDir, ".axm"), registryRoot, {
        summarizer: {
          type: "registry",
          owner: "@test",
          name: "summarizer",
          resolvedVersion: "1.0.0",
          integrity: "sha384-test",
          sourceName: "local",
          agents: ["claude-code"],
          installedAt: now,
          updatedAt: now,
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(defaultArgs(["nonexistent-*"]));

          expect(logs.warn.some((m) => m.includes("No subagents matched"))).toBe(true);
          expect(logs.success.some((m) => m.includes("Nothing to publish"))).toBe(true);
        }),
      );
    });
  });

  describe("preview mode", () => {
    it.effect("shows plan without publishing when --preview is set", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedSubagent(tempDir, "@test", "researcher", {
        name: "@test/subagents/researcher",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handlePublish(
            defaultArgs(["@test/subagents/researcher"], {
              registry: Option.some("local"),
              preview: true,
            }),
          );

          // Registry should NOT have the published extension in preview mode
          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "subagents",
            "researcher",
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(false);
        }),
      );
    });
  });
});
