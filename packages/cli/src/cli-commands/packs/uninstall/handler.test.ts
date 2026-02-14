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
  makeConfirmTestLayer,
  makeLogTestLayer,
  makeMultiselectTestLayer,
  makeSelectTestLayer,
  makeSpinnerTestLayer,
} from "../../../tui/index.js";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "../../../workspace/index.js";
import { SourceProvidersLive } from "../../../sources/index.js";
import { handleUninstallPack, type UninstallPackHandlerArgs } from "./handler.js";

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
  yes: true,
  ...overrides,
});

const makePackLockEntry = (
  scope: string,
  name: string,
  overrides?: {
    resolvedSkills?: Record<string, string>;
    resolvedCommands?: Record<string, string>;
    resolvedMcpServers?: Record<string, string>;
  },
) => ({
  type: "registry",
  scope,
  name,
  resolvedVersion: "1.0.0",
  checksum: "abc",
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
      confirmBehavior?: import("../../../tui/index.js").ConfirmBehavior;
      selectBehavior?: import("../../../tui/index.js").SelectBehavior;
      multiselectBehavior?: import("../../../tui/index.js").MultiselectBehavior;
    },
    wsOverrides?: Partial<WorkspaceContextOptions>,
  ) => {
    const [logLayer, mockLog] = makeLogTestLayer();
    const [spinnerLayer] = makeSpinnerTestLayer();
    const [confirmLayer] = makeConfirmTestLayer(
      tuiConfig?.confirmBehavior ?? { type: "return", value: true },
    );
    const [selectLayer] = makeSelectTestLayer(
      tuiConfig?.selectBehavior ?? { type: "return", index: 0 },
    );
    const [multiselectLayer] = makeMultiselectTestLayer(
      tuiConfig?.multiselectBehavior ?? { type: "return", indices: [] },
    );
    const BaseLayer = Layer.mergeAll(
      NodeContext.layer,
      logLayer,
      spinnerLayer,
      confirmLayer,
      selectLayer,
      multiselectLayer,
    );
    const wsOptions: WorkspaceContextOptions = {
      global: false,
      yes: true,
      nonInteractive: Option.some(true),
      preview: false,
      agents: Option.none(),
      ...wsOverrides,
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
    const SPLayer = Layer.provide(SourceProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer);

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
        settingsPacks: { "my-pack": "registry:@acme/my-pack@1.0.0" },
        lockfilePacks: {
          "my-pack": makePackLockEntry("@acme", "my-pack"),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("my-pack"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

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

          // Plan marks as no-op
          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
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
        settingsPacks: { "my-pack": "registry:@acme/my-pack@1.0.0" },
        lockfilePacks: {
          "my-pack": makePackLockEntry("@acme", "my-pack", {
            resolvedSkills: { "@acme/skill-a": "1.0.0" },
          }),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("my-pack"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });

    it.effect("preserves skills referenced by another pack", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        settingsPacks: {
          "pack-a": "registry:@acme/pack-a@1.0.0",
          "pack-b": "registry:@acme/pack-b@1.0.0",
        },
        lockfilePacks: {
          "pack-a": makePackLockEntry("@acme", "pack-a", {
            resolvedSkills: { "@acme/shared-skill": "1.0.0" },
          }),
          "pack-b": makePackLockEntry("@acme", "pack-b", {
            resolvedSkills: { "@acme/shared-skill": "1.0.0" },
          }),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("pack-a"));

          // shared-skill should NOT be reported as orphaned
          expect(mockLog.logs.info.some((m) => m.includes("orphaned"))).toBe(false);
          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });

    it.effect("preserves skills that are direct settings entries", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        settingsSkills: { "promoted-skill": "registry:@acme/promoted-skill@1.0.0" },
        settingsPacks: { "my-pack": "registry:@acme/my-pack@1.0.0" },
        lockfilePacks: {
          "my-pack": makePackLockEntry("@acme", "my-pack", {
            resolvedSkills: { "promoted-skill": "1.0.0" },
          }),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstallPack(defaultArgs("my-pack"));

          // promoted-skill is a direct entry, should NOT be orphaned
          expect(mockLog.logs.info.some((m) => m.includes("promoted-skill"))).toBe(false);
          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
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
          "acme-tools": "registry:@acme/acme-tools@1.0.0",
          "acme-utils": "registry:@acme/acme-utils@1.0.0",
          "other-pack": "registry:@acme/other-pack@1.0.0",
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

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

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
