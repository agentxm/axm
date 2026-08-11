/**
 * Unit tests for the hooks new handler.
 *
 * Tests owner resolution, name validation, manifest creation, entrypoint,
 * settings registration, eager materialization, and error paths.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import type { ExtensionName } from "@agentxm/client-core/unstable/extensions";
import { HookManagerLive } from "@agentxm/client-core/unstable/hooks";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { extensionName, writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectAppliedPlanResult,
  expectDefined,
  expectRecord,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultSteps,
} from "../../test-helpers.js";
import { handleHooksNew, type HooksNewHandlerArgs } from "./new.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (axmDir: string, opts: { owner?: string; agents?: string[] } = {}) => {
  writeWorkspaceFiles(axmDir, { agents: opts.agents, owner: opts.owner });
};

const defaultArgs = (
  name: string,
  overrides: Partial<HooksNewHandlerArgs> = {},
): HooksNewHandlerArgs => ({
  name: extensionName(name),
  owner: Option.none(),
  runtime: "bash",
  event: "tool.pre",
  matcher: Option.none(),
  yes: false,
  preview: false,
  ...overrides,
});

const hookDir = (tempDir: string, name: string, owner = "@acme") =>
  path.join(tempDir, ".axm", "extensions", owner, "hooks", name);

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("hooks-new.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-new-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: { readonly machine?: boolean }) => {
    const ctx = makeWorkspaceHandlerTestContext({ machine: opts?.machine });
    const sourceLayer = Layer.provide(SourceHostProvidersLive, ctx.fullLayer);
    const workspaceServiceLayer = Layer.mergeAll(ctx.fullLayer, sourceLayer);
    const fullLayer = Layer.provideMerge(HookManagerLive, workspaceServiceLayer);
    return {
      ...ctx,
      fullLayer,
      provide: makeEffectProvide(fullLayer),
    };
  };

  describe("success", () => {
    it.effect("creates manifest, entrypoint, settings entry, and materialized hook config", () => {
      const { provide, logs, rendererState } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleHooksNew(defaultArgs("tool-audit"));

          // Manifest
          const manifestPath = path.join(hookDir(tempDir, "tool-audit"), "hook.json");
          expect(fs.existsSync(manifestPath)).toBe(true);
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@acme");
          expect(manifest.type).toBe("hook");
          expect(manifest.name).toBe("tool-audit");
          expect(manifest.runtime).toBe("bash");
          expect(manifest.entrypoint).toBe("src/hook.sh");
          expect(manifest.bindings).toEqual([{ on: "tool.pre", matcherRaw: "Write|Edit" }]);

          // Entrypoint
          const entrypointPath = path.join(hookDir(tempDir, "tool-audit"), "src", "hook.sh");
          expect(fs.existsSync(entrypointPath)).toBe(true);

          // Settings registration (workspace source)
          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.hooks?.["tool-audit"]).toBe("workspace:@acme/hooks/tool-audit");

          const lockfile = fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8");
          expect(lockfile).toContain("tool-audit:");
          expect(lockfile).toContain("type: workspace");
          expect(lockfile).toContain("version: 0.1.0");

          const claudeSettingsPath = path.join(tempDir, ".claude", "settings.json");
          expect(fs.existsSync(claudeSettingsPath)).toBe(true);
          const claudeSettings = fs.readFileSync(claudeSettingsPath, "utf-8");
          expect(claudeSettings).toContain(".axm/extensions/@acme/hooks/tool-audit/src/hook.sh");

          expect(logs.success.some((m) => m.includes("@acme/hooks/tool-audit"))).toBe(true);
          expect(rendererState.suggestions).toEqual([
            {
              description:
                "Edit `.axm/extensions/@acme/hooks/tool-audit/src/hook.sh` to implement the hook",
            },
          ]);
        }),
      );
    });

    it.effect("emits scaffold plan JSON with artifact in machine mode", () => {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleHooksNew(defaultArgs("machine-hook"));

          expect(logs.success).toEqual([
            "  + @acme/hooks/machine-hook",
            "Created hooks package @acme/hooks/machine-hook with 2 targets",
          ]);
          const renderedResult = expectDefined(rendererState.results[0], "Expected JSON result");
          const result = expectAppliedPlanResult(renderedResult.data, {
            planName: "New hook",
          });
          const steps = planResultSteps(result);
          const firstStep = expectRecord(expectDefined(steps[0], "Expected first step"));
          expect(firstStep).toMatchObject({
            label: "@acme/hooks/machine-hook",
            status: "applied",
            message: "Created hook @acme/hooks/machine-hook",
            artifact: {
              path: ".axm/extensions/@acme/hooks/machine-hook",
              scope: "project",
              version: "0.1.0",
              change: "created",
              fileCount: 2,
              targets: [
                {
                  path: ".claude/settings.json",
                  change: "created",
                },
                {
                  path: "AGENTS.md",
                  change: "created",
                },
              ],
            },
          });
          expect(rendererState.suggestions).toEqual([
            {
              description:
                "Edit `.axm/extensions/@acme/hooks/machine-hook/src/hook.sh` to implement the hook",
            },
          ]);
        }),
      );
    });

    it.effect("drops the matcher default for non-tool events", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleHooksNew(defaultArgs("on-start", { event: "session.start" }));

          const manifestPath = path.join(hookDir(tempDir, "on-start"), "hook.json");
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.bindings).toEqual([{ on: "session.start" }]);
        }),
      );
    });
  });

  describe("owner override", () => {
    it.effect("uses --owner override and normalizes a bare handle", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleHooksNew(defaultArgs("tool-audit", { owner: Option.some("corp") }));

          const manifestPath = path.join(hookDir(tempDir, "tool-audit", "@corp"), "hook.json");
          expect(fs.existsSync(manifestPath)).toBe(true);
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@corp");
        }),
      );
    });
  });

  describe("no owner configured", () => {
    it.effect("fails when no owner is configured and no --owner override", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleHooksNew(defaultArgs("tool-audit")).pipe(Effect.flip);
          expect(getAppError(error).detail).toContain("No owner configured");
        }),
      );
    });
  });

  describe("name validation", () => {
    it.effect("rejects an uppercase name", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleHooksNew({
            ...defaultArgs("valid"),
            name: "BadHook" as ExtensionName,
          }).pipe(Effect.flip);
          expect(getAppError(error).code).toBe("validation");
        }),
      );
    });
  });

  describe("hook already exists", () => {
    it.effect("fails when the hook is already configured", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleHooksNew(defaultArgs("tool-audit"));
          const error = yield* handleHooksNew(defaultArgs("tool-audit")).pipe(Effect.flip);
          expect(getAppError(error).code).toBe("conflict");
        }),
      );
    });
  });

  describe("preview mode", () => {
    it.effect("performs no writes when preview mode is active", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleHooksNew(defaultArgs("tool-audit", { preview: true }));

          const manifestPath = path.join(hookDir(tempDir, "tool-audit"), "hook.json");
          expect(fs.existsSync(manifestPath)).toBe(false);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.hooks?.["tool-audit"]).toBeUndefined();
        }),
      );
    });
  });
});
