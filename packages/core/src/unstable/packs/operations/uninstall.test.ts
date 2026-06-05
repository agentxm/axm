import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { TestRenderer, logsByTag } from "../../cli-renderer/index.js";
import { makeAppError } from "../../app-error/index.js";
import type { PackLockEntry } from "../../lockfile/index.js";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "../../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import type { UninstallPackOperation } from "./uninstall.js";
import { uninstallPack } from "./uninstall.js";
import { exactVersion, extensionName, handle } from "../../test-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeWorkspaceMock = (
  axmDir: string,
  overrides?: Partial<WorkspaceMutationsService> & Partial<WorkspaceMutationsService["records"]>,
): WorkspaceMutationsService =>
  makeBaseWorkspaceMock(axmDir, {
    getConfiguredOwner: () => Effect.succeed(Option.some(handle("@community"))),
    getConfiguredSources: () => Effect.succeed([]),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredPacks: () => Effect.succeed({}),
    getInstalledPacks: () => Effect.succeed({}),
    getConfiguredCommands: () => Effect.succeed({}),
    getConfiguredMcpServers: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed([]),
    ...overrides,
  });

const makeOp = (packName = "testing"): UninstallPackOperation => ({
  name: "uninstall-pack",
  args: { packName },
});

const makeServices = (
  axmDir: string,
  overrides?: Partial<WorkspaceMutationsService> & Partial<WorkspaceMutationsService["records"]>,
) => {
  const renderer = TestRenderer.make();
  return {
    layer: Layer.mergeAll(
      NodeServices.layer,
      WorkspaceMutations.layer(makeWorkspaceMock(axmDir, overrides)),
      renderer.layer,
    ),
    rendererState: renderer.state,
  };
};

const makeLayer = (axmDir: string) => makeServices(axmDir).layer;

const makeLockedPack = (): PackLockEntry => ({
  type: "registry",
  owner: handle("@community"),
  name: extensionName("testing"),
  resolvedVersion: exactVersion("1.0.0"),
  integrity: "sha512-test",
  sourceName: "default",
  installedAt: new Date(),
  updatedAt: new Date(),
  resolvedSkills: {},
  resolvedCommands: {},
  resolvedMcpServers: {},
  resolvedSubagents: {},
});

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

        // Create pack folder on disk under an owner
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
    it.effect("returns success with not-installed message", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const result = yield* uninstallPack(makeOp("testing")).pipe(
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

        const result = yield* uninstallPack(makeOp("testing")).pipe(
          Effect.provide(makeLayer(axmDir)),
        );

        expect(result.result).toBe("success");
        if (result.result === "error") {
          throw new Error(result.message);
        }
        expect(result.artifact).toMatchObject({
          scope: "project",
          change: "removed",
        });
        expect(result.artifact?.targets).toEqual(
          expect.arrayContaining([
            { path: ".axm/extensions/@foo/packs/testing", change: "removed" },
            { path: ".axm/extensions/@bar/packs/testing", change: "removed" },
          ]),
        );
        expect(fs.existsSync(fooPackDir)).toBe(false);
        expect(fs.existsSync(barPackDir)).toBe(false);
      }),
    );
  });

  describe("pack is locked and settings removal fails", () => {
    it.effect("removes the folder and returns structured warning context", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });

        const packDir = path.join(base, ".axm", "extensions", "@community", "packs", "testing");
        fs.mkdirSync(packDir, { recursive: true });
        fs.writeFileSync(path.join(packDir, "pack.json"), "{}");

        const services = makeServices(axmDir, {
          getLockedPack: () => Effect.succeed(Option.some(makeLockedPack())),
          removePack: () =>
            Effect.fail(
              makeAppError({
                code: "internal",
                detail: "write failed",
              }),
            ),
        });

        const result = yield* uninstallPack(makeOp("testing")).pipe(Effect.provide(services.layer));

        expect(result.result).toBe("success");
        if (result.result === "error") {
          throw new Error(result.message);
        }
        expect(result.message).toContain("Pack removal from settings failed");
        expect(result.artifact).toMatchObject({
          path: ".axm/extensions/@community/packs/testing",
          scope: "project",
          version: "1.0.0",
          change: "removed",
          targets: [{ path: ".axm/extensions/@community/packs/testing", change: "removed" }],
        });
        expect(fs.existsSync(packDir)).toBe(false);
        expect(logsByTag(services.rendererState).warn).toEqual([]);
      }),
    );
  });
});
