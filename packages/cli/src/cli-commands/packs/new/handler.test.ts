/**
 * Unit tests for the packs new handler.
 *
 * Tests scope resolution, manifest creation, settings registration, and error paths.
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
} from "../../../tui/index.js";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "../../../workspace/index.js";
import { type CliError } from "../../../cli-error/index.js";
import { handlePacksNew, type PacksNewHandlerArgs } from "./handler.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  opts: {
    scope?: string;
    packs?: Record<string, unknown>;
    agents?: string[];
  } = {},
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = {
    agents: opts.agents ?? ["claude-code"],
    ...(opts.scope && { scope: opts.scope }),
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
  scope: Option.none(),
  yes: true,
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

  const makeLayers = (wsOverrides?: Partial<WorkspaceContextOptions>) => {
    const [logLayer, mockLog] = makeLogTestLayer();
    const [confirmLayer] = makeConfirmTestLayer();
    const [selectLayer] = makeSelectTestLayer();
    const [multiselectLayer] = makeMultiselectTestLayer();
    const BaseLayer = Layer.mergeAll(
      NodeContext.layer,
      logLayer,
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
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog };
  };

  describe("success", () => {
    it.effect("creates pack manifest and registers in settings", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { scope: "@acme" });

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
          expect(manifest.name).toBe("@acme/frontend-tools");
          expect(manifest.version).toBe("0.0.1");
          expect(manifest.skills).toEqual({});
          expect(manifest.commands).toEqual({});
          expect(manifest["mcp-servers"]).toEqual({});

          // Verify registered in settings
          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.packs).toBeDefined();
          expect(settings.packs["frontend-tools"]).toBe("@acme/frontend-tools");

          expect(mockLog.logs.success.some((m) => m.includes("@acme/frontend-tools"))).toBe(true);
        }),
      );
    });
  });

  describe("scope override", () => {
    it.effect("uses --scope override instead of workspace scope", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { scope: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handlePacksNew(defaultArgs("frontend-tools", { scope: Option.some("@corp") }));

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
          expect(manifest.name).toBe("@corp/frontend-tools");
        }),
      );
    });

    it.effect("normalizes scope without @ prefix", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { scope: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handlePacksNew(defaultArgs("my-pack", { scope: Option.some("corp") }));

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
          expect(manifest.name).toBe("@corp/my-pack");
        }),
      );
    });
  });

  describe("no scope configured", () => {
    it.effect("fails when no scope is configured and no --scope override", () => {
      const { provide } = makeLayers();
      // No scope in settings — DEFAULT_SCOPE is "@axm"
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handlePacksNew(defaultArgs("frontend-tools")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("No scope configured");
        }),
      );
    });
  });

  describe("pack already exists", () => {
    it.effect("fails when pack manifest already exists", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { scope: "@acme" });

      // Pre-create the manifest
      const packDir = path.join(tempDir, ".axm", "extensions", "@acme", "packs", "frontend-tools");
      fs.mkdirSync(packDir, { recursive: true });
      fs.writeFileSync(path.join(packDir, "axm-pack.json"), "{}");

      return provide(
        Effect.gen(function* () {
          const error = yield* handlePacksNew(defaultArgs("frontend-tools")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("already exists");
        }),
      );
    });
  });
});
