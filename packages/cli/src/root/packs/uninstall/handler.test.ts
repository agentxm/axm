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
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { TestRenderer, logsByTag } from "@agentxm/client-core/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import type { WorkspaceMutationsOptions } from "@agentxm/client-core/unstable/workspace";
import {
  layer as coreWorkspaceLayer,
  ResolvePlanInteractionTest,
} from "@agentxm/client-core/unstable/workspace";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { handleUninstallPack } from "./handler.js";
import {
  type UninstallPackHandlerArgs,
  UninstallPackCommandWorkflowActionsLive,
} from "./command-actions.js";
import { SkillManagerLive } from "@agentxm/client-core/unstable/skills";
import { PackManagerLive } from "@agentxm/client-core/unstable/packs";
import { CommandManagerLive } from "@agentxm/client-core/unstable/commands";
import { FilesManagerLive } from "@agentxm/client-core/unstable/files";
import { HookManagerLive } from "@agentxm/client-core/unstable/hooks";
import { McpServerManagerLive } from "@agentxm/client-core/unstable/mcps";
import { RuleManagerLive } from "@agentxm/client-core/unstable/rules";
import { SubagentManagerLive } from "@agentxm/client-core/unstable/subagents";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";

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
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = { agents: ["claude-code"] };
  if (opts?.settingsSkills) settings["skills"] = opts.settingsSkills;
  if (opts?.settingsPacks) settings["packs"] = opts.settingsPacks;
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
  name: string,
  overrides: Partial<UninstallPackHandlerArgs> = {},
): UninstallPackHandlerArgs => ({
  name,
  ...overrides,
});

const makePackLockEntry = (
  owner: string,
  name: string,
  overrides?: {
    resolvedSkills?: Record<string, string>;
    resolvedCommands?: Record<string, string>;
    resolvedMcpServers?: Record<string, string>;
    resolvedSubagents?: Record<string, string>;
  },
) => ({
  type: "registry",
  owner,
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  sourceName: "default",
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  resolvedSkills: overrides?.resolvedSkills ?? {},
  resolvedCommands: overrides?.resolvedCommands ?? {},
  resolvedMcpServers: overrides?.resolvedMcpServers ?? {},
  resolvedSubagents: overrides?.resolvedSubagents ?? {},
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
    },
    wsOverrides?: Partial<WorkspaceMutationsOptions>,
  ) => {
    const { layer: rendererLayer, state: rendererState } = TestRenderer.make();
    const resolvePlanInteraction = ResolvePlanInteractionTest({
      confirmApplyChanges: () => Effect.succeed(tuiConfig?.confirmValue ?? true),
    });
    const BaseLayer = Layer.mergeAll(
      NodeServices.layer,
      rendererLayer,
      resolvePlanInteraction.layer,
      TestFlagsLayer(),
    );
    const wsOptions: WorkspaceMutationsOptions = {
      scope: "project",
      ...wsOverrides,
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
      CommandManagerLive,
      FilesManagerLive,
      HookManagerLive,
      McpServerManagerLive,
      RuleManagerLive,
      SubagentManagerLive,
    );
    const CoreLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer, CodingAgentRepositoryLive);
    const MgrLayer = Layer.provide(ManagersLayer, CoreLayer);
    const ActionsLayer = Layer.provide(
      UninstallPackCommandWorkflowActionsLive,
      Layer.merge(CoreLayer, MgrLayer),
    );
    const FullLayer = Layer.mergeAll(CoreLayer, MgrLayer, ActionsLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    const logs = logsByTag(rendererState);

    return { provide, logs };
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
            force: false,
            preview: false,
          });

          // Check lockfile no longer has the pack
          const lockContent = fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.packs?.["my-pack"]).toBeUndefined();
        }),
      );
    });

    it.effect("errors when pack is not installed", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const result = yield* handleUninstallPack(defaultArgs("nonexistent-pack"), {
            yes: false,
            force: false,
            preview: false,
          }).pipe(
            Effect.catchTag("AppError", (e) =>
              Effect.succeed({ error: true, code: e.code, message: e.detail }),
            ),
          );

          expect(result).toMatchObject({
            error: true,
            code: "not_found",
            message: expect.stringContaining("nonexistent-pack"),
          });
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
            resolvedSkills: { "@acme/skills/skill-a": "1.0.0" },
          }),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("my-pack"), {
            yes: false,
            force: false,
            preview: false,
          });

          const lockContent = fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.packs?.["my-pack"]).toBeUndefined();
          expect(lockfile.skills?.["skill-a"]).toBeUndefined();
        }),
      );
    });

    it.effect("preserves skills referenced by another pack", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        settingsPacks: {
          "pack-a": "@acme/packs/pack-a",
          "pack-b": "@acme/packs/pack-b",
        },
        lockfilePacks: {
          "pack-a": makePackLockEntry("@acme", "pack-a", {
            resolvedSkills: { "@acme/skills/shared-skill": "1.0.0" },
          }),
          "pack-b": makePackLockEntry("@acme", "pack-b", {
            resolvedSkills: { "@acme/skills/shared-skill": "1.0.0" },
          }),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("pack-a"), {
            yes: false,
            force: false,
            preview: false,
          });

          // shared-skill is retained by pack-b, should not appear as a step
          expect(logs.success.some((m) => m.includes("shared-skill"))).toBe(false);
          const lockContent = fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8");
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
            resolvedSkills: { "@acme/skills/promoted-skill": "1.0.0" },
          }),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("my-pack"), {
            yes: false,
            force: false,
            preview: false,
          });

          const lockContent = fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.packs?.["my-pack"]).toBeUndefined();
          const settings = JSON.parse(
            fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8"),
          );
          expect(settings.skills?.["promoted-skill"]).toBe("@acme/skills/promoted-skill");
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
            force: false,
            preview: false,
          });

          // Check lockfile - acme-tools and acme-utils should be removed, other-pack preserved
          const lockContent = fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.packs?.["acme-tools"]).toBeUndefined();
          expect(lockfile.packs?.["acme-utils"]).toBeUndefined();
          expect(lockfile.packs?.["other-pack"]).toBeDefined();
        }),
      );
    });

    it.effect("warns when glob pattern matches nothing", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("nonexistent-*"), {
            yes: false,
            force: false,
            preview: false,
          });

          expect(logs.warn.some((m) => m.includes("No packs matched"))).toBe(true);
          expect(logs.success.some((m) => m.includes("Nothing to uninstall"))).toBe(true);
        }),
      );
    });
  });
});
