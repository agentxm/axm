/**
 * Unit tests for the packs uninstall command handler.
 *
 * Tests the pack uninstall flow: plan build, orphan detection, execution.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import {
  makeClackPromptTestLayer,
  makeClackLogTestLayer,
  makeClackSpinnerTestLayer,
} from "../../../clack-effect/index.js";
import { CliFlagsTest } from "../../../cli-flags/index.js";
import { TelemetryClientTest } from "../../../telemetry/index.js";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "../../../workspace/index.js";
import { SourceHostProvidersLive } from "../../../sources/index.js";
import { handleUninstallPack, type UninstallPackHandlerArgs } from "./handler.js";
import { UninstallPackCommandWorkflowActionsLive } from "./command-actions.js";
import { PackManagerLive } from "../../../extensions/packs/manager.js";
import { SkillManagerLive } from "../../../extensions/skills/manager.js";
import { CommandManagerLive } from "../../../extensions/commands/manager.js";
import { McpServerManagerLive } from "../../../extensions/mcp-servers/manager.js";

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
  namespace: string,
  name: string,
  overrides?: {
    resolvedSkills?: Record<string, string>;
    resolvedCommands?: Record<string, string>;
    resolvedMcpServers?: Record<string, string>;
  },
) => ({
  type: "registry",
  namespace,
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  sourceName: "default",
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  resolvedSkills: overrides?.resolvedSkills ?? {},
  resolvedCommands: overrides?.resolvedCommands ?? {},
  resolvedMcpServers: overrides?.resolvedMcpServers ?? {},
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
      confirmBehavior?: import("../../../clack-effect/index.js").ConfirmBehavior;
      selectBehavior?: import("../../../clack-effect/index.js").SelectBehavior;
      multiselectBehavior?: import("../../../clack-effect/index.js").MultiselectBehavior;
    },
    wsOverrides?: Partial<WorkspaceContextOptions>,
  ) => {
    const [logLayer, mockLog] = makeClackLogTestLayer();
    const [spinnerLayer] = makeClackSpinnerTestLayer();
    const [confirmLayer] = makeClackPromptTestLayer(
      tuiConfig?.confirmBehavior ?? { type: "return", value: true },
    );
    const [selectLayer] = makeClackPromptTestLayer(
      tuiConfig?.selectBehavior ?? { type: "select", index: 0 },
    );
    const [multiselectLayer] = makeClackPromptTestLayer(
      tuiConfig?.multiselectBehavior ?? { type: "multiselect", indices: [] },
    );
    const BaseLayer = Layer.mergeAll(
      NodeContext.layer,
      logLayer,
      spinnerLayer,
      confirmLayer,
      selectLayer,
      multiselectLayer,
      CliFlagsTest(),
      TelemetryClientTest,
    );
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
      agents: Option.none(),
      ...wsOverrides,
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const ManagersLayer = Layer.mergeAll(
      PackManagerLive,
      SkillManagerLive,
      CommandManagerLive,
      McpServerManagerLive,
    );
    const CoreLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer);
    const MgrLayer = Layer.provide(ManagersLayer, CoreLayer);
    const ActionsLayer = Layer.provide(
      UninstallPackCommandWorkflowActionsLive,
      Layer.merge(CoreLayer, MgrLayer),
    );
    const FullLayer = Layer.mergeAll(CoreLayer, MgrLayer, ActionsLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog };
  };

  // ---------------------------------------------------------------------------
  // Basic uninstall
  // ---------------------------------------------------------------------------

  describe("basic uninstall", () => {
    it.effect("uninstalls a pack and removes from lockfile", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        settingsPacks: { "my-pack": "@acme/packs/my-pack" },
        lockfilePacks: {
          "my-pack": makePackLockEntry("@acme", "my-pack"),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("my-pack"));

          // Should show completed step for the pack
          expect(mockLog.logs.success.some((m) => m.includes("my-pack"))).toBe(true);

          // Check lockfile no longer has the pack
          const lockContent = fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.packs?.["my-pack"]).toBeUndefined();
        }),
      );
    });

    it.effect("no-ops when pack is not installed", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("nonexistent-pack"));

          // Plan still executes step (no-op since nothing to remove)
          expect(mockLog.logs.success.some((m) => m.includes("nonexistent-pack"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Orphan detection
  // ---------------------------------------------------------------------------

  describe("orphan detection", () => {
    it.effect("removes orphaned skills on pack uninstall", () => {
      const { provide, mockLog } = makeLayers();
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
          yield* handleUninstallPack(defaultArgs("my-pack"));

          // Should show completed steps for pack and orphaned skill
          expect(mockLog.logs.success.some((m) => m.includes("my-pack"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("skill-a"))).toBe(true);
        }),
      );
    });

    it.effect("preserves skills referenced by another pack", () => {
      const { provide, mockLog } = makeLayers();
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
          yield* handleUninstallPack(defaultArgs("pack-a"));

          // shared-skill is retained by pack-b, should not appear as a step
          expect(mockLog.logs.success.some((m) => m.includes("shared-skill"))).toBe(false);
          // pack-a itself should be uninstalled
          expect(mockLog.logs.success.some((m) => m.includes("pack-a"))).toBe(true);
        }),
      );
    });

    it.effect("preserves skills that are direct settings entries", () => {
      const { provide, mockLog } = makeLayers();
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
          yield* handleUninstallPack(defaultArgs("my-pack"));

          // promoted-skill is directly configured, so excluded from orphan targets
          expect(mockLog.logs.success.some((m) => m.includes("promoted-skill"))).toBe(false);
          // pack itself should be uninstalled
          expect(mockLog.logs.success.some((m) => m.includes("my-pack"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Glob patterns
  // ---------------------------------------------------------------------------

  describe("glob patterns", () => {
    it.effect("expands glob pattern to match multiple packs", () => {
      const { provide, mockLog } = makeLayers();
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
          yield* handleUninstallPack(defaultArgs("acme-*"));

          // Should show completed steps for matched packs
          expect(mockLog.logs.success.some((m) => m.includes("acme-tools"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("acme-utils"))).toBe(true);

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
      const { provide, mockLog } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("nonexistent-*"));

          expect(mockLog.logs.warn.some((m) => m.includes("No packs matched"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("Nothing to uninstall"))).toBe(true);
        }),
      );
    });
  });
});
