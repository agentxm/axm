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

/** Create a managed command extension in .axm/extensions/ with manifest and COMMAND.md. */
const createManagedCommandExtension = (
  tempDir: string,
  owner: string,
  name: string,
  manifest: Record<string, unknown>,
) => {
  const extDir = path.join(tempDir, ".axm", "extensions", owner, "commands", name);
  const srcDir = path.join(extDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  const normalizedManifest = {
    ...manifest,
    owner,
    type: "command",
    name,
    version: manifest["version"] ?? "0.1.0",
  };
  fs.writeFileSync(path.join(extDir, "command.json"), JSON.stringify(normalizedManifest));
  fs.writeFileSync(
    path.join(srcDir, "COMMAND.md"),
    `---\nname: "${name}"\ndescription: "A test command"\n---\n\n# ${name}\n`,
  );
  return extDir;
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

      // Create extension directory without manifest but with COMMAND.md
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
      fs.writeFileSync(path.join(srcDir, "COMMAND.md"), "# No manifest\n");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handleCommandsPublish(
            defaultArgs(["@test/commands/no-manifest"]),
          ).pipe(Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, what: e.what })));
          expect(getErrorResult(result).what).toContain("Missing manifest");
        }),
      );
    });
  });

  describe("missing COMMAND.md error", () => {
    it.effect("fails when extension directory has no COMMAND.md", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      // Create extension directory with manifest but without COMMAND.md
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
            Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, what: e.what })),
          );
          expect(getErrorResult(result).what).toContain("Missing COMMAND.md");
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
                what: e.what,
                howToFix: Option.getOrElse(e.howToFix, () => ""),
              }),
            ),
          );
          const errorResult = getErrorResult(result);
          expect(errorResult.what).toContain("Managed extension not found");
          expect(errorResult.howToFix).toContain("axm commands new");
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
