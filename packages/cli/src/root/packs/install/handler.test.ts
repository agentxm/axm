/**
 * Unit tests for the packs install command handler.
 *
 * Tests the pack install flow: input validation, plan build, and execution.
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
import { TestRenderer, logsByTag } from "@axm.sh/core/unstable/cli-renderer";
import { makeTestPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { TestFlagsLayer } from "@axm.sh/core/unstable/cli-flags";
import type { WorkspaceContextOptions } from "@axm.sh/core/unstable/workspace";
import { layer as coreWorkspaceLayer } from "@axm.sh/core/unstable/workspace";
import { resolveBuiltinPack } from "../../../builtin-pack/index.js";
import { resolvePlan } from "@axm.sh/core/unstable/workspace";
import type { PackExtensionRef } from "@axm.sh/core/unstable/packs";
import type { ExtensionFiles } from "@axm.sh/core/unstable/sources";
import {
  SourceHostProvidersLive,
  SourceHostProviders,
} from "@axm.sh/core/unstable/source-resolution";
import type { SourceHostProvidersService } from "@axm.sh/core/unstable/source-resolution";
import { handleInstallPack } from "./handler.js";
import {
  type InstallPackHandlerArgs,
  InstallPackCommandWorkflowActions,
  InstallPackCommandWorkflowActionsLive,
} from "./command-actions.js";
import { SkillManagerLive } from "@axm.sh/core/unstable/skills";
import { PackManagerLive } from "@axm.sh/core/unstable/packs";
import { CommandManagerLive } from "@axm.sh/core/unstable/commands";
import { McpServerManagerLive } from "@axm.sh/core/unstable/mcp-servers";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { CodingAgentRepositoryLive } from "@axm.sh/core/unstable/agents";
import { getAppError } from "../../../test-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Stub methods for SourceHostProvidersService. */
const serviceStubs: SourceHostProvidersService = {
  find: () => Effect.succeed([]),
  fetch: () => Effect.fail(makeAppError({ code: "FETCH_FAILED", what: "stub" })),
  cloneUrl: () => Option.none(),
  origin: () => "unknown",
};

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  opts?: {
    lockfileSkills?: Record<string, unknown>;
    lockfilePacks?: Record<string, unknown>;
    settingsPacks?: Record<string, unknown>;
    sources?: ReadonlyArray<unknown>;
    profile?: string;
  },
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = { agents: ["claude-code"] };
  if (opts?.settingsPacks) settings["packs"] = opts.settingsPacks;
  if (opts?.sources) settings["sources"] = opts.sources;
  if (opts?.profile) settings["profile"] = opts.profile;
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({
      lockfileVersion: 1,
      skills: opts?.lockfileSkills ?? {},
      ...(opts?.lockfilePacks ? { packs: opts.lockfilePacks } : {}),
    }),
  );
};

const defaultArgs = (
  source: string,
  overrides: Partial<InstallPackHandlerArgs> = {},
): InstallPackHandlerArgs => ({
  source,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("packs install handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "packs-install-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (
    tuiConfig?: {
      confirmValue?: boolean;
    },
    flagsOverrides?: { verbose?: boolean; debug?: boolean; nonInteractive?: boolean },
  ) => {
    const { layer: rendererLayer, state: rendererState } = TestRenderer.make();

    const [promptLayer] = makeTestPrompt({
      confirmResponses: [tuiConfig?.confirmValue ?? true],
    });
    const BaseLayer = Layer.mergeAll(
      NodeServices.layer,
      rendererLayer,
      promptLayer,
      TestFlagsLayer(flagsOverrides),
    );
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
      agents: Option.none(),
    };
    const WsLayer = Layer.provide(
      coreWorkspaceLayer({ ...wsOptions, resolveBuiltinPack: resolveBuiltinPack() }),
      BaseLayer,
    );
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const ManagersLayer = Layer.mergeAll(
      PackManagerLive,
      SkillManagerLive,
      CommandManagerLive,
      McpServerManagerLive,
    );
    const CoreLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer, CodingAgentRepositoryLive);
    const MgrLayer = Layer.provide(ManagersLayer, CoreLayer);
    const ActionsLayer = Layer.provide(
      InstallPackCommandWorkflowActionsLive,
      Layer.merge(CoreLayer, MgrLayer),
    );
    const FullLayer = Layer.mergeAll(CoreLayer, MgrLayer, ActionsLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    const logs = logsByTag(rendererState);

    return { provide, logs, rendererState };
  };

  const makeLayersWithMockSources = (
    mockService: SourceHostProvidersService,
    flagsOverrides?: { verbose?: boolean; debug?: boolean; nonInteractive?: boolean },
  ) => {
    const { layer: rendererLayer, state: rendererState } = TestRenderer.make();

    const [promptLayer] = makeTestPrompt({
      confirmResponses: [true],
    });
    const BaseLayer = Layer.mergeAll(
      NodeServices.layer,
      rendererLayer,
      promptLayer,
      TestFlagsLayer(flagsOverrides),
    );
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
      agents: Option.none(),
    };
    const WsLayer = Layer.provide(
      coreWorkspaceLayer({ ...wsOptions, resolveBuiltinPack: resolveBuiltinPack() }),
      BaseLayer,
    );
    const SPLayer = Layer.succeed(SourceHostProviders, mockService);
    const ManagersLayer = Layer.mergeAll(
      PackManagerLive,
      SkillManagerLive,
      CommandManagerLive,
      McpServerManagerLive,
    );
    const CoreLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer, CodingAgentRepositoryLive);
    const MgrLayer = Layer.provide(ManagersLayer, CoreLayer);
    const ActionsLayer = Layer.provide(
      InstallPackCommandWorkflowActionsLive,
      Layer.merge(CoreLayer, MgrLayer),
    );
    const FullLayer = Layer.mergeAll(CoreLayer, MgrLayer, ActionsLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    const logs = logsByTag(rendererState);

    return { provide, logs, rendererState };
  };

  // ---------------------------------------------------------------------------
  // Input parsing (via workflow actions service)
  // ---------------------------------------------------------------------------

  describe("input parsing", () => {
    it.effect("accepts @profile/packs/pack-name format", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const result = yield* actions.parseArgs(defaultArgs("@acme/packs/my-pack"));
          expect(result.profile).toBe("@acme");
          expect(result.packName).toBe("my-pack");
          expect(result.versionConstraint).toEqual(Option.none());
        }),
      );
    });

    it.effect("accepts @profile/packs/pack-name@^2.0.0 with version constraint", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const result = yield* actions.parseArgs(defaultArgs("@acme/packs/my-pack@^2.0.0"));
          expect(result.profile).toBe("@acme");
          expect(result.packName).toBe("my-pack");
          expect(result.versionConstraint).toEqual(Option.some("^2.0.0"));
        }),
      );
    });

    it.effect("resolves bare pack-name to @defaultScope/packs/pack-name", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
        profile: "@myorg",
      });

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const result = yield* actions.parseArgs(defaultArgs("my-pack"));
          expect(result.profile).toBe("@myorg");
          expect(result.packName).toBe("my-pack");
          expect(result.resolvedInput).toBe("@myorg/packs/my-pack");
        }),
      );
    });

    it.effect("resolves bare pack-name@version with default profile", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
        profile: "@myorg",
      });

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const result = yield* actions.parseArgs(defaultArgs("my-pack@^2.0.0"));
          expect(result.profile).toBe("@myorg");
          expect(result.packName).toBe("my-pack");
          expect(result.versionConstraint).toEqual(Option.some("^2.0.0"));
          expect(result.resolvedInput).toBe("@myorg/packs/my-pack@^2.0.0");
        }),
      );
    });

    it.effect("rejects @profile/pack-name without /packs/ segment", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const error = getAppError(
            yield* actions.parseArgs(defaultArgs("@acme/my-pack")).pipe(Effect.flip),
          );
          expect(error.code).toBe("PACK_SOURCE_NOT_REGISTRY");
        }),
      );
    });

    it.effect("rejects local path sources", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const error = getAppError(
            yield* actions.parseArgs(defaultArgs("./local-path")).pipe(Effect.flip),
          );
          expect(error.code).toBe("PACK_SOURCE_NOT_REGISTRY");
        }),
      );
    });

    it.effect("rejects github shorthand sources", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const error = getAppError(
            yield* actions.parseArgs(defaultArgs("github:owner/repo")).pipe(Effect.flip),
          );
          expect(error.code).toBe("PACK_SOURCE_NOT_REGISTRY");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Non-registry source rejected (handler level)
  // ---------------------------------------------------------------------------

  describe("non-registry source rejection", () => {
    it.effect("rejects local path sources", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = getAppError(
            yield* handleInstallPack(defaultArgs("./local-path"), {
              yes: false,
              force: false,
              preview: false,
            }).pipe(Effect.flip),
          );
          expect(error.what).toContain("registry");
        }),
      );
    });

    it.effect("rejects github sources", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = getAppError(
            yield* handleInstallPack(defaultArgs("github:owner/repo"), {
              yes: false,
              force: false,
              preview: false,
            }).pipe(Effect.flip),
          );
          expect(error.what).toContain("registry");
        }),
      );
    });

    it.effect("rejects @profile/pack-name without /packs/ segment", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      return provide(
        Effect.gen(function* () {
          const error = getAppError(
            yield* handleInstallPack(defaultArgs("@acme/my-pack"), {
              yes: false,
              force: false,
              preview: false,
            }).pipe(Effect.flip),
          );
          expect(error.code).toBe("PACK_SOURCE_NOT_REGISTRY");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Already installed (no --force)
  // ---------------------------------------------------------------------------

  describe("already installed", () => {
    it.effect("creates install plan for already-installed pack", () => {
      const packRef: PackExtensionRef = {
        type: "pack",
        refType: "registry",
        pack: {
          name: "my-pack",
          skills: {},
          commands: {},
          mcpServers: {},
        },
        source: {
          type: "registry",
          location: new URL("file:///tmp/reg"),
          profile: Option.none(),
        },
        profile: "@acme",
        name: "my-pack",
        version: "1.0.0",
        integrity: "abc",
      };

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) =>
          options.type === "pack" ? Effect.succeed([packRef]) : Effect.succeed([]),
      };

      const { provide, logs } = makeLayersWithMockSources(mockService);
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [
          {
            name: "default",
            type: "registry",
            location: "file:///tmp/reg",
          },
        ],
        lockfilePacks: {
          "my-pack": {
            type: "registry",
            profile: "@acme",
            name: "my-pack",
            resolvedVersion: "1.0.0",
            integrity: "abc",
            sourceName: "default",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {},
            resolvedCommands: {},
            resolvedMcpServers: {},
          },
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/packs/my-pack"), {
            yes: false,
            force: false,
            preview: false,
          });

          const allLogs = [
            ...logs.info,
            ...logs.message,
            ...logs.warn,
            ...logs.success,
            ...logs.error,
          ].join("\n");
          // The shared workflow always builds install plan steps
          expect(allLogs).toContain("my-pack");
          expect(allLogs).toMatch(/1 (to apply|applied|failed)/);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Preview mode
  // ---------------------------------------------------------------------------

  describe("preview mode", () => {
    it.effect("fails at source resolution when no registry configured", () => {
      const { provide, rendererState } = makeLayers({
        confirmValue: false,
      });
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = getAppError(
            yield* handleInstallPack(defaultArgs("@acme/packs/test-pack"), {
              yes: false,
              force: false,
              preview: true,
            }).pipe(Effect.flip),
          );
          expect(error.code).toBe("INVALID_SOURCE");
          expect(rendererState.spinnerMessages).toContain("Parsing source...");
          expect(rendererState.spinnerMessages).toContain("Failed");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Pack install plan
  // ---------------------------------------------------------------------------

  describe("pack install plan", () => {
    const makePackRef = (
      name: string,
      opts?: {
        skills?: Record<string, string>;
        commands?: Record<string, string>;
        mcpServers?: Record<string, string>;
      },
    ): PackExtensionRef => ({
      type: "pack",
      refType: "registry",
      pack: {
        name,
        skills: opts?.skills ?? {},
        commands: opts?.commands ?? {},
        mcpServers: opts?.mcpServers ?? {},
      },
      source: { type: "registry", location: new URL("file:///tmp/reg"), profile: Option.none() },
      profile: "@acme",
      name,
      version: "1.0.0",
      integrity: "",
    });

    it.effect("builds plan from pack ref returned by sources.find", () => {
      const packRef = makePackRef("test-pack", {
        skills: { "@acme/skills/code-review": "^1.0.0" },
      });

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          if (options.type === "skill") {
            return Effect.succeed([
              {
                type: "skill",
                refType: "registry",
                skill: {
                  name: "code-review",
                  description: Option.none(),
                  metadata: Option.none(),
                },
                source: {
                  type: "registry",
                  location: new URL("file:///tmp/reg"),
                  profile: Option.none(),
                },
                profile: "@acme",
                name: "code-review",
                version: "1.2.3",
                integrity: "",
              },
            ]);
          }
          return Effect.succeed([]);
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide, logs } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/packs/test-pack"), {
            yes: false,
            force: false,
            preview: false,
          });

          const allLogs = [
            ...logs.info,
            ...logs.message,
            ...logs.success,
            ...logs.warn,
            ...logs.error,
          ].join("\n");
          expect(allLogs).toContain("test-pack");
        }),
      );
    });

    it.effect("pack version constraint from source persisted in settings", () => {
      const packArchiveDir = path.join(tempDir, "pack-archive");
      fs.mkdirSync(packArchiveDir, { recursive: true });

      const packRef = makePackRef("test-pack");

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          return Effect.succeed([]);
        },
        fetch: (ref) => {
          if (ref.type === "pack" && ref.pack.name === "test-pack") {
            return Effect.succeed({ directory: packArchiveDir } satisfies ExtensionFiles);
          }
          return Effect.fail(makeAppError({ code: "FETCH_FAILED", what: "Unexpected fetch call" }));
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/packs/test-pack@^2.0.0"), {
            yes: false,
            force: false,
            preview: false,
          });

          const axmDir = path.join(tempDir, ".axm");
          const settingsContent = fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8");
          const settingsJson: { packs?: Record<string, string> } = JSON.parse(settingsContent);
          expect(settingsJson.packs?.["test-pack"]).toBe("@acme/packs/test-pack@^2.0.0");
        }),
      );
    });

    it.effect("builds plan with all extension steps for already-installed pack", () => {
      const packRef = makePackRef("test-pack");

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          return Effect.succeed([]);
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
        lockfilePacks: {
          "test-pack": {
            type: "registry",
            profile: "@acme",
            name: "test-pack",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "default",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {},
            resolvedCommands: {},
            resolvedMcpServers: {},
          },
        },
      });

      const { provide, logs } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/packs/test-pack"), {
            yes: false,
            force: false,
            preview: false,
          });

          const allLogs = [
            ...logs.info,
            ...logs.message,
            ...logs.success,
            ...logs.warn,
            ...logs.error,
          ].join("\n");
          // New shared workflow always creates install steps
          expect(allLogs).toContain("test-pack");
          expect(allLogs).toMatch(/1 (to apply|applied|failed)/);
        }),
      );
    });

    it.effect("fails when pack not found in registry", () => {
      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: () => Effect.succeed([]),
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          const error = getAppError(
            yield* handleInstallPack(defaultArgs("@acme/packs/nonexistent"), {
              yes: false,
              force: false,
              preview: false,
            }).pipe(Effect.flip),
          );
          expect(error.code).toBe("PACK_NOT_FOUND");
        }),
      );
    });

    it.effect("falls back to file registry when remote registry discovery is unsupported", () => {
      const packRef = makePackRef("effect");
      let attemptedRemote = false;
      let attemptedFile = false;

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (source, options) => {
          if (options.type !== "pack") {
            return Effect.succeed([]);
          }

          if (source.type === "registry" && source.location.protocol !== "file:") {
            attemptedRemote = true;
            return Effect.fail(
              makeAppError({
                code: "REGISTRY_REMOTE_NOT_SUPPORTED",
                what: "remote registry not yet supported",
              }),
            );
          }

          if (source.type === "registry" && source.location.protocol === "file:") {
            attemptedFile = true;
            return Effect.succeed([packRef]);
          }

          return Effect.succeed([]);
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [
          { type: "registry", name: "remote", location: "http://localhost:4300" },
          { type: "registry", name: "local", location: "file:///tmp/reg" },
        ],
      });

      const { provide, logs } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/packs/effect"), {
            yes: false,
            force: false,
            preview: false,
          });
          expect(attemptedRemote).toBe(true);
          expect(attemptedFile).toBe(true);
          expect(logs.info).toContain("Registry source: local (file:///tmp/reg)");
        }),
      );
    });

    it.effect("logs host resolution details for bare-name input", () => {
      const packRef = makePackRef("effect");

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (source, options) => {
          if (options.type !== "pack") {
            return Effect.succeed([]);
          }

          if (source.type === "registry" && source.location.protocol !== "file:") {
            return Effect.fail(
              makeAppError({
                code: "REGISTRY_REMOTE_NOT_SUPPORTED",
                what: "remote registry not yet supported",
              }),
            );
          }

          if (source.type === "registry" && source.location.protocol === "file:") {
            return Effect.succeed([packRef]);
          }

          return Effect.succeed([]);
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        profile: "@axm",
        sources: [
          { type: "registry", name: "remote", location: "http://localhost:4300" },
          { type: "registry", name: "local", location: "file:///tmp/reg" },
        ],
      });

      const { provide, logs } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("effect"), {
            yes: false,
            force: false,
            preview: false,
          });

          expect(logs.info).toContain("Source resolution: effect -> @axm/packs/effect");
          expect(
            logs.info.some(
              (line) =>
                line.includes("Host resolution:") &&
                line.includes("http://localhost:4300/") &&
                line.includes("file:///tmp/reg") &&
                line.includes("matched"),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("builds skill, command, and mcp-server ops from pack resolved maps", () => {
      const packRef = makePackRef("multi-pack", {
        skills: { "@acme/skills/code-review": "1.0.0" },
        commands: { "@acme/commands/lint": "2.0.0" },
        mcpServers: { "@acme/mcp-servers/analytics": "3.0.0" },
      });

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          if (options.type === "skill") {
            return Effect.succeed([
              {
                type: "skill",
                refType: "registry",
                skill: {
                  name: "code-review",
                  description: Option.none(),
                  metadata: Option.none(),
                },
                source: {
                  type: "registry",
                  location: new URL("file:///tmp/reg"),
                  profile: Option.none(),
                },
                profile: "@acme",
                name: "code-review",
                version: "1.0.0",
                integrity: "",
              },
            ]);
          }
          if (options.type === "command") {
            return Effect.succeed([
              {
                type: "command",
                refType: "registry",
                command: { name: "lint" },
                source: {
                  type: "registry",
                  location: new URL("file:///tmp/reg"),
                  profile: Option.none(),
                },
                profile: "@acme",
                name: "lint",
                version: "2.0.0",
                integrity: "",
              },
            ]);
          }
          if (options.type === "mcp-server") {
            return Effect.succeed([
              {
                type: "mcp-server",
                refType: "registry",
                server: { name: "analytics" },
                source: {
                  type: "registry",
                  location: new URL("file:///tmp/reg"),
                  profile: Option.none(),
                },
                profile: "@acme",
                name: "analytics",
                version: "3.0.0",
                integrity: "",
              },
            ]);
          }
          return Effect.succeed([]);
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide, logs } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/packs/multi-pack"), {
            yes: false,
            force: false,
            preview: false,
          });

          const allLogs = [
            ...logs.info,
            ...logs.message,
            ...logs.success,
            ...logs.warn,
            ...logs.error,
          ].join("\n");
          // Plan should include the pack and all extension steps
          expect(allLogs).toContain("multi-pack");
          expect(allLogs).toContain("code-review");
          expect(allLogs).toContain("lint");
          expect(allLogs).toContain("analytics");
        }),
      );
    });

    it.effect("includes dependency extensions in install plan", () => {
      const packRef = makePackRef("dep-pack", {
        skills: { "@acme/skills/existing-skill": "1.0.0" },
        commands: { "@acme/commands/existing-cmd": "1.0.0" },
      });

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          return Effect.succeed([]);
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
        lockfileSkills: {
          "existing-skill": {
            type: "registry",
            profile: "@acme",
            name: "existing-skill",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "default",
            agents: [],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      });

      const { provide, logs } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultArgs("@acme/packs/dep-pack"), {
            yes: false,
            force: false,
            preview: false,
          });

          const allLogs = [
            ...logs.info,
            ...logs.message,
            ...logs.success,
            ...logs.warn,
            ...logs.error,
          ].join("\n");
          // Dependency extensions are included in the install plan
          expect(allLogs).toContain("existing-skill");
          expect(allLogs).toContain("existing-cmd");
          expect(allLogs).toMatch(/3 (to apply|applied|failed)/);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // --force propagation to workspace resolvePlan
  // ---------------------------------------------------------------------------

  describe("--force propagation", () => {
    it.effect("--force in workspace options downgrades plan errors to warnings", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const plan = {
            _tag: "Plan" as const,
            name: "test-plan",
            description: Option.none<string>(),
            jobs: [
              {
                concurrency: 1 as const,
                steps: [
                  {
                    readiness: "error" as const,
                    errorMessage: "Test error step",
                    label: "test-step",
                  },
                ],
              },
            ],
          };
          const result = yield* resolvePlan(plan, { yes: true, force: true, preview: false });
          // --force downgrades errors to warnings and proceeds
          expect(logs.warn.some((m: string) => m.includes("Test error step"))).toBe(true);
          expect(result._tag).toBe("ExecutedPlan");
        }),
      );
    });
  });
});
