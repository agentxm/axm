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
import { normalizeHandle } from "@agentxm/client-core/unstable/extensions";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { TestRenderer, logsByTag } from "@agentxm/client-core/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import type { WorkspaceMutationsOptions } from "@agentxm/client-core/unstable/workspace";
import {
  layer as coreWorkspaceLayer,
  ResolvePlanInteractionTest,
} from "@agentxm/client-core/unstable/workspace";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import type { PackRef } from "@agentxm/client-core/unstable/packs";
import type { ExtensionFiles } from "@agentxm/client-core/unstable/sources";
import {
  SourceHostProvidersLive,
  SourceHostProviders,
} from "@agentxm/client-core/unstable/source-resolution";
import type { SourceHostProvidersService } from "@agentxm/client-core/unstable/source-resolution";
import { handleInstallPack } from "./handler.js";
import {
  type InstallPackHandlerArgs,
  InstallPackCommandWorkflowActions,
  InstallPackCommandWorkflowActionsLive,
} from "./command-actions.js";
import type { PackInstallHandlerArgs } from "./handler.js";
import { SkillManagerLive } from "@agentxm/client-core/unstable/skills";
import { PackManagerLive } from "@agentxm/client-core/unstable/packs";
import { HookManagerLive } from "@agentxm/client-core/unstable/hooks";
import { KnowledgeManagerLive } from "@agentxm/client-core/unstable/knowledge";
import { McpServerManagerLive } from "@agentxm/client-core/unstable/mcps";
import { RuleManagerLive } from "@agentxm/client-core/unstable/rules";
import { SubagentManagerLive } from "@agentxm/client-core/unstable/subagents";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/client-core/unstable/packaging";
import {
  computePackageContentHashSync,
  dependencyConstraintMap,
  exactVersion,
  extensionName,
  writeTrustFromWorkspaceLockfile,
} from "../../../test-stubs.js";
import { getAppError } from "../../../test-helpers.js";

const decodePackageType = Schema.decodeUnknownSync(PackageTypeSchema);
const ACME = normalizeHandle("@acme");
const AXM = normalizeHandle("@axm");
const MYORG = normalizeHandle("@myorg");

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Stub methods for SourceHostProvidersService. */
const serviceStubs: SourceHostProvidersService = {
  find: () => Effect.succeed([]),
  fetch: () => Effect.fail(makeAppError({ code: "internal", detail: "stub" })),
  cloneUrl: () => Option.none(),
  origin: () => "unknown",
};

const constraints = dependencyConstraintMap;

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  opts?: {
    lockfileSkills?: Record<string, unknown>;
    lockfilePacks?: Record<string, unknown>;
    settingsPacks?: Record<string, unknown>;
    settingsSkills?: Record<string, unknown>;
    sources?: ReadonlyArray<unknown>;
    owner?: string;
  },
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = { agents: ["claude-code"] };
  if (opts?.settingsPacks) settings["packs"] = opts.settingsPacks;
  if (opts?.settingsSkills) settings["skills"] = opts.settingsSkills;
  if (opts?.sources) settings["sources"] = opts.sources;
  if (opts?.owner) settings["owner"] = opts.owner;
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({
      lockfileVersion: 3,
      skills: opts?.lockfileSkills ?? {},
      ...(opts?.lockfilePacks ? { packs: opts.lockfilePacks } : {}),
    }),
  );
};

const defaultSourceArgs = (
  source: string,
  overrides: Partial<InstallPackHandlerArgs> = {},
): InstallPackHandlerArgs => ({
  source,
  ...overrides,
});

const defaultHandlerArgs = (
  source: string,
  overrides: Partial<PackInstallHandlerArgs> = {},
): PackInstallHandlerArgs => ({
  source: Option.some(source),
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
    const resolvePlanInteraction = ResolvePlanInteractionTest({
      confirmApplyChanges: () => Effect.succeed(tuiConfig?.confirmValue ?? true),
    });
    const BaseLayer = Layer.mergeAll(
      NodeServices.layer,
      rendererLayer,
      resolvePlanInteraction.layer,
      TestFlagsLayer(flagsOverrides),
    );
    const wsOptions: WorkspaceMutationsOptions = {
      scope: "project",
    };
    const WsLayer = Layer.provide(
      coreWorkspaceLayer({
        ...wsOptions,
      }),
      BaseLayer,
    );
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const ManagersLayer = Layer.mergeAll(
      PackManagerLive,
      SkillManagerLive,
      HookManagerLive,
      KnowledgeManagerLive,
      RuleManagerLive,
      McpServerManagerLive,
      SubagentManagerLive,
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
    const resolvePlanInteraction = ResolvePlanInteractionTest({
      confirmApplyChanges: () => Effect.succeed(true),
    });
    const BaseLayer = Layer.mergeAll(
      NodeServices.layer,
      rendererLayer,
      resolvePlanInteraction.layer,
      TestFlagsLayer(flagsOverrides),
    );
    const wsOptions: WorkspaceMutationsOptions = {
      scope: "project",
    };
    const WsLayer = Layer.provide(
      coreWorkspaceLayer({
        ...wsOptions,
      }),
      BaseLayer,
    );
    const SPLayer = Layer.succeed(SourceHostProviders, mockService);
    const ManagersLayer = Layer.mergeAll(
      PackManagerLive,
      SkillManagerLive,
      HookManagerLive,
      KnowledgeManagerLive,
      RuleManagerLive,
      McpServerManagerLive,
      SubagentManagerLive,
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
    it.effect("accepts @owner/packs/pack-name format", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const result = yield* actions.parseArgs(defaultSourceArgs("@acme/packs/my-pack"));
          expect(result.owner).toBe("@acme");
          expect(result.packName).toBe("my-pack");
          expect(result.versionRange).toEqual(Option.none());
        }),
      );
    });

    it.effect("accepts @owner/packs/pack-name@^2.0.0 with version constraint", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const result = yield* actions.parseArgs(defaultSourceArgs("@acme/packs/my-pack@^2.0.0"));
          expect(result.owner).toBe("@acme");
          expect(result.packName).toBe("my-pack");
          expect(result.versionRange).toEqual(Option.some("^2.0.0"));
        }),
      );
    });

    it.effect("resolves bare pack-name to @defaultScope/packs/pack-name", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
        owner: MYORG,
      });

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const result = yield* actions.parseArgs(defaultSourceArgs("my-pack"));
          expect(result.owner).toBe("@myorg");
          expect(result.packName).toBe("my-pack");
          expect(result.resolvedInput).toBe("@myorg/packs/my-pack");
        }),
      );
    });

    it.effect("resolves bare pack-name@version with default owner", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
        owner: MYORG,
      });

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const result = yield* actions.parseArgs(defaultSourceArgs("my-pack@^2.0.0"));
          expect(result.owner).toBe("@myorg");
          expect(result.packName).toBe("my-pack");
          expect(result.versionRange).toEqual(Option.some("^2.0.0"));
          expect(result.resolvedInput).toBe("@myorg/packs/my-pack@^2.0.0");
        }),
      );
    });

    it.effect("rejects @owner/pack-name without /packs/ segment", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const error = getAppError(
            yield* actions.parseArgs(defaultSourceArgs("@acme/my-pack")).pipe(Effect.flip),
          );
          expect(error.code).toBe("usage");
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
            yield* actions.parseArgs(defaultSourceArgs("./local-path")).pipe(Effect.flip),
          );
          expect(error.code).toBe("usage");
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
            yield* actions.parseArgs(defaultSourceArgs("github:owner/repo")).pipe(Effect.flip),
          );
          expect(error.code).toBe("usage");
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
            yield* handleInstallPack(defaultHandlerArgs("./local-path"), {
              yes: false,
              force: false,
              preview: false,
            }).pipe(Effect.flip),
          );
          expect(error.detail).toContain("registry");
        }),
      );
    });

    it.effect("rejects github sources", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = getAppError(
            yield* handleInstallPack(defaultHandlerArgs("github:owner/repo"), {
              yes: false,
              force: false,
              preview: false,
            }).pipe(Effect.flip),
          );
          expect(error.detail).toContain("registry");
        }),
      );
    });

    it.effect("rejects @owner/pack-name without /packs/ segment", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      return provide(
        Effect.gen(function* () {
          const error = getAppError(
            yield* handleInstallPack(defaultHandlerArgs("@acme/my-pack"), {
              yes: false,
              force: false,
              preview: false,
            }).pipe(Effect.flip),
          );
          expect(error.code).toBe("usage");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Already installed (no explicit reinstall)
  // ---------------------------------------------------------------------------

  describe("already installed", () => {
    it.effect("creates install plan for already-installed pack", () => {
      const packRef: PackRef = {
        type: "pack",
        refType: "registry",
        pack: {
          name: extensionName("my-pack"),
          dependencies: {},
        },
        source: {
          type: "registry",
          location: new URL("file:///tmp/reg"),
          owner: Option.none(),
        },
        owner: ACME,
        name: extensionName("my-pack"),
        version: exactVersion("1.0.0"),
        integrity: Option.some("abc"),
        publisherBindingId: "hbnd_test",
        packages: [],
      };

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) =>
          options.type === "pack" ? Effect.succeed([packRef]) : Effect.succeed([]),
      };

      const { provide, logs, rendererState } = makeLayersWithMockSources(mockService, {
        verbose: true,
      });
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
            owner: ACME,
            name: "my-pack",
            resolvedVersion: "1.0.0",
            integrity: "abc",
            sourceName: "default",
            publisherBindingId: "hbnd_test",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {},
            resolvedMcpServers: {},
            resolvedSubagents: {},
          },
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultHandlerArgs("@acme/packs/my-pack"), {
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
            ...rendererState.summaries,
            JSON.stringify(rendererState.results.map((result) => result.data)),
          ].join("\n");
          // The shared workflow always builds install plan steps
          expect(allLogs).toContain("my-pack");
          expect(allLogs).toContain('"totalSteps":1');
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
            yield* handleInstallPack(defaultHandlerArgs("@acme/packs/test-pack"), {
              yes: false,
              force: false,
              preview: true,
            }).pipe(Effect.flip),
          );
          expect(error.code).toBe("validation");
          expect(rendererState.spinnerMessages).toEqual(["Resolving extension sources", "Failed"]);
        }),
      );
    });

    it.effect("shows per-extension packages alongside extension names", () => {
      const packRef: PackRef = {
        type: "pack",
        refType: "registry",
        pack: {
          name: extensionName("frontend"),
          dependencies: constraints({ "@acme/skills/react-testing": "^1.0.0" }),
        },
        source: { type: "registry", location: new URL("file:///tmp/reg"), owner: Option.none() },
        owner: ACME,
        name: extensionName("frontend"),
        version: exactVersion("1.0.0"),
        integrity: Option.none(),
        publisherBindingId: "hbnd_test",
        packages: [],
      };

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          if (options.type === "skill") {
            return Effect.succeed([
              {
                type: "skill" as const,
                refType: "registry" as const,
                skill: {
                  name: extensionName("react-testing"),
                  description: Option.none(),
                  metadata: Option.none(),
                },
                source: {
                  type: "registry" as const,
                  location: new URL("file:///tmp/reg"),
                  owner: Option.none(),
                },
                owner: ACME,
                name: extensionName("react-testing"),
                version: exactVersion("1.2.0"),
                integrity: Option.none(),
                publisherBindingId: "hbnd_test",
                packages: [{ type: decodePackageType("npm"), name: "react" }],
              },
            ]);
          }
          return Effect.succeed([]);
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide, logs } = makeLayersWithMockSources(mockService, {
        nonInteractive: true,
      });

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultHandlerArgs("@acme/packs/frontend"), {
            yes: false,
            force: false,
            preview: true,
          });

          const output = [...logs.info, ...logs.message, ...logs.success].join("\n");
          expect(output).toContain("react-testing (pkg:npm/react)");
        }),
      );
    });

    it.effect("shows no compatibility info when extensions have no packages", () => {
      const packRef: PackRef = {
        type: "pack",
        refType: "registry",
        pack: {
          name: extensionName("basic-pack"),
          dependencies: constraints({ "@acme/skills/plain-skill": "^1.0.0" }),
        },
        source: { type: "registry", location: new URL("file:///tmp/reg"), owner: Option.none() },
        owner: ACME,
        name: extensionName("basic-pack"),
        version: exactVersion("1.0.0"),
        integrity: Option.none(),
        publisherBindingId: "hbnd_test",
        packages: [],
      };

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) => {
          if (options.type === "pack") return Effect.succeed([packRef]);
          if (options.type === "skill") {
            return Effect.succeed([
              {
                type: "skill" as const,
                refType: "registry" as const,
                skill: {
                  name: extensionName("plain-skill"),
                  description: Option.none(),
                  metadata: Option.none(),
                },
                source: {
                  type: "registry" as const,
                  location: new URL("file:///tmp/reg"),
                  owner: Option.none(),
                },
                owner: ACME,
                name: extensionName("plain-skill"),
                version: exactVersion("1.0.0"),
                integrity: Option.none(),
                publisherBindingId: "hbnd_test",
                packages: [],
              },
            ]);
          }
          return Effect.succeed([]);
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide, logs } = makeLayersWithMockSources(mockService, {
        nonInteractive: true,
      });

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultHandlerArgs("@acme/packs/basic-pack"), {
            yes: false,
            force: false,
            preview: true,
          });

          const output = [...logs.info, ...logs.message, ...logs.success].join("\n");
          // Extension name shows up without any parenthesized compatibility info
          expect(output).toContain("plain-skill");
          expect(output).not.toContain("pkg:");
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
        skills?: ReturnType<typeof dependencyConstraintMap>;
        hooks?: ReturnType<typeof dependencyConstraintMap>;
        mcpServers?: ReturnType<typeof dependencyConstraintMap>;
      },
    ): PackRef => ({
      type: "pack",
      refType: "registry",
      pack: {
        name: extensionName(name),
        dependencies: {
          ...(opts?.skills ?? {}),
          ...(opts?.hooks ?? {}),
          ...(opts?.mcpServers ?? {}),
        },
      },
      source: { type: "registry", location: new URL("file:///tmp/reg"), owner: Option.none() },
      owner: ACME,
      name: extensionName(name),
      version: exactVersion("1.0.0"),
      integrity: Option.none(),
      publisherBindingId: "hbnd_test",
      packages: [],
    });

    it.effect("builds plan from pack ref returned by sources.find", () => {
      const packRef = makePackRef("test-pack", {
        skills: constraints({ "@acme/skills/code-review": "^1.0.0" }),
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
                  name: extensionName("code-review"),
                  description: Option.none(),
                  metadata: Option.none(),
                },
                source: {
                  type: "registry",
                  location: new URL("file:///tmp/reg"),
                  owner: Option.none(),
                },
                owner: ACME,
                name: extensionName("code-review"),
                version: exactVersion("1.2.3"),
                integrity: Option.none(),
                publisherBindingId: "hbnd_test",
                packages: [],
              },
            ]);
          }
          return Effect.succeed([]);
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide, logs } = makeLayersWithMockSources(mockService, { verbose: true });

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultHandlerArgs("@acme/packs/test-pack"), {
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

      const packRef = {
        ...makePackRef("test-pack"),
        version: exactVersion("2.1.0"),
      } satisfies PackRef;
      fs.writeFileSync(
        path.join(packArchiveDir, "pack.json"),
        JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "test-pack",
          version: "2.1.0",
          dependencies: {},
        }),
      );

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
          return Effect.fail(
            makeAppError({
              code: "internal",
              detail: "Unexpected fetch call",
            }),
          );
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultHandlerArgs("@acme/packs/test-pack@^2.0.0"), {
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
          if (options.type === "skill") {
            return Effect.succeed([
              {
                type: "skill",
                refType: "registry",
                skill: {
                  name: extensionName("existing-skill"),
                  description: Option.none(),
                  metadata: Option.none(),
                },
                source: {
                  type: "registry",
                  location: new URL("file:///tmp/reg"),
                  owner: Option.none(),
                },
                owner: ACME,
                name: extensionName("existing-skill"),
                version: exactVersion("1.0.0"),
                integrity: Option.none(),
                publisherBindingId: "hbnd_test",
                packages: [],
              },
            ]);
          }
          if (options.type === "hook") {
            return Effect.succeed([
              {
                type: "hook",
                refType: "registry",
                hook: { name: extensionName("existing-cmd") },
                source: {
                  type: "registry",
                  location: new URL("file:///tmp/reg"),
                  owner: Option.none(),
                },
                owner: ACME,
                name: extensionName("existing-cmd"),
                version: exactVersion("1.0.0"),
                integrity: Option.none(),
                publisherBindingId: "hbnd_test",
                packages: [],
              },
            ]);
          }
          return Effect.succeed([]);
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
        lockfilePacks: {
          "test-pack": {
            type: "registry",
            owner: ACME,
            name: "test-pack",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "default",
            publisherBindingId: "hbnd_test",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {},
            resolvedMcpServers: {},
            resolvedSubagents: {},
          },
        },
      });

      const { provide, logs, rendererState } = makeLayersWithMockSources(mockService, {
        verbose: true,
      });

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultHandlerArgs("@acme/packs/test-pack"), {
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
            ...rendererState.summaries,
            JSON.stringify(rendererState.results.map((result) => result.data)),
          ].join("\n");
          // New shared workflow always creates install steps
          expect(allLogs).toContain("test-pack");
          expect(allLogs).toContain('"totalSteps":1');
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
            yield* handleInstallPack(defaultHandlerArgs("@acme/packs/nonexistent"), {
              yes: false,
              force: false,
              preview: false,
            }).pipe(Effect.flip),
          );
          expect(error.code).toBe("not_found");
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
                code: "internal",
                detail: "remote registry not yet supported",
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

      const { provide, logs } = makeLayersWithMockSources(mockService, { verbose: true });

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultHandlerArgs("@acme/packs/effect"), {
            yes: false,
            force: false,
            preview: false,
          });
          expect(attemptedRemote).toBe(true);
          expect(attemptedFile).toBe(true);
          expect(
            logs.info.some((line) => line.includes("Registry source: local (file:///tmp/reg)")),
          ).toBe(true);
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
                code: "internal",
                detail: "remote registry not yet supported",
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
        owner: AXM,
        sources: [
          { type: "registry", name: "remote", location: "http://localhost:4300" },
          { type: "registry", name: "local", location: "file:///tmp/reg" },
        ],
      });

      const { provide, logs } = makeLayersWithMockSources(mockService, { verbose: true });

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultHandlerArgs("effect"), {
            yes: false,
            force: false,
            preview: false,
          });

          expect(
            logs.info.some((line) =>
              line.includes("Source resolution: effect -> @axm/packs/effect"),
            ),
          ).toBe(true);
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

    it.effect("builds skill, hook, and mcp-server ops from pack resolved maps", () => {
      const packRef = makePackRef("multi-pack", {
        skills: constraints({ "@acme/skills/code-review": "1.0.0" }),
        hooks: constraints({ "@acme/hooks/lint": "2.0.0" }),
        mcpServers: constraints({ "@acme/mcps/analytics": "3.0.0" }),
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
                  name: extensionName("code-review"),
                  description: Option.none(),
                  metadata: Option.none(),
                },
                source: {
                  type: "registry",
                  location: new URL("file:///tmp/reg"),
                  owner: Option.none(),
                },
                owner: ACME,
                name: extensionName("code-review"),
                version: exactVersion("1.0.0"),
                integrity: Option.none(),
                publisherBindingId: "hbnd_test",
                packages: [],
              },
            ]);
          }
          if (options.type === "hook") {
            return Effect.succeed([
              {
                type: "hook",
                refType: "registry",
                hook: { name: extensionName("lint") },
                source: {
                  type: "registry",
                  location: new URL("file:///tmp/reg"),
                  owner: Option.none(),
                },
                owner: ACME,
                name: extensionName("lint"),
                version: exactVersion("2.0.0"),
                integrity: Option.none(),
                publisherBindingId: "hbnd_test",
                packages: [],
              },
            ]);
          }
          if (options.type === "mcp-server") {
            return Effect.succeed([
              {
                type: "mcp-server",
                refType: "registry",
                server: { name: extensionName("analytics") },
                source: {
                  type: "registry",
                  location: new URL("file:///tmp/reg"),
                  owner: Option.none(),
                },
                owner: ACME,
                name: extensionName("analytics"),
                version: exactVersion("3.0.0"),
                integrity: Option.none(),
                publisherBindingId: "hbnd_test",
                packages: [],
              },
            ]);
          }
          return Effect.succeed([]);
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
      });

      const { provide, logs, rendererState } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultHandlerArgs("@acme/packs/multi-pack"), {
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
            ...rendererState.summaries,
            JSON.stringify(rendererState.results.map((result) => result.data)),
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
        skills: constraints({ "@acme/skills/existing-skill": "1.0.0" }),
        hooks: constraints({ "@acme/hooks/existing-cmd": "1.0.0" }),
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
                  name: extensionName("existing-skill"),
                  description: Option.none(),
                  metadata: Option.none(),
                },
                source: {
                  type: "registry",
                  location: new URL("file:///tmp/reg"),
                  owner: Option.none(),
                },
                owner: ACME,
                name: extensionName("existing-skill"),
                version: exactVersion("1.0.0"),
                integrity: Option.none(),
                publisherBindingId: "hbnd_test",
                packages: [],
              },
            ]);
          }
          if (options.type === "hook") {
            return Effect.succeed([
              {
                type: "hook",
                refType: "registry",
                hook: { name: extensionName("existing-cmd") },
                source: {
                  type: "registry",
                  location: new URL("file:///tmp/reg"),
                  owner: Option.none(),
                },
                owner: ACME,
                name: extensionName("existing-cmd"),
                version: exactVersion("1.0.0"),
                integrity: Option.none(),
                publisherBindingId: "hbnd_test",
                packages: [],
              },
            ]);
          }
          return Effect.succeed([]);
        },
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
        lockfileSkills: {
          "existing-skill": {
            type: "registry",
            owner: ACME,
            name: "existing-skill",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "default",
            publisherBindingId: "hbnd_test",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      });

      const { provide, logs, rendererState } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultHandlerArgs("@acme/packs/dep-pack"), {
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
            ...rendererState.summaries,
            JSON.stringify(rendererState.results.map((result) => result.data)),
          ].join("\n");
          // Dependency extensions are included in the install plan
          expect(allLogs).toContain("existing-skill");
          expect(allLogs).toContain("existing-cmd");
          expect(allLogs).toContain('"totalSteps":1');
        }),
      );
    });

    it.effect("adds uninstall step for dependencies dropped by a newer pack version", () => {
      const packRef = makePackRef("prune-pack", {
        skills: constraints({ "@acme/skills/kept-skill": "1.0.0" }),
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
                  name: extensionName("kept-skill"),
                  description: Option.none(),
                  metadata: Option.none(),
                },
                source: {
                  type: "registry",
                  location: new URL("file:///tmp/reg"),
                  owner: Option.none(),
                },
                owner: ACME,
                name: extensionName("kept-skill"),
                version: exactVersion("1.0.0"),
                integrity: Option.none(),
                publisherBindingId: "hbnd_test",
                packages: [],
              },
            ]);
          }
          return Effect.succeed([]);
        },
      };

      const packDir = path.join(tempDir, ".axm", "extensions", "@acme", "packs", "prune-pack");
      fs.mkdirSync(packDir, { recursive: true });
      fs.writeFileSync(
        path.join(packDir, "pack.json"),
        JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "prune-pack",
          version: "1.0.0",
          dependencies: {
            "@acme/skills/kept-skill": "1.0.0",
            "@acme/skills/dropped-skill": "1.0.0",
          },
        }),
      );

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
        settingsPacks: { "prune-pack": "@acme/packs/prune-pack" },
        lockfilePacks: {
          "prune-pack": {
            type: "registry",
            owner: ACME,
            name: "prune-pack",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "default",
            publisherBindingId: "hbnd_test",
            sourceHash: computePackageContentHashSync(packDir),
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {
              "@acme/skills/kept-skill": {
                version: "1.0.0",
                publisherBindingId: "hbnd_test",
              },
              "@acme/skills/dropped-skill": {
                version: "1.0.0",
                publisherBindingId: "hbnd_test",
              },
            },
            resolvedMcpServers: {},
            resolvedSubagents: {},
          },
        },
      });
      writeTrustFromWorkspaceLockfile(path.join(tempDir, ".axm"));

      const { provide } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const plan = yield* actions.buildPlan({
            packToInstall: packRef,
            versionRange: Option.none(),
          });

          const steps = plan.jobs.flatMap((job) => job.steps);
          expect(steps.map((step) => step.label)).toEqual(["@acme/packs/prune-pack"]);
          expect(steps[0]?.artifact?.targets).toEqual([
            {
              path: ".axm/extensions/@acme/packs/prune-pack",
              change: "updated",
            },
            {
              path: ".axm/extensions/@acme/skills/kept-skill",
              change: "updated",
            },
            {
              path: ".axm/extensions/@acme/skills/dropped-skill",
              change: "removed",
            },
          ]);
        }),
      );
    });

    it.effect("keeps dropped dependency when it is directly configured in settings", () => {
      const packRef = makePackRef("prune-pack");

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: (_source, options) =>
          options.type === "pack" ? Effect.succeed([packRef]) : Effect.succeed([]),
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "default", location: "file:///tmp/reg" }],
        settingsSkills: {
          "dropped-skill": "@acme/skills/dropped-skill",
        },
        lockfilePacks: {
          "prune-pack": {
            type: "registry",
            owner: ACME,
            name: "prune-pack",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "default",
            publisherBindingId: "hbnd_test",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {
              "@acme/skills/dropped-skill": {
                version: "1.0.0",
                publisherBindingId: "hbnd_test",
              },
            },
            resolvedMcpServers: {},
            resolvedSubagents: {},
          },
        },
      });

      const { provide } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const plan = yield* actions.buildPlan({
            packToInstall: packRef,
            versionRange: Option.none(),
          });

          const steps = plan.jobs.flatMap((job) => job.steps);
          expect(steps.map((step) => step.label)).toEqual(["@acme/packs/prune-pack"]);
          expect(steps[0]?.artifact?.targets?.some((target) => target.change === "removed")).toBe(
            false,
          );
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Explicit reinstall propagation to workspace previewOrApplyPlan
  // ---------------------------------------------------------------------------

  describe("readiness gate", () => {
    it.effect("rejects plan errors even when confirmation is bypassed", () => {
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
          const result = yield* previewOrApplyPlan(plan, {
            yes: true,
            preview: false,
          }).pipe(Effect.flip);
          expect(logs.warn).toEqual([]);
          expect(result).toMatchObject({
            code: "conflict",
            detail: "Plan has errors that prevent execution",
          });
        }),
      );
    });
  });
});
