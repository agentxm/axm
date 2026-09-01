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
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { afterEach, beforeEach, vi } from "vitest";
import {
  displayPlan,
  TestRenderer,
  logsByTag,
} from "@agentxm/extension-management/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/extension-management/unstable/cli-flags";
import {
  WorkspaceMutations,
  type WorkspaceMutationsOptions,
  computePackManifestContentIdentity,
} from "@agentxm/workspace-state";
import { layer as coreWorkspaceLayer } from "@agentxm/workspace-operations/live";
import { type PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { previewOrApplyPlan, deriveOperationOutcome } from "@agentxm/workspace-operations";
import { ResolvePlanInteractionTest } from "@agentxm/workspace-operations/testing";
import { preapprovedPlanExecution } from "@agentxm/workspace-operations";
import type { ExtensionFiles } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import {
  SourceHostProvidersLive,
  SourceHostProviders,
} from "@agentxm/extension-management/unstable/source-resolution";
import type { SourceHostProvidersService } from "@agentxm/extension-management/unstable/source-resolution";
import { handleInstallPack } from "./handler.js";
import {
  type InstallPackHandlerArgs,
  InstallPackCommandWorkflowActions,
} from "./command-actions.js";
import type { PackInstallHandlerArgs } from "./handler.js";
import { SkillManagerLive } from "@agentxm/extension-management/unstable/skills";
import { PackManagerLive } from "@agentxm/extension-management/unstable/packs";
import { HookManagerLive } from "@agentxm/extension-management/unstable/hooks";
import { KnowledgeManagerLive } from "@agentxm/extension-management/unstable/knowledge";
import { McpServerManagerLive } from "@agentxm/extension-management/unstable/mcps";
import { RuleManagerLive } from "@agentxm/extension-management/unstable/rules";
import { SubagentManagerLive } from "@agentxm/extension-management/unstable/subagents";
import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { CodingAgentRepositoryLive } from "@agentxm/extension-management/unstable/extension-workspace";
import { WorkspaceCatalogLive } from "@agentxm/extension-management/unstable/cli-runtime";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging";
import {
  computePackageContentHashSync,
  dependencyConstraintMap,
  exactVersion,
  extensionName,
  writeWorkspaceFiles,
} from "../../../test-stubs.js";
import { getAppError } from "../../../test-helpers.js";
import { toPlanResolutionResult } from "../../../operation-output.js";

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
  resolveNamedRegistry: () => Effect.die("unused"),
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
  writeWorkspaceFiles(axmDir, {
    owner: opts?.owner ?? "@acme",
    packs: opts?.settingsPacks,
    skills: opts?.settingsSkills,
    sources: opts?.sources,
    lockfilePacks: opts?.lockfilePacks,
    lockfileSkills: opts?.lockfileSkills,
  });
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
    const flagsLayer = TestFlagsLayer(flagsOverrides);
    const resolvePlanInteraction = ResolvePlanInteractionTest({
      isConfirmationAvailable: flagsOverrides?.nonInteractive === false,
      confirmApplyChanges: () =>
        Effect.succeed(
          (tuiConfig?.confirmValue ?? true) ? ("approved" as const) : ("declined" as const),
        ),
      presentPlan: (plan, options) =>
        displayPlan(plan, options).pipe(Effect.provide(Layer.mergeAll(rendererLayer, flagsLayer))),
    });
    const BaseLayer = Layer.mergeAll(
      NodeServices.layer,
      FetchHttpClient.layer,
      rendererLayer,
      resolvePlanInteraction.layer,
      flagsLayer,
    );
    const wsOptions: WorkspaceMutationsOptions = {
      scope: "project",
      projectRoot: decodeAbsolutePathSync(tempDir),
    };
    const WsLayer = Layer.provide(
      coreWorkspaceLayer({
        ...wsOptions,
      }),
      BaseLayer,
    );
    const CatalogLayer = Layer.provide(
      WorkspaceCatalogLive,
      Layer.mergeAll(BaseLayer, WsLayer, CodingAgentRepositoryLive),
    );
    const SPLayer = Layer.provide(
      SourceHostProvidersLive,
      Layer.mergeAll(BaseLayer, WsLayer, CatalogLayer),
    );
    const ManagersLayer = Layer.mergeAll(
      PackManagerLive,
      SkillManagerLive,
      HookManagerLive,
      KnowledgeManagerLive,
      RuleManagerLive,
      McpServerManagerLive,
      SubagentManagerLive,
    );
    const CoreLayer = Layer.mergeAll(
      BaseLayer,
      WsLayer,
      CatalogLayer,
      SPLayer,
      CodingAgentRepositoryLive,
    );
    const MgrLayer = Layer.provide(ManagersLayer, CoreLayer);
    const FullLayer = Layer.merge(CoreLayer, MgrLayer);

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
    const flagsLayer = TestFlagsLayer(flagsOverrides);
    const resolvePlanInteraction = ResolvePlanInteractionTest({
      isConfirmationAvailable: flagsOverrides?.nonInteractive === false,
      confirmApplyChanges: () => Effect.succeed("approved" as const),
      presentPlan: (plan, options) =>
        displayPlan(plan, options).pipe(Effect.provide(Layer.mergeAll(rendererLayer, flagsLayer))),
    });
    const BaseLayer = Layer.mergeAll(
      NodeServices.layer,
      FetchHttpClient.layer,
      rendererLayer,
      resolvePlanInteraction.layer,
      flagsLayer,
    );
    const wsOptions: WorkspaceMutationsOptions = {
      scope: "project",
      projectRoot: decodeAbsolutePathSync(tempDir),
    };
    const WsLayer = Layer.provide(
      coreWorkspaceLayer({
        ...wsOptions,
      }),
      BaseLayer,
    );
    const CatalogLayer = Layer.provide(
      WorkspaceCatalogLive,
      Layer.mergeAll(BaseLayer, WsLayer, CodingAgentRepositoryLive),
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
    const CoreLayer = Layer.mergeAll(
      BaseLayer,
      WsLayer,
      CatalogLayer,
      SPLayer,
      CodingAgentRepositoryLive,
    );
    const MgrLayer = Layer.provide(ManagersLayer, CoreLayer);
    const FullLayer = Layer.merge(CoreLayer, MgrLayer);

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
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
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
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
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
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
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
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
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
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
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
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
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
          name: "agentxm",
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
            name: "agentxm",
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
            sourceName: "agentxm",
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
          expect(allLogs).toContain('"total":1');
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
        source: {
          type: "registry",
          name: "agentxm",
          location: new URL("file:///tmp/reg"),
          owner: Option.none(),
        },
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
                  name: "agentxm",
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
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
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
        source: {
          type: "registry",
          name: "agentxm",
          location: new URL("file:///tmp/reg"),
          owner: Option.none(),
        },
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
                  name: "agentxm",
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
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
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
      source: {
        type: "registry",
        name: "agentxm",
        location: new URL("file:///tmp/reg"),
        owner: Option.none(),
      },
      owner: ACME,
      name: extensionName(name),
      version: exactVersion("1.0.0"),
      integrity: Option.none(),
      publisherBindingId: "hbnd_test",
      packages: [],
    });

    const writeWorkspaceSkill = (name: string, version = "1.0.0") => {
      const root = path.join(tempDir, "skills", name);
      fs.mkdirSync(path.join(root, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "skill.json"),
        JSON.stringify({ owner: "@acme", type: "skill", name, version }),
      );
      fs.writeFileSync(path.join(root, "src", "SKILL.md"), `# ${name}\n`);
      return { root: fs.realpathSync(root), sourceHash: computePackageContentHashSync(root) };
    };

    it.effect("hard-blocks a Registry reinstall over workspace pack authority", () => {
      const packRef = makePackRef("test-pack");
      initWorkspace(path.join(tempDir, ".axm"), {
        settingsPacks: { "test-pack": "workspace" },
      });
      const { provide } = makeLayersWithMockSources(serviceStubs);

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const plan = yield* actions.buildPlan({
            packToInstall: packRef,
            versionRange: Option.none(),
          });
          expect(plan.jobs).toHaveLength(1);
          expect(plan.jobs[0]?.steps).toHaveLength(1);
          expect(plan.jobs[0]?.steps[0]).toMatchObject({
            readiness: "error",
            errorMessage: expect.stringContaining("workspace-sourced pack"),
          });
          expect(plan.riskConditions).toHaveLength(1);

          const resolution = yield* previewOrApplyPlan(plan, {
            execution: preapprovedPlanExecution,
          });
          expect(deriveOperationOutcome(resolution)).toBe("blocked");
          expect(resolution).toMatchObject({
            _tag: "OperationResolution",
            blocking: expect.objectContaining({
              class: "precondition-unmet",
              phase: "planning",
              detail: expect.stringContaining("workspace-sourced pack"),
              causeCode: "conflict",
            }),
            suggestions: [expect.objectContaining({ description: expect.any(String) })],
          });
          expect(resolution.riskConditions).toHaveLength(1);
          expect(toPlanResolutionResult(resolution)).toMatchObject({
            outcome: "blocked",
            mode: "apply",
            blocking: expect.objectContaining({
              class: "precondition-unmet",
              causeCode: "conflict",
            }),
            candidateId: expect.any(String),
            counts: expect.objectContaining({
              total: 1,
              ready: 0,
              blocked: 1,
              failed: 0,
            }),
            units: [expect.objectContaining({ state: "blocked" })],
          });
        }),
      );
    });

    it.effect("reports every unusable workspace member without Registry fallback", () => {
      const packRef = makePackRef("test-pack", {
        skills: constraints({
          "@acme/skills/alpha": "^1.0.0",
          "@acme/skills/beta": "^1.0.0",
        }),
      });
      const find = vi.fn(() => Effect.succeed([]));
      initWorkspace(path.join(tempDir, ".axm"), {
        settingsSkills: {
          alpha: "workspace",
          beta: "workspace",
        },
      });
      const { provide } = makeLayersWithMockSources({ ...serviceStubs, find });

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const plan = yield* actions.buildPlan({
            packToInstall: packRef,
            versionRange: Option.none(),
          });
          expect(plan.riskConditions).toHaveLength(2);
          expect(plan.riskConditions?.map((condition) => condition.detail)).toEqual([
            expect.stringContaining("alpha"),
            expect.stringContaining("beta"),
          ]);
          expect(plan.jobs[0]?.steps).toHaveLength(1);
          expect(find).not.toHaveBeenCalled();
        }),
      );
    });

    it.effect("reuses a compatible workspace member and revalidates it before apply", () => {
      const packRef = makePackRef("test-pack", {
        skills: constraints({ "@acme/skills/review": "^1.0.0" }),
      });
      const workspaceSkill = writeWorkspaceSkill("review", "1.4.0");
      const find = vi.fn(() => Effect.succeed([]));
      initWorkspace(path.join(tempDir, ".axm"), {
        settingsSkills: { review: "workspace" },
      });
      const { provide } = makeLayersWithMockSources({ ...serviceStubs, find });

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const plan = yield* actions.buildPlan({
            packToInstall: packRef,
            versionRange: Option.none(),
          });
          expect(plan.riskConditions).toBeUndefined();
          const step = plan.jobs[0]?.steps[0];
          if (step?.readiness !== "ready") throw new Error("Expected a ready graph step");
          // Temp-dir paths may or may not be symlink-resolved depending on the
          // platform, so compare real paths instead of raw strings.
          const reusedTarget = (step.artifact?.targets ?? []).find(
            (target) =>
              path.isAbsolute(target.path) &&
              fs.existsSync(target.path) &&
              fs.realpathSync(target.path) === workspaceSkill.root,
          );
          expect(reusedTarget).toMatchObject({ change: "unchanged" });
          expect(find).not.toHaveBeenCalled();

          fs.appendFileSync(
            path.join(workspaceSkill.root, "src", "SKILL.md"),
            "changed after preview\n",
          );
          const graphStep = plan.jobs[0]?.steps[0];
          if (graphStep?.readiness !== "ready") throw new Error("Expected a ready graph step");
          const error = yield* graphStep.run.pipe(Effect.flip);
          expect(error).toMatchObject({
            _tag: "StepFailure",
            category: "conflict",
            detail: expect.stringContaining("authority changed"),
          });
          expect(fs.existsSync(path.join(tempDir, "packs"))).toBe(false);
        }),
      );
    });

    it.effect(
      "continues root updates but blocks fresh targeted graphs for held dependencies",
      () => {
        const packRef = makePackRef("test-pack", {
          skills: constraints({ "@acme/skills/code-review": "^1.0.0" }),
        });
        const mockService: SourceHostProvidersService = {
          ...serviceStubs,
          resolveNamedRegistry: (_source, options) =>
            Effect.succeed({
              kind: "policy_held",
              target: `${options.owner}/skills/${options.name}`,
              requestedRange: "^1.0.0",
              candidate: {
                version: "1.1.0",
                publishedAt: "2026-08-11T12:00:00.000Z",
                eligibleAt: "2026-08-12T12:00:00.000Z",
                minimumReleaseAgeSeconds: 86_400,
              },
            }),
        };
        initWorkspace(path.join(tempDir, ".axm"), {
          sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
        });
        const { provide } = makeLayersWithMockSources(mockService);
        const releaseAgeEvaluation = {
          minimumReleaseAge: Duration.hours(24),
          evaluatedAt: DateTime.makeUnsafe("2026-08-12T00:00:00Z"),
          mode: "enforce" as const,
        };

        return provide(
          Effect.gen(function* () {
            const actions = yield* InstallPackCommandWorkflowActions;
            const rootPlan = yield* actions.buildPlan({
              packToInstall: packRef,
              versionRange: Option.none(),
              unattended: true,
              releaseAgeEvaluation,
              releaseAgeHoldbackBehavior: "continue",
            });
            expect(rootPlan.jobs).toEqual([]);
            expect(rootPlan.riskConditions).toBeUndefined();
            expect(rootPlan.releaseAge).toMatchObject({
              holdbacks: [
                {
                  dependencyPath: ["@acme/packs/test-pack", "@acme/skills/code-review"],
                },
              ],
            });

            const targetedPlan = yield* actions.buildPlan({
              packToInstall: packRef,
              versionRange: Option.none(),
              unattended: true,
              releaseAgeEvaluation,
              releaseAgeHoldbackBehavior: "preserve-or-block",
            });
            expect(targetedPlan.jobs).toEqual([]);
            expect(targetedPlan.riskConditions).toMatchObject([
              { level: "blocked", id: "minimum-release-age", errorCode: "conflict" },
            ]);
          }),
        );
      },
    );

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
                  name: "agentxm",
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
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
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
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
      });

      const { provide } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          yield* handleInstallPack(defaultHandlerArgs("@acme/packs/test-pack@^2.0.0"), {
            yes: false,
            force: false,
            preview: false,
          });

          const settingsContent = fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8");
          const settingsJson: { packs?: Record<string, string> } = JSON.parse(settingsContent);
          expect(settingsJson.packs?.["test-pack"]).toBe("agentxm:@acme/packs/test-pack@^2.0.0");
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
                  name: "agentxm",
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
                  name: "agentxm",
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
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
        lockfilePacks: {
          "test-pack": {
            type: "registry",
            owner: ACME,
            name: "test-pack",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "agentxm",
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
          expect(allLogs).toContain('"total":1');
        }),
      );
    });

    it.effect("fails when pack not found in registry", () => {
      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: () => Effect.succeed([]),
      };

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
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

    it.effect("routes unqualified pack input only through the agentxm registry", () => {
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
          { type: "registry", name: "agentxm", location: "file:///tmp/reg" },
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
          expect(attemptedRemote).toBe(false);
          expect(attemptedFile).toBe(true);
          expect(
            logs.info.some((line) => line.includes("Registry source: agentxm (file:///tmp/reg)")),
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
          { type: "registry", name: "agentxm", location: "file:///tmp/reg" },
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
                !line.includes("http://localhost:4300/") &&
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
                  name: "agentxm",
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
                  name: "agentxm",
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
                  name: "agentxm",
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
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
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
                  name: "agentxm",
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
                  name: "agentxm",
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
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
        lockfileSkills: {
          "existing-skill": {
            type: "registry",
            owner: ACME,
            name: "existing-skill",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "agentxm",
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
          expect(allLogs).toContain('"total":1');
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
                  name: "agentxm",
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

      const packDir = path.join(
        tempDir,
        "agent_extensions",
        "agentxm",
        "@acme",
        "packs",
        "prune-pack",
      );
      fs.mkdirSync(packDir, { recursive: true });
      const currentManifest = {
        owner: "@acme",
        type: "pack" as const,
        name: "prune-pack",
        version: "1.0.0",
        dependencies: {
          "@acme/skills/kept-skill": "1.0.0",
          "@acme/skills/dropped-skill": "1.0.0",
        },
      };
      fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify(currentManifest));

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
        settingsPacks: { "prune-pack": "@acme/packs/prune-pack" },
        lockfileSkills: {
          "dropped-skill": {
            type: "registry",
            owner: ACME,
            name: "dropped-skill",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        lockfilePacks: {
          "prune-pack": {
            type: "registry",
            owner: ACME,
            name: "prune-pack",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            manifestContentIdentity: computePackManifestContentIdentity(currentManifest),
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {
              "@acme/skills/kept-skill": {
                source: "registry",
                version: "1.0.0",
                publisherBindingId: "hbnd_test",
                integrity: "sha512-member",
              },
              "@acme/skills/dropped-skill": {
                source: "registry",
                version: "1.0.0",
                publisherBindingId: "hbnd_test",
                integrity: "sha512-member",
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
          expect(steps[0]?.artifact?.targets).toEqual([
            {
              path: "agent_extensions/agentxm/@acme/packs/prune-pack",
              change: "updated",
            },
            {
              path: "agent_extensions/agentxm/@acme/skills/kept-skill",
              change: "updated",
            },
            {
              path: "agent_extensions/agentxm/@acme/skills/dropped-skill",
              change: "removed",
            },
          ]);
        }),
      );
    });

    it.effect("preserves disabled Pack and member activation while updating", () => {
      const currentManifest = {
        owner: "@acme",
        type: "pack" as const,
        name: "disabled-pack",
        version: "1.0.0",
        dependencies: { "@acme/skills/review": "^2.0.0" },
      };
      const nextManifest = {
        ...currentManifest,
        version: "2.0.0",
      };
      const packRef = {
        ...makePackRef("disabled-pack", {
          skills: constraints(nextManifest.dependencies),
        }),
        version: exactVersion("2.0.0"),
      } satisfies PackRef;
      const currentPackDir = path.join(
        tempDir,
        "agent_extensions",
        "agentxm",
        "@acme",
        "packs",
        "disabled-pack",
      );
      const nextPackDir = path.join(tempDir, "next-disabled-pack");
      const currentSkillDir = path.join(tempDir, "skills", "review");
      fs.mkdirSync(currentPackDir, { recursive: true });
      fs.mkdirSync(nextPackDir, { recursive: true });
      fs.mkdirSync(path.join(currentSkillDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(currentPackDir, "pack.json"), JSON.stringify(currentManifest));
      fs.writeFileSync(path.join(nextPackDir, "pack.json"), JSON.stringify(nextManifest));
      fs.writeFileSync(
        path.join(currentSkillDir, "skill.json"),
        JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "2.0.0" }),
      );
      fs.writeFileSync(
        path.join(currentSkillDir, "src", "SKILL.md"),
        "---\nname: review\ndescription: Reviews code.\n---\n\n# Review\n",
      );
      const currentSkillContentIdentity = computePackageContentHashSync(currentSkillDir);

      const mockService: SourceHostProvidersService = {
        ...serviceStubs,
        find: () => Effect.succeed([]),
        fetch: (ref) =>
          ref.type === "pack"
            ? Effect.succeed({ directory: nextPackDir })
            : Effect.fail(makeAppError({ code: "internal", detail: "Unexpected Pack member" })),
      };
      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
        settingsPacks: {
          "disabled-pack": { source: "@acme/packs/disabled-pack", enabled: false },
        },
        settingsSkills: {
          review: {
            source: "workspace",
            enabled: false,
          },
        },
        lockfilePacks: {
          "disabled-pack": {
            type: "registry",
            owner: ACME,
            name: "disabled-pack",
            resolvedVersion: "1.0.0",
            integrity: "",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            manifestContentIdentity: computePackManifestContentIdentity(currentManifest),
            resolvedSkills: {
              "@acme/skills/review": {
                source: "workspace",
                version: "2.0.0",
                sourceIdentity: "workspace:@acme/skills/review",
                contentIdentity: currentSkillContentIdentity,
              },
            },
            resolvedMcpServers: {},
            resolvedSubagents: {},
          },
        },
      });
      const { provide, logs } = makeLayersWithMockSources(mockService);

      return provide(
        Effect.gen(function* () {
          const actions = yield* InstallPackCommandWorkflowActions;
          const plan = yield* actions.buildPlan({
            packToInstall: packRef,
            versionRange: Option.none(),
          });
          expect(logs.info).toContain("Pack activation:");
          expect(logs.info).toContain("  @acme/packs/disabled-pack: preserve disabled activation");

          const resolution = yield* previewOrApplyPlan(plan, {
            execution: preapprovedPlanExecution,
          });
          expect(deriveOperationOutcome(resolution)).toBe("applied");

          const workspace = yield* WorkspaceMutations;
          const graph = yield* workspace.getDesiredStateGraph();
          expect(graph.nodes).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ type: "pack", name: "disabled-pack", enabled: false }),
              expect.objectContaining({ type: "skill", name: "review", enabled: false }),
            ]),
          );
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

      const packDir = path.join(
        tempDir,
        "agent_extensions",
        "agentxm",
        "@acme",
        "packs",
        "prune-pack",
      );
      fs.mkdirSync(packDir, { recursive: true });
      const currentManifest = {
        owner: "@acme",
        type: "pack" as const,
        name: "prune-pack",
        version: "1.0.0",
        dependencies: { "@acme/skills/dropped-skill": "1.0.0" },
      };
      fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify(currentManifest));

      initWorkspace(path.join(tempDir, ".axm"), {
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/reg" }],
        settingsPacks: { "prune-pack": "@acme/packs/prune-pack" },
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
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            manifestContentIdentity: computePackManifestContentIdentity(currentManifest),
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            resolvedSkills: {
              "@acme/skills/dropped-skill": {
                source: "registry",
                version: "1.0.0",
                publisherBindingId: "hbnd_test",
                integrity: "sha512-member",
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
            execution: preapprovedPlanExecution,
          });
          expect(logs.warn).toEqual([]);
          expect(deriveOperationOutcome(result)).toBe("blocked");
          expect(result).toMatchObject({
            _tag: "OperationResolution",
            blocking: {
              class: "precondition-unmet",
              subject: "test-step",
              phase: "planning",
              detail: "Test error step",
              causeCode: "conflict",
            },
          });
        }),
      );
    });
  });
});
