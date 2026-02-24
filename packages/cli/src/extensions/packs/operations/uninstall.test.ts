import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { makeLogTestLayer } from "../../../tui/index.js";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import { taxonomyStubs } from "../../../workspace/test-stubs.js";
import type { UninstallPackOperation } from "./uninstall.js";
import { uninstallPack } from "./uninstall.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeWorkspaceMock = (axmDir: string): WorkspaceContextService => ({
  ...taxonomyStubs,
  global: false,
  path: axmDir,
  baseDir: path.dirname(axmDir),
  nonInteractive: true,
  preview: false,
  resolvePlan: () => Effect.succeed({ name: "mock", description: Option.none(), jobs: [] }),
  getConfiguredSources: () => Effect.succeed([]),
  getConfiguredSourceByName: () => Effect.succeed(Option.none()),
  getConfiguredRegistrySources: () => Effect.succeed([]),
  getConfiguredNamespace: () => Effect.succeed("@community"),
  addConfiguredSource: () => Effect.void,
  getConfiguredSkills: () => Effect.succeed({}),
  getInstalledSkills: () => Effect.succeed({}),
  getConfiguredAgents: () => Effect.succeed([]),
  getLockedSkills: () => Effect.succeed({}),
  getLockedSkill: () => Effect.succeed(Option.none()),
  getSkillDir: () => Effect.succeed({ canonicalPath: "", skillSrcPath: "" }),
  setSkill: () => Effect.void,
  setSkillLock: () => Effect.void,
  removeSkill: () => Effect.void,
  updateSkillEntry: () => Effect.void,
  setSkillEntry: () => Effect.void,
  renameSkill: () => Effect.void,
  updateLockEntryAgents: () => Effect.void,
  addConfiguredAgent: () => Effect.void,
  removeSkillFromSettings: () => Effect.void,
  getConfiguredPacks: () => Effect.succeed({}),
  getInstalledPacks: () => Effect.succeed({}),
  getLockedPacks: () => Effect.succeed({}),
  getLockedPack: () => Effect.succeed(Option.none()),
  setPack: () => Effect.void,
  removePack: () => Effect.void,
  getPackDir: () => Effect.succeed({ canonicalPath: "" }),
  getLockedCommands: () => Effect.succeed({}),
  getLockedCommand: () => Effect.succeed(Option.none()),
  setCommand: () => Effect.void,
  setCommandLock: () => Effect.void,
  removeCommand: () => Effect.void,
  getLockedMcpServers: () => Effect.succeed({}),
  getLockedMcpServer: () => Effect.succeed(Option.none()),
  setMcpServer: () => Effect.void,
  setMcpServerLock: () => Effect.void,
  removeMcpServer: () => Effect.void,
  getConfiguredCommands: () => Effect.succeed({}),
  getConfiguredMcpServers: () => Effect.succeed({}),
});

const makeOp = (packName = "testing"): UninstallPackOperation => ({
  name: "uninstall-pack",
  args: { packName },
});

const makeLayer = (axmDir: string) => {
  const [logLayer] = makeLogTestLayer();
  return Layer.mergeAll(NodeContext.layer, Workspace.layer(makeWorkspaceMock(axmDir)), logLayer);
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("uninstallPack — orphaned folder cleanup", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "uninstall-pack-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("pack folder exists on disk but not in lockfile", () => {
    it.effect("removes the folder and returns success", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        // Create pack folder on disk under a namespace
        const packDir = path.join(base, ".axm", "extensions", "@test", "packs", "testing");
        fs.mkdirSync(packDir, { recursive: true });
        fs.writeFileSync(path.join(packDir, "pack.json"), "{}");

        const result = yield* uninstallPack(makeOp("testing")).pipe(
          Effect.provide(makeLayer(axmDir)),
        );

        expect(result.result).toBe("success");
        expect(fs.existsSync(packDir)).toBe(false);
      }),
    );
  });

  describe("pack folder does not exist on disk or in lockfile", () => {
    it.effect("returns no-op", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const result = yield* uninstallPack(makeOp("testing")).pipe(
          Effect.provide(makeLayer(axmDir)),
        );

        expect(result.result).toBe("no-op");
        expect(result.message).toBe("not installed");
      }),
    );
  });

  describe("pack folder exists under multiple namespaces", () => {
    it.effect("removes all matching directories and returns success", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        // Create pack folders under two different namespaces
        const fooPackDir = path.join(base, ".axm", "extensions", "@foo", "packs", "testing");
        fs.mkdirSync(fooPackDir, { recursive: true });
        fs.writeFileSync(path.join(fooPackDir, "pack.json"), "{}");

        const barPackDir = path.join(base, ".axm", "extensions", "@bar", "packs", "testing");
        fs.mkdirSync(barPackDir, { recursive: true });
        fs.writeFileSync(path.join(barPackDir, "pack.json"), "{}");

        const result = yield* uninstallPack(makeOp("testing")).pipe(
          Effect.provide(makeLayer(axmDir)),
        );

        expect(result.result).toBe("success");
        expect(fs.existsSync(fooPackDir)).toBe(false);
        expect(fs.existsSync(barPackDir)).toBe(false);
      }),
    );
  });
});
