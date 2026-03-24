/**
 * Unit tests for the packs new handler.
 *
 * Tests namespace resolution, manifest creation, settings registration, and error paths.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { makeOutputTestLayer } from "../../../output/index.js";
import { makeInputTestLayer } from "../../../input/index.js";
import { CliFlagsTest } from "../../../cli-flags/index.js";
import { CliEnvConfig } from "../../../config/index.js";
import { TelemetryClientTest } from "../../../telemetry/index.js";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "../../../workspace/index.js";
import { type AppError } from "../../../app-error/index.js";
import { handlePacksNew, type PacksNewHandlerArgs } from "./handler.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  opts: {
    namespace?: string;
    packs?: Record<string, unknown>;
    agents?: string[];
  } = {},
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = {
    agents: opts.agents ?? ["claude-code"],
    ...(opts.namespace && { namespace: opts.namespace }),
    ...(opts.packs && { packs: opts.packs }),
  };
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: {} }),
  );
};

const defaultArgs = (
  name: string,
  overrides: Partial<PacksNewHandlerArgs> = {},
): PacksNewHandlerArgs => ({
  name,
  namespace: Option.none(),
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
    flagsOverrides?: Partial<import("../../../cli-flags/index.js").CliFlagsService>,
  ) => {
    const [outputLayer, mockLog] = makeOutputTestLayer();
    const [inputLayer] = makeInputTestLayer();
    const BaseLayer = Layer.mergeAll(
      NodeServices.layer,
      outputLayer,
      inputLayer,
      CliFlagsTest(flagsOverrides),
      TelemetryClientTest,
      CliEnvConfig.testDefaults,
    );
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
      agents: Option.none(),
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog };
  };

  describe("success", () => {
    it.effect("creates pack manifest and registers in settings", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { namespace: "@acme" });

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
          expect(manifest.namespace).toBe("@acme");
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

          expect(mockLog.logs.success.some((m) => m.includes("@acme/packs/frontend-tools"))).toBe(
            true,
          );
        }),
      );
    });
  });

  describe("preview mode", () => {
    it.effect("performs no writes when preview mode is active", () => {
      const { provide, mockLog } = makeLayers({ preview: true, yes: false });
      initWorkspace(path.join(tempDir, ".axm"), { namespace: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handlePacksNew(defaultArgs("frontend-tools"));

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
          expect(mockLog.logs.info.some((m) => m.includes("Previewing"))).toBe(true);
        }),
      );
    });
  });

  describe("namespace override", () => {
    it.effect("uses --namespace override instead of workspace namespace", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { namespace: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handlePacksNew(defaultArgs("frontend-tools", { namespace: Option.some("@corp") }));

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
          expect(manifest.namespace).toBe("@corp");
          expect(manifest.type).toBe("pack");
          expect(manifest.name).toBe("frontend-tools");
        }),
      );
    });

    it.effect("normalizes namespace without @ prefix", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { namespace: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handlePacksNew(defaultArgs("my-pack", { namespace: Option.some("corp") }));

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
          expect(manifest.namespace).toBe("@corp");
          expect(manifest.type).toBe("pack");
          expect(manifest.name).toBe("my-pack");
        }),
      );
    });
  });

  describe("no namespace configured", () => {
    it.effect("fails when no namespace is configured and no --namespace override", () => {
      const { provide } = makeLayers();
      // No namespace in settings — DEFAULT_NAMESPACE is "@axm"
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handlePacksNew(defaultArgs("frontend-tools")).pipe(Effect.flip);
          expect(error._tag).toBe("AppError");
          expect((error as AppError).what).toContain("No namespace configured");
        }),
      );
    });
  });

  describe("pack already exists", () => {
    it.effect("fails when pack manifest already exists", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { namespace: "@acme" });

      // Pre-create the manifest
      const packDir = path.join(tempDir, ".axm", "extensions", "@acme", "packs", "frontend-tools");
      fs.mkdirSync(packDir, { recursive: true });
      fs.writeFileSync(path.join(packDir, "axm-pack.json"), "{}");

      return provide(
        Effect.gen(function* () {
          const error = yield* handlePacksNew(defaultArgs("frontend-tools")).pipe(Effect.flip);
          expect(error._tag).toBe("AppError");
          expect((error as AppError).what).toContain("already exists");
        }),
      );
    });
  });
});
