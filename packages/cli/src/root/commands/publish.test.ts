/**
 * Unit tests for the commands publish handler.
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
  getErrorResult,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handleCommandsPublish, type CommandsPublishHandlerArgs } from "./publish.js";

const TESTUSER = normalizeHandle("@testuser");

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile + registry source. */
const initWorkspace = (
  axmDir: string,
  registryRoot: string,
  lockfileCommands: Record<string, unknown> = {},
  commands?: Record<string, unknown>,
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
      profile: "@test",
      agents: ["claude-code"],
      sources: sources ?? [
        { name: "local", type: "registry", location: new URL(`file://${registryRoot}`) },
      ],
      ...(commands && { commands }),
    }),
  );
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: {}, commands: lockfileCommands }),
  );
};

/** Create a managed command extension in .axm/extensions/ with manifest and ${name}.md. */
const createManagedCommandExtension = (
  tempDir: string,
  owner: string,
  name: string,
  manifest: Record<string, unknown>,
) => {
  const extDir = path.join(tempDir, ".axm", "extensions", owner, "commands", name);
  const srcDir = path.join(extDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  const manifestFields = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== "agents"),
  );
  const normalizedManifest = {
    ...manifestFields,
    owner,
    type: "command",
    name,
    version: manifest["version"] ?? "0.1.0",
  };
  fs.writeFileSync(path.join(extDir, "command.json"), JSON.stringify(normalizedManifest));
  fs.writeFileSync(
    path.join(srcDir, `${name}.md`),
    `---\nname: "${name}"\ndescription: "A test command"\n---\n\n# ${name}\n`,
  );
  return extDir;
};

const writeRegistryCommandIndex = (registryRoot: string, name: string, version: string) => {
  const dir = path.join(registryRoot, "extensions", "@test", "commands", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "index.json"),
    JSON.stringify({
      owner: "@test",
      type: "command",
      name,
      versions: [
        {
          version,
          published: "2026-01-01T00:00:00.000Z",
          integrity: "sha512-existing",
        },
      ],
    }),
  );
};

const defaultArgs = (
  extensions: ReadonlyArray<string>,
  overrides?: Partial<CommandsPublishHandlerArgs>,
): CommandsPublishHandlerArgs => ({
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

describe("commands-publish.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "commands-publish-handler-test-"));
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
    it.effect("publishes a command extension to a named registry", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedCommandExtension(tempDir, "@test", "my-cmd", {
        name: "@test/commands/my-cmd",
        version: "1.0.0",
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handleCommandsPublish(
            defaultArgs(["@test/commands/my-cmd"], { registry: Option.some("local") }),
          );

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Registry should have the published extension index
          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "commands",
            "my-cmd",
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(true);
        }),
      );
    });

    it.effect("refuses publish when local version is not greater than registry latest", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedCommandExtension(tempDir, "@test", "stale-cmd", {
        name: "@test/commands/stale-cmd",
        version: "1.0.0",
      });
      initWorkspace(path.join(tempDir, ".axm"), registryRoot);
      writeRegistryCommandIndex(registryRoot, "stale-cmd", "1.0.0");

      return provide(
        Effect.gen(function* () {
          const result = yield* handleCommandsPublish(
            defaultArgs(["@test/commands/stale-cmd"], { registry: Option.some("local") }),
          ).pipe(Effect.flip);

          const error = getAppError(result);
          expect(error.detail).toContain("local version 1.0.0 is not greater");
          expect(error.breadcrumbs?.[0]?.description ?? "").toContain(
            "axm commands version @test/commands/stale-cmd patch",
          );
        }),
      );
    });

    it.effect("allows stale publish when force is set", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedCommandExtension(tempDir, "@test", "forced-cmd", {
        name: "@test/commands/forced-cmd",
        version: "1.0.0",
      });
      initWorkspace(path.join(tempDir, ".axm"), registryRoot);
      writeRegistryCommandIndex(registryRoot, "forced-cmd", "2.0.0");

      return provide(
        Effect.gen(function* () {
          yield* handleCommandsPublish(
            defaultArgs(["@test/commands/forced-cmd"], {
              registry: Option.some("local"),
              force: true,
            }),
          );

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });

    it.effect("rejects a manifest with deprecated agents targeting", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");
      const extDir = createManagedCommandExtension(tempDir, "@test", "targeted-cmd", {
        name: "@test/commands/targeted-cmd",
        version: "1.0.0",
      });
      fs.writeFileSync(
        path.join(extDir, "command.json"),
        JSON.stringify({
          owner: "@test",
          type: "command",
          name: "targeted-cmd",
          version: "1.0.0",
          agents: ["claude-code"],
        }),
      );

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const caught = yield* handleCommandsPublish(
            defaultArgs(["@test/commands/targeted-cmd"], { registry: Option.some("local") }),
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

      createManagedCommandExtension(tempDir, "@test", "offline-cmd", {
        name: "@test/commands/offline-cmd",
        version: "1.0.0",
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handleCommandsPublish(
            defaultArgs(["@test/commands/offline-cmd"], { registry: Option.some("local") }),
          );

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);
          expect(
            fs.existsSync(
              path.join(
                registryRoot,
                "extensions",
                "@test",
                "commands",
                "offline-cmd",
                "index.json",
              ),
            ),
          ).toBe(true);
        }),
      );
    });
  });

  describe("missing manifest error", () => {
    it.effect("fails when extension directory has no manifest", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      // Create extension directory without manifest but with the content file
      const srcDir = path.join(
        tempDir,
        ".axm",
        "extensions",
        "@test",
        "commands",
        "no-manifest",
        "src",
      );
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "no-manifest.md"), "# No manifest\n");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handleCommandsPublish(
            defaultArgs(["@test/commands/no-manifest"]),
          ).pipe(
            Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, message: e.detail })),
          );
          expect(getErrorResult(result).message).toContain("Missing manifest");
        }),
      );
    });
  });

  describe("missing content file error", () => {
    it.effect("fails when extension directory has no ${name}.md", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      // Create extension directory with manifest but without the content file
      const extDir = path.join(tempDir, ".axm", "extensions", "@test", "commands", "no-md");
      const srcDir = path.join(extDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(extDir, "command.json"),
        JSON.stringify({
          owner: "@test",
          type: "command",
          name: "no-md",
          version: "0.1.0",
        }),
      );

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handleCommandsPublish(defaultArgs(["@test/commands/no-md"])).pipe(
            Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, message: e.detail })),
          );
          expect(getErrorResult(result).message).toContain("Missing no-md.md");
        }),
      );
    });
  });

  describe("non-installed command error", () => {
    it.effect("fails when extension directory does not exist", () => {
      const { provide, rendererState } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handleCommandsPublish(
            defaultArgs(["@test/commands/nonexistent"]),
          ).pipe(
            Effect.catchTag("AppError", (e) =>
              Effect.succeed({
                error: true,
                message: e.detail,
                guidance: (e.breadcrumbs ?? [])
                  .map((breadcrumb) => breadcrumb.description)
                  .join("\n"),
              }),
            ),
          );
          const errorResult = getErrorResult(result);
          expect(errorResult.message).toContain("Managed extension not found");
          expect(errorResult.guidance).toContain("axm commands new");
          expect(rendererState.spinnerMessages).toContain("Validating extensions...");
          expect(rendererState.spinnerMessages).toContain("Failed");
        }),
      );
    });
  });

  describe("publish with default registry", () => {
    it.effect("publishes to the first configured registry when no --registry flag", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      createManagedCommandExtension(tempDir, "@test", "my-cmd", {
        name: "@test/commands/my-cmd",
        version: "0.1.0",
      });

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handleCommandsPublish(defaultArgs(["@test/commands/my-cmd"]));

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "commands",
            "my-cmd",
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(true);
        }),
      );
    });
  });
});
