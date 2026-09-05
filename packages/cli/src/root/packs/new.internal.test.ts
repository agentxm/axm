/**
 * Unit tests for the packs new handler.
 *
 * Tests owner resolution, manifest creation, settings registration, and error paths.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import type { Handle } from "@agentxm/extension-model/unstable/extensions";
import { PackManagerLive } from "@agentxm/extension-lifecycle/live";
import { SourceHostProvidersLive } from "@agentxm/extension-sources/live";
import { extensionName, handle, writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectAppliedPlanResult,
  expectDefined,
  expectRecord,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultUnits,
  property,
} from "../../test-helpers.js";
import { handlePacksNew, type PacksNewHandlerArgs } from "./new.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  opts: {
    owner?: string;
    packs?: Record<string, unknown>;
    agents?: string[];
  } = {},
) => {
  writeWorkspaceFiles(axmDir, {
    agents: opts.agents,
    owner: opts.owner,
    packs: opts.packs,
  });
};

const defaultArgs = (
  name: string,
  overrides: Partial<PacksNewHandlerArgs> = {},
): PacksNewHandlerArgs => ({
  name: extensionName(name),
  owner: Option.none<Handle>(),
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("packs-new.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "packs-new-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (flagsOverrides?: {
    verbose?: boolean;
    debug?: boolean;
    nonInteractive?: boolean;
  }) => {
    const ctx = makeWorkspaceHandlerTestContext({ flags: flagsOverrides });
    const sourceLayer = Layer.provide(SourceHostProvidersLive, ctx.fullLayer);
    const workspaceServiceLayer = Layer.mergeAll(ctx.fullLayer, sourceLayer);
    const fullLayer = Layer.provideMerge(PackManagerLive, workspaceServiceLayer);
    return {
      ...ctx,
      fullLayer,
      provide: makeEffectProvide(fullLayer),
    };
  };

  describe("success", () => {
    it.effect("creates pack manifest and registers in settings", () => {
      const { provide, logs, rendererState } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handlePacksNew(defaultArgs("frontend-tools"));

          // Verify manifest created
          const manifestPath = path.join(tempDir, "packs", "frontend-tools", "pack.json");
          expect(fs.existsSync(manifestPath)).toBe(true);

          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@acme");
          expect(manifest.type).toBe("pack");
          expect(manifest.name).toBe("frontend-tools");
          expect(manifest.version).toBe("0.0.1");
          expect(manifest.dependencies).toEqual({});
          expect(manifest.skills).toBeUndefined();
          expect(manifest.commands).toBeUndefined();
          expect(manifest["mcps"]).toBeUndefined();

          // Verify registered in settings
          const settingsPath = path.join(tempDir, "axm.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.packs).toBeDefined();
          expect(settings.packs["frontend-tools"]).toBe("workspace");

          const lockfile = YAML.parse(
            fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8"),
          );
          expect(lockfile.packs?.["frontend-tools"]).toBeUndefined();

          expect(logs.success).toContain("Created 1 pack");
          expect(rendererState.summaries).toContain(
            "@acme/packs/frontend-tools   0.0.1   created   1 file   packs/frontend-tools/pack.json, axm.json",
          );
          expect(rendererState.suggestions).toEqual([
            {
              description: "Edit `packs/frontend-tools/pack.json` to fill in pack contents",
            },
          ]);
          const renderedResult = expectDefined(rendererState.results[0], "Expected JSON result");
          const result = expectAppliedPlanResult(renderedResult.data, {
            planName: "New pack",
          });
          const units = planResultUnits(result);
          const firstUnit = expectRecord(expectDefined(units[0], "Expected first unit"));
          expect(property(firstUnit, "state")).toBe("committed");
          const artifact = expectRecord(property(firstUnit, "artifact"));
          expect(artifact).toMatchObject({
            path: "packs/frontend-tools",
            scope: "project",
            version: "0.0.1",
            change: "created",
            fileCount: 1,
          });
        }),
      );
    });
  });

  describe("preview mode", () => {
    it.effect("performs no writes when preview mode is active", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handlePacksNew(defaultArgs("frontend-tools", { preview: true }));

          // Manifest should NOT be created
          const manifestPath = path.join(tempDir, "packs", "frontend-tools", "pack.json");
          expect(fs.existsSync(manifestPath)).toBe(false);

          // Settings should NOT have the pack registered
          const settingsPath = path.join(tempDir, "axm.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.packs?.["frontend-tools"]).toBeUndefined();

          // Preview outcome should appear
          expect(logs.info.some((m) => m.includes("Would create 1 pack"))).toBe(true);
        }),
      );
    });
  });

  describe("owner override", () => {
    it.effect("rejects an owner override that conflicts with the workspace owner", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          const error = yield* handlePacksNew(
            defaultArgs("frontend-tools", { owner: Option.some(handle("@corp")) }),
          ).pipe(Effect.flip);
          expect(getAppError(error).code).toBe("conflict");
        }),
      );
    });

    it.effect("rejects a different normalized owner", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          const error = yield* handlePacksNew(
            defaultArgs("my-pack", { owner: Option.some(handle("@corp")) }),
          ).pipe(Effect.flip);
          expect(getAppError(error).detail).toContain("Package owner @corp");
        }),
      );
    });
  });

  describe("no owner configured", () => {
    it.effect("fails when no owner is configured and no --owner override", () => {
      const { provide } = makeLayers();
      // No owner in settings — DEFAULT_PROFILE is "@axm"
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handlePacksNew(defaultArgs("frontend-tools")).pipe(Effect.flip);
          expect(getAppError(error)).toMatchObject({
            code: "validation",
            detail: expect.stringContaining("No owner configured"),
          });
        }),
      );
    });
  });

  describe("pack already exists", () => {
    it.effect("fails when pack manifest already exists", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      // Pre-create the manifest
      const packDir = path.join(tempDir, "packs", "frontend-tools");
      fs.mkdirSync(packDir, { recursive: true });
      fs.writeFileSync(path.join(packDir, "pack.json"), "{}");

      return provide(
        Effect.gen(function* () {
          const error = yield* handlePacksNew(defaultArgs("frontend-tools")).pipe(Effect.flip);
          expect(getAppError(error).detail).toContain("already exists");
        }),
      );
    });
  });
});
