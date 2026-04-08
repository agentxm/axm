import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { TestRenderer } from "../../cli-renderer/index.js";
import { Workspace, type WorkspaceContextService } from "../../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import type { UninstallExtensionPackOperation } from "./uninstall.js";
import { uninstallExtensionPack } from "./uninstall.js";
import { handle } from "../../test-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeWorkspaceMock = (axmDir: string): WorkspaceContextService =>
  makeBaseWorkspaceMock(axmDir, {
    getConfiguredProfile: () => Effect.succeed(handle("@community")),
    getConfiguredSources: () => Effect.succeed([]),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredPacks: () => Effect.succeed({}),
    getInstalledPacks: () => Effect.succeed({}),
    getConfiguredCommands: () => Effect.succeed({}),
    getConfiguredMcpServers: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed([]),
  });

const makeOp = (packName = "testing"): UninstallExtensionPackOperation => ({
  name: "uninstall-pack",
  args: { packName },
});

const makeLayer = (axmDir: string) => {
  return Layer.mergeAll(
    NodeServices.layer,
    Workspace.layer(makeWorkspaceMock(axmDir)),
    TestRenderer.make().layer,
  );
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("uninstallExtensionPack — orphaned folder cleanup", () => {
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

        // Create pack folder on disk under an owner
        const packDir = path.join(base, ".axm", "extensions", "@test", "packs", "testing");
        fs.mkdirSync(packDir, { recursive: true });
        fs.writeFileSync(path.join(packDir, "pack.json"), "{}");

        const result = yield* uninstallExtensionPack(makeOp("testing")).pipe(
          Effect.provide(makeLayer(axmDir)),
        );

        expect(result.result).toBe("success");
        expect(fs.existsSync(packDir)).toBe(false);
      }),
    );
  });

  describe("pack folder does not exist on disk or in lockfile", () => {
    it.effect("returns success with not-installed message", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const result = yield* uninstallExtensionPack(makeOp("testing")).pipe(
          Effect.provide(makeLayer(axmDir)),
        );

        expect(result.result).toBe("success");
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

        const result = yield* uninstallExtensionPack(makeOp("testing")).pipe(
          Effect.provide(makeLayer(axmDir)),
        );

        expect(result.result).toBe("success");
        expect(fs.existsSync(fooPackDir)).toBe(false);
        expect(fs.existsSync(barPackDir)).toBe(false);
      }),
    );
  });
});
