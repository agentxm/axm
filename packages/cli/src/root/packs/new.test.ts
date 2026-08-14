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
import type { Handle } from "@agentxm/client-core/unstable/extensions";
import { PackManagerLive } from "@agentxm/client-core/unstable/packs";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { extensionName, handle, writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectAppliedPlanResult,
  expectDefined,
  expectRecord,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultSteps,
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
  yes: false,
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
          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "packs",
            "frontend-tools",
            "pack.json",
          );
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
          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.packs).toBeDefined();
          expect(settings.packs["frontend-tools"]).toBe("workspace:@acme/packs/frontend-tools");

          const lockfile = YAML.parse(
            fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8"),
          );
          expect(lockfile.packs?.["frontend-tools"]).toBeUndefined();

          expect(logs.success.some((m) => m.includes("@acme/packs/frontend-tools"))).toBe(true);
          expect(rendererState.summaries).toContain(
            "-> .axm/extensions/@acme/packs/frontend-tools/pack.json   0.0.1 | 1 file",
          );
          expect(rendererState.suggestions).toEqual([
            {
              description:
                "Edit `.axm/extensions/@acme/packs/frontend-tools/pack.json` to fill in pack contents",
            },
          ]);
          const renderedResult = expectDefined(rendererState.results[0], "Expected JSON result");
          const result = expectAppliedPlanResult(renderedResult.data, {
            planName: "New pack",
          });
          const steps = planResultSteps(result);
          const firstStep = expectRecord(expectDefined(steps[0], "Expected first step"));
          const artifact = expectRecord(property(firstStep, "artifact"));
          expect(artifact).toMatchObject({
            path: ".axm/extensions/@acme/packs/frontend-tools/pack.json",
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
          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "packs",
            "frontend-tools",
            "pack.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(false);

          // Settings should NOT have the pack registered
          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.packs?.["frontend-tools"]).toBeUndefined();

          // Preview outcome should appear
          expect(logs.info.some((m) => m.includes("Would create 1 pack"))).toBe(true);
        }),
      );
    });
  });

  describe("owner override", () => {
    it.effect("uses --owner override instead of workspace owner", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handlePacksNew(
            defaultArgs("frontend-tools", { owner: Option.some(handle("@corp")) }),
          );

          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@corp",
            "packs",
            "frontend-tools",
            "pack.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);

          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@corp");
          expect(manifest.type).toBe("pack");
          expect(manifest.name).toBe("frontend-tools");
        }),
      );
    });

    it.effect("normalizes owner without @ prefix", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handlePacksNew(defaultArgs("my-pack", { owner: Option.some(handle("@corp")) }));

          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@corp",
            "packs",
            "my-pack",
            "pack.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);

          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@corp");
          expect(manifest.type).toBe("pack");
          expect(manifest.name).toBe("my-pack");
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
          expect(getAppError(error).detail).toContain("No owner configured");
        }),
      );
    });
  });

  describe("pack already exists", () => {
    it.effect("fails when pack manifest already exists", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      // Pre-create the manifest
      const packDir = path.join(tempDir, ".axm", "extensions", "@acme", "packs", "frontend-tools");
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
