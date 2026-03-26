/**
 * Unit tests for the packs new handler.
 *
 * Tests profile resolution, manifest creation, settings registration, and error paths.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { writeWorkspaceFiles } from "../../../workspace/test-stubs.js";
import { getAppError, makeWorkspaceHandlerTestContext } from "../../../test-helpers.js";
import { handlePacksNew, type PacksNewHandlerArgs } from "./handler.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  opts: {
    profile?: string;
    packs?: Record<string, unknown>;
    agents?: string[];
  } = {},
) => {
  writeWorkspaceFiles(axmDir, {
    agents: opts.agents,
    profile: opts.profile,
    packs: opts.packs,
  });
};

const defaultArgs = (
  name: string,
  overrides: Partial<PacksNewHandlerArgs> = {},
): PacksNewHandlerArgs => ({
  name,
  profile: Option.none(),
  yes: false,
  force: false,
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

  const makeLayers = (
    flagsOverrides?: Partial<import("@axm.sh/core/unstable/cli-flags").CliEnvironmentService>,
  ) => makeWorkspaceHandlerTestContext({ flags: flagsOverrides });

  describe("success", () => {
    it.effect("creates pack manifest and registers in settings", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

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
            "axm-pack.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);

          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.profile).toBe("@acme");
          expect(manifest.type).toBe("pack");
          expect(manifest.name).toBe("frontend-tools");
          expect(manifest.version).toBe("0.0.1");
          expect(manifest.skills).toEqual({});
          expect(manifest.commands).toEqual({});
          expect(manifest["mcp-servers"]).toEqual({});

          // Verify registered in settings
          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.packs).toBeDefined();
          expect(settings.packs["frontend-tools"]).toBe("@acme/packs/frontend-tools");

          expect(logs.success.some((m) => m.includes("@acme/packs/frontend-tools"))).toBe(true);
        }),
      );
    });
  });

  describe("preview mode", () => {
    it.effect("performs no writes when preview mode is active", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

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
            "axm-pack.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(false);

          // Settings should NOT have the pack registered
          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.packs?.["frontend-tools"]).toBeUndefined();

          // Preview log message should appear
          expect(logs.info.some((m) => m.includes("Previewing"))).toBe(true);
        }),
      );
    });
  });

  describe("profile override", () => {
    it.effect("uses --profile override instead of workspace profile", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handlePacksNew(defaultArgs("frontend-tools", { profile: Option.some("@corp") }));

          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@corp",
            "packs",
            "frontend-tools",
            "axm-pack.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);

          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.profile).toBe("@corp");
          expect(manifest.type).toBe("pack");
          expect(manifest.name).toBe("frontend-tools");
        }),
      );
    });

    it.effect("normalizes profile without @ prefix", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handlePacksNew(defaultArgs("my-pack", { profile: Option.some("corp") }));

          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@corp",
            "packs",
            "my-pack",
            "axm-pack.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);

          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.profile).toBe("@corp");
          expect(manifest.type).toBe("pack");
          expect(manifest.name).toBe("my-pack");
        }),
      );
    });
  });

  describe("no profile configured", () => {
    it.effect("fails when no profile is configured and no --profile override", () => {
      const { provide } = makeLayers();
      // No profile in settings — DEFAULT_PROFILE is "@axm"
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handlePacksNew(defaultArgs("frontend-tools")).pipe(Effect.flip);
          expect(getAppError(error).what).toContain("No profile configured");
        }),
      );
    });
  });

  describe("pack already exists", () => {
    it.effect("fails when pack manifest already exists", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      // Pre-create the manifest
      const packDir = path.join(tempDir, ".axm", "extensions", "@acme", "packs", "frontend-tools");
      fs.mkdirSync(packDir, { recursive: true });
      fs.writeFileSync(path.join(packDir, "axm-pack.json"), "{}");

      return provide(
        Effect.gen(function* () {
          const error = yield* handlePacksNew(defaultArgs("frontend-tools")).pipe(Effect.flip);
          expect(getAppError(error).what).toContain("already exists");
        }),
      );
    });
  });
});
