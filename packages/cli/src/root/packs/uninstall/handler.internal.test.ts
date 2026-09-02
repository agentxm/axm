/**
 * Unit tests for the packs uninstall command handler.
 *
 * Tests the pack uninstall flow: plan build, orphan detection, execution.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import {
  displayPlan,
  TestMachineRenderer,
  TestRenderer,
  logsByTag,
} from "../../../cli-renderer/index.js";
import { TestFlagsLayer } from "../../../cli-flags/index.js";
import {
  type WorkspaceMutationsOptions,
  computePackManifestContentIdentity,
} from "@agentxm/workspace-state";
import { layer as coreWorkspaceLayer } from "@agentxm/workspace-operations/live";
import { ResolvePlanInteractionTest } from "@agentxm/workspace-operations/testing";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { SourceHostProvidersLive } from "@agentxm/extension-sources/live";
import { handleUninstallPack } from "./handler.js";
import { type UninstallPackHandlerArgs } from "./command-actions.js";
import { SkillManagerLive } from "@agentxm/extension-lifecycle/live";
import { PackManagerLive } from "@agentxm/extension-lifecycle/live";
import { HookManagerLive } from "@agentxm/extension-lifecycle/live";
import { KnowledgeManagerLive } from "@agentxm/extension-lifecycle/live";
import { McpServerManagerLive } from "@agentxm/extension-lifecycle/live";
import { RuleManagerLive } from "@agentxm/extension-lifecycle/live";
import { SubagentManagerLive } from "@agentxm/extension-lifecycle/live";
import { CodingAgentRepositoryLive } from "@agentxm/extension-workspace/live";
import { AxmSkillCandidateGateLive, WorkspaceCatalogLive } from "../../../cli-runtime/index.js";
import {
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  property,
} from "../../../test-helpers.js";
import { PACK_UNINSTALL_GRAPH_BLOCKER_ID } from "./readiness.js";
import { writeWorkspaceFiles } from "../../../test-stubs.js";
import { LifecycleFailureAdapterLive } from "../../../feature-errors.js";
import { LifecycleResolutionProgressLive } from "../../../lifecycle-interaction.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  opts?: {
    lockfileSkills?: Record<string, unknown>;
    lockfilePacks?: Record<string, unknown>;
    settingsSkills?: Record<string, unknown>;
    settingsPacks?: Record<string, unknown>;
  },
) => {
  const projectRoot = path.basename(axmDir) === ".axm" ? path.dirname(axmDir) : axmDir;
  const lockfilePacks: Record<string, unknown> = { ...(opts?.lockfilePacks ?? {}) };
  for (const [name, value] of Object.entries(lockfilePacks)) {
    if (typeof value !== "object" || value === null) continue;
    const owner = Reflect.get(value, "owner");
    const resolvedVersion = Reflect.get(value, "resolvedVersion");
    const workspaceVersion = Reflect.get(value, "version");
    const version =
      typeof resolvedVersion === "string"
        ? resolvedVersion
        : typeof workspaceVersion === "string"
          ? workspaceVersion
          : undefined;
    if (typeof owner !== "string" || typeof version !== "string") continue;
    const dependencyMaps = [
      Reflect.get(value, "resolvedSkills"),
      Reflect.get(value, "resolvedMcpServers"),
      Reflect.get(value, "resolvedSubagents"),
    ];
    const dependencies: Record<string, string> = {};
    for (const dependencyMap of dependencyMaps) {
      if (typeof dependencyMap !== "object" || dependencyMap === null) continue;
      for (const [fqn, resolved] of Object.entries(dependencyMap)) {
        const resolvedVersion =
          typeof resolved === "object" && resolved !== null
            ? Reflect.get(resolved, "version")
            : null;
        if (typeof resolvedVersion === "string") dependencies[fqn] = resolvedVersion;
      }
    }
    const packDir =
      Reflect.get(value, "type") === "workspace"
        ? path.join(projectRoot, "packs", name)
        : path.join(projectRoot, "agent_extensions", "agentxm", owner, "packs", name);
    fs.mkdirSync(packDir, { recursive: true });
    const manifest = { owner, type: "pack" as const, name, version, dependencies };
    fs.writeFileSync(path.join(packDir, "pack.json"), JSON.stringify(manifest));
    if (Reflect.get(value, "type") === "workspace") {
      continue;
    }
    lockfilePacks[name] = {
      ...value,
      manifestContentIdentity: computePackManifestContentIdentity(manifest),
    };
  }
  writeWorkspaceFiles(path.join(projectRoot, ".axm"), {
    owner: "@acme",
    skills: opts?.settingsSkills,
    packs: opts?.settingsPacks,
    lockfileSkills: opts?.lockfileSkills,
    lockfilePacks,
  });
};

const defaultArgs = (
  name: string,
  overrides: Partial<UninstallPackHandlerArgs> = {},
): UninstallPackHandlerArgs => ({
  name,
  ...overrides,
});

type RawResolvedExtensionMap = Record<
  string,
  {
    readonly source: "registry";
    readonly version: string;
    readonly publisherBindingId: string;
    readonly integrity: string;
  }
>;

const resolvedRegistryMember = (version: string) => ({
  source: "registry" as const,
  version,
  publisherBindingId: "hbnd_test",
  integrity: "sha512-member",
});

const makePackLockEntry = (
  owner: string,
  name: string,
  overrides?: {
    resolvedSkills?: RawResolvedExtensionMap;
    resolvedMcpServers?: RawResolvedExtensionMap;
    resolvedSubagents?: RawResolvedExtensionMap;
  },
) => ({
  type: "registry",
  owner,
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  sourceName: "agentxm",
  publisherBindingId: "hbnd_test",
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  resolvedSkills: overrides?.resolvedSkills ?? {},
  resolvedMcpServers: overrides?.resolvedMcpServers ?? {},
  resolvedSubagents: overrides?.resolvedSubagents ?? {},
});

const makeWorkspacePackLockEntry = (owner: string, name: string) => ({
  type: "workspace",
  owner,
  extensionType: "pack",
  name,
  version: "0.0.1",
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  resolvedSkills: {},
  resolvedMcpServers: {},
  resolvedSubagents: {},
  resolvedRules: {},
  resolvedHooks: {},
  resolvedKnowledge: {},
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("packs uninstall handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "packs-uninstall-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (
    tuiConfig?: {
      confirmValue?: boolean;
      machine?: boolean;
    },
    wsOverrides?: Partial<WorkspaceMutationsOptions>,
  ) => {
    const { layer: rendererLayer, state: rendererState } =
      tuiConfig?.machine === true ? TestMachineRenderer.make() : TestRenderer.make();
    const flagsLayer = TestFlagsLayer();
    const resolvePlanInteraction = ResolvePlanInteractionTest({
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
      ...wsOverrides,
      projectRoot: wsOverrides?.projectRoot ?? decodeAbsolutePathSync(tempDir),
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
      Layer.mergeAll(BaseLayer, WsLayer, CatalogLayer, AxmSkillCandidateGateLive),
    );
    const ManagersLayer = Layer.mergeAll(
      PackManagerLive,
      SkillManagerLive,
      HookManagerLive,
      KnowledgeManagerLive,
      McpServerManagerLive,
      RuleManagerLive,
      SubagentManagerLive,
    );
    const CoreLayer = Layer.mergeAll(
      BaseLayer,
      WsLayer,
      CatalogLayer,
      SPLayer,
      CodingAgentRepositoryLive,
      LifecycleFailureAdapterLive,
      Layer.provide(LifecycleResolutionProgressLive, BaseLayer),
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
  // Basic uninstall
  // ---------------------------------------------------------------------------

  describe("basic uninstall", () => {
    it.effect("uninstalls a pack and removes from lockfile", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        settingsPacks: { "my-pack": "@acme/packs/my-pack" },
        lockfilePacks: {
          "my-pack": makePackLockEntry("@acme", "my-pack"),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("my-pack"), {
            yes: false,
            preview: false,
          });

          // Check lockfile no longer has the pack
          const lockContent = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.packs?.["my-pack"]).toBeUndefined();
        }),
      );
    });

    it.effect("accepts a fully qualified pack name", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        settingsPacks: { "my-pack": "@acme/packs/my-pack" },
        lockfilePacks: {
          "my-pack": makePackLockEntry("@acme", "my-pack"),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("@acme/packs/my-pack"), {
            yes: false,
            preview: false,
          });

          const lockContent = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.packs?.["my-pack"]).toBeUndefined();
        }),
      );
    });

    it.effect("succeeds as a no-op when the pack is not installed", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("nonexistent-pack"), {
            yes: false,
            preview: false,
          });

          const lockContent = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.packs).toBeUndefined();
        }),
      );
    });
  });

  describe("workspace-authored packs", () => {
    const initializeWorkspacePack = () => {
      const axmDir = path.join(tempDir, ".axm");
      initWorkspace(axmDir, {
        settingsPacks: { toolkit: "workspace" },
        lockfilePacks: {
          toolkit: makeWorkspacePackLockEntry("@acme", "toolkit"),
        },
      });
      return tempDir;
    };

    it.effect("previews a bare workspace pack without changing workspace state", () => {
      const { provide, rendererState } = makeLayers({ machine: true });
      const axmDir = initializeWorkspacePack();
      const before = {
        settings: fs.readFileSync(path.join(axmDir, "axm.json"), "utf8"),
        lockfile: fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"),
        manifest: fs.readFileSync(path.join(axmDir, "packs", "toolkit", "pack.json"), "utf8"),
      };

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("toolkit"), {
            yes: false,
            preview: true,
          });

          expectPreviewedPlanResult(rendererState.results[0]?.data, {
            planName: "Uninstall pack",
            totalSteps: 1,
          });
          expect(fs.readFileSync(path.join(axmDir, "axm.json"), "utf8")).toBe(before.settings);
          expect(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8")).toBe(before.lockfile);
          expect(fs.readFileSync(path.join(axmDir, "packs", "toolkit", "pack.json"), "utf8")).toBe(
            before.manifest,
          );
        }),
      );
    });

    it.effect("blocks preview and apply on the same incomplete Pack graph facts", () => {
      const { provide, rendererState } = makeLayers({ machine: true });
      const axmDir = initializeWorkspacePack();
      const manifestPath = path.join(axmDir, "packs", "toolkit", "pack.json");
      fs.rmSync(manifestPath);
      const projectionPath = path.join(tempDir, "AGENTS.md");
      fs.writeFileSync(projectionPath, "authored projection sentinel\n");
      const before = {
        settings: fs.readFileSync(path.join(axmDir, "axm.json"), "utf8"),
        lockfile: fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"),
        projection: fs.readFileSync(projectionPath, "utf8"),
      };

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("toolkit"), {
            yes: false,
            preview: true,
          });
          yield* handleUninstallPack(defaultArgs("toolkit"), {
            yes: true,
            preview: false,
          });

          const preview = property(rendererState.results[0]?.data, "result");
          const apply = property(rendererState.results[1]?.data, "result");
          const decision = {
            outcome: "blocked",
            blocking: expect.objectContaining({
              class: "precondition-unmet",
              phase: "planning",
              causeCode: "conflict",
            }),
            counts: expect.objectContaining({ total: 1, ready: 0, blocked: 1 }),
            units: [
              expect.objectContaining({
                state: "blocked",
                message: expect.stringContaining("pack-manifest-unavailable"),
              }),
            ],
            riskConditions: [
              expect.objectContaining({
                level: "blocked",
                id: PACK_UNINSTALL_GRAPH_BLOCKER_ID,
                detail: expect.stringContaining("packs/toolkit/pack.json"),
              }),
            ],
          };
          expect(preview).toMatchObject(decision);
          expect(apply).toMatchObject(decision);
          expect(JSON.stringify(preview)).toContain("@acme/packs/toolkit");
          expect(fs.readFileSync(path.join(axmDir, "axm.json"), "utf8")).toBe(before.settings);
          expect(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8")).toBe(before.lockfile);
          expect(fs.existsSync(manifestPath)).toBe(false);
          expect(fs.readFileSync(projectionPath, "utf8")).toBe(before.projection);
        }),
      );
    });

    it.effect("reports incomplete Pack facts in human output", () => {
      const { provide, logs } = makeLayers();
      const axmDir = initializeWorkspacePack();
      fs.rmSync(path.join(axmDir, "packs", "toolkit", "pack.json"));

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("toolkit"), {
            yes: false,
            preview: true,
          });

          const output = [...logs.error, ...logs.warn, ...logs.info, ...logs.success].join("\n");
          expect(output).toContain("@acme/packs/toolkit");
          expect(output).toContain("pack-manifest-unavailable");
          expect(output).toContain("packs/toolkit/pack.json");
        }),
      );
    });

    it.effect("returns a stale candidate when Pack authority changes before apply", () => {
      const { provide, rendererState } = makeLayers({ machine: true });
      const axmDir = initializeWorkspacePack();
      const settingsPath = path.join(axmDir, "axm.json");
      const lockfilePath = path.join(axmDir, "axm-lock.yaml");
      const manifestPath = path.join(axmDir, "packs", "toolkit", "pack.json");
      const before = {
        settings: fs.readFileSync(settingsPath, "utf8"),
        lockfile: fs.readFileSync(lockfilePath, "utf8"),
      };
      const projectionPath = path.join(tempDir, "AGENTS.md");
      fs.writeFileSync(projectionPath, "authored projection sentinel\n");
      const changedManifest = `${fs.readFileSync(manifestPath, "utf8")}\n`;

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(
            defaultArgs("toolkit"),
            { yes: true, preview: false },
            {
              beforeApply: () =>
                Effect.sync(() => {
                  fs.writeFileSync(manifestPath, changedManifest);
                }),
            },
          );

          expect(property(rendererState.results[0]?.data, "result")).toMatchObject({
            outcome: "blocked",
            blocking: expect.objectContaining({
              class: "stale-candidate",
              phase: "validation",
            }),
            counts: expect.objectContaining({ committed: 0, blocked: 0 }),
          });
          expect(fs.readFileSync(settingsPath, "utf8")).toBe(before.settings);
          expect(fs.readFileSync(lockfilePath, "utf8")).toBe(before.lockfile);
          expect(fs.readFileSync(manifestPath, "utf8")).toBe(changedManifest);
          expect(fs.readFileSync(projectionPath, "utf8")).toBe("authored projection sentinel\n");
        }),
      );
    });

    it.effect.each(["toolkit", "@acme/packs/toolkit"])(
      "uninstalls a workspace pack selected as %s",
      (selector) => {
        const { provide } = makeLayers();
        const axmDir = initializeWorkspacePack();

        return provide(
          Effect.gen(function* () {
            yield* handleUninstallPack(defaultArgs(selector), {
              yes: true,
              preview: false,
            });

            const settings = JSON.parse(fs.readFileSync(path.join(axmDir, "axm.json"), "utf8"));
            const lockfile = YAML.parse(
              fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf8"),
            );
            expect(settings.packs?.toolkit).toBeUndefined();
            expect(lockfile.packs?.toolkit).toBeUndefined();
            expect(fs.existsSync(path.join(axmDir, "packs", "toolkit"))).toBe(true);
          }),
        );
      },
    );

    it.effect("does not uninstall a same-name pack owned by someone else", () => {
      const { provide, rendererState } = makeLayers({ machine: true });
      const axmDir = initializeWorkspacePack();

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("@other/packs/toolkit"), {
            yes: true,
            preview: false,
          });

          expectNoOpPlanResult(rendererState.results[0]?.data, {
            planName: "Uninstall packs",
            message: "No packs uninstalled.",
          });
          const settings = JSON.parse(fs.readFileSync(path.join(axmDir, "axm.json"), "utf8"));
          expect(settings.packs?.toolkit).toBe("workspace");
        }),
      );
    });

    it.effect("rejects a fully qualified non-pack selector", () => {
      const { provide } = makeLayers();
      initializeWorkspacePack();

      return provide(
        Effect.gen(function* () {
          const error = yield* Effect.flip(
            handleUninstallPack(defaultArgs("@acme/skills/toolkit"), {
              yes: true,
              preview: false,
            }),
          );
          expect(error).toMatchObject({ code: "validation" });
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Orphan detection
  // ---------------------------------------------------------------------------

  describe("orphan detection", () => {
    it.effect("removes orphaned skills on pack uninstall", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        settingsPacks: { "my-pack": "@acme/packs/my-pack" },
        lockfilePacks: {
          "my-pack": makePackLockEntry("@acme", "my-pack", {
            resolvedSkills: {
              "@acme/skills/skill-a": resolvedRegistryMember("1.0.0"),
            },
          }),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("my-pack"), {
            yes: false,
            preview: false,
          });

          const lockContent = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.packs?.["my-pack"]).toBeUndefined();
          expect(lockfile.skills?.["skill-a"]).toBeUndefined();
        }),
      );
    });

    it.effect("preserves skills referenced by another pack", () => {
      const { provide, logs, rendererState } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        settingsPacks: {
          "pack-a": "@acme/packs/pack-a",
          "pack-b": "@acme/packs/pack-b",
        },
        lockfilePacks: {
          "pack-a": makePackLockEntry("@acme", "pack-a", {
            resolvedSkills: {
              "@acme/skills/shared-skill": resolvedRegistryMember("1.0.0"),
            },
          }),
          "pack-b": makePackLockEntry("@acme", "pack-b", {
            resolvedSkills: {
              "@acme/skills/shared-skill": resolvedRegistryMember("1.0.0"),
            },
          }),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("pack-a"), {
            yes: false,
            preview: false,
          });

          // shared-skill is retained by pack-b, should not appear as a unit
          expect(logs.success.some((m) => m.includes("shared-skill"))).toBe(false);
          expect(rendererState.summaries.some((m) => m.includes("shared-skill"))).toBe(false);
          const lockContent = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.packs?.["pack-a"]).toBeUndefined();
        }),
      );
    });

    it.effect("preserves skills that are direct settings entries", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        settingsSkills: { "promoted-skill": "@acme/skills/promoted-skill" },
        settingsPacks: { "my-pack": "@acme/packs/my-pack" },
        lockfilePacks: {
          "my-pack": makePackLockEntry("@acme", "my-pack", {
            resolvedSkills: {
              "@acme/skills/promoted-skill": resolvedRegistryMember("1.0.0"),
            },
          }),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("my-pack"), {
            yes: false,
            preview: false,
          });

          const lockContent = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.packs?.["my-pack"]).toBeUndefined();
          const settings = JSON.parse(fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8"));
          expect(settings.skills?.["promoted-skill"]).toBe("@acme/skills/promoted-skill");
        }),
      );
    });

    it.effect("preserves disabled direct skills when their pack is uninstalled", () => {
      const { provide } = makeLayers();
      const disabled = {
        source: "@acme/skills/promoted-skill",
        enabled: false,
      };
      initWorkspace(path.join(tempDir, ".axm"), {
        settingsSkills: { "promoted-skill": disabled },
        settingsPacks: { "my-pack": "@acme/packs/my-pack" },
        lockfilePacks: {
          "my-pack": makePackLockEntry("@acme", "my-pack", {
            resolvedSkills: {
              "@acme/skills/promoted-skill": resolvedRegistryMember("1.0.0"),
            },
          }),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("my-pack"), {
            yes: false,
            preview: false,
          });

          const settings = JSON.parse(fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8"));
          expect(settings.skills?.["promoted-skill"]).toEqual(disabled);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Glob patterns
  // ---------------------------------------------------------------------------

  describe("glob patterns", () => {
    it.effect("expands glob pattern to match multiple packs", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        settingsPacks: {
          "acme-tools": "@acme/packs/acme-tools",
          "acme-utils": "@acme/packs/acme-utils",
          "other-pack": "@acme/packs/other-pack",
        },
        lockfilePacks: {
          "acme-tools": makePackLockEntry("@acme", "acme-tools"),
          "acme-utils": makePackLockEntry("@acme", "acme-utils"),
          "other-pack": makePackLockEntry("@acme", "other-pack"),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("acme-*"), {
            yes: false,
            preview: false,
          });

          // Check lockfile - acme-tools and acme-utils should be removed, other-pack preserved
          const lockContent = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.packs?.["acme-tools"]).toBeUndefined();
          expect(lockfile.packs?.["acme-utils"]).toBeUndefined();
          expect(lockfile.packs?.["other-pack"]).toBeDefined();
        }),
      );
    });

    it.effect("reports no-op when glob pattern matches nothing", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("nonexistent-*"), {
            yes: false,
            preview: false,
          });

          expect(logs.warn).toEqual([]);
          expect(logs.success.some((m) => m.includes("No packs uninstalled"))).toBe(true);
        }),
      );
    });

    it.effect("emits JSON no-op when glob pattern matches nothing in machine mode", () => {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("nonexistent-*"), {
            yes: false,
            preview: false,
          });

          expect(logs.success).toEqual([]);
          expect(logs.warn).toEqual([]);
          expectNoOpPlanResult(rendererState.results[0]?.data, {
            planName: "Uninstall packs",
            message: "No packs uninstalled.",
          });
        }),
      );
    });

    it.effect("reports an explicit empty preview in human mode", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("nonexistent-*"), {
            yes: false,
            preview: true,
          });

          expect(logs.success).toContain("No packs would be uninstalled.");
        }),
      );
    });

    it.effect("reports a structured empty preview as a no-op in machine mode", () => {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("nonexistent-*"), {
            yes: false,
            preview: true,
          });

          expect(logs.success).toEqual([]);
          expectNoOpPlanResult(rendererState.results[0]?.data, {
            planName: "Uninstall packs",
            totalSteps: 0,
          });
        }),
      );
    });
  });
});
