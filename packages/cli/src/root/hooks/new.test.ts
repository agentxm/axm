/**
 * Unit tests for the hooks new handler.
 *
 * Tests owner resolution, name validation, manifest creation, entrypoint,
 * settings registration, the `axm sync` suggestion, and error paths.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import type { ExtensionName } from "@agentxm/client-core/unstable/extensions";
import { extensionName, writeWorkspaceFiles } from "../../test-stubs.js";
import { getAppError, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
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
  event: "PreToolUse",
  matcher: Option.none(),
  yes: false,
  force: false,
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

  const makeLayers = () => makeWorkspaceHandlerTestContext();

  describe("success", () => {
    it.effect("creates manifest, entrypoint, settings entry, and sync hint", () => {
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
          expect(manifest.bindings).toEqual([{ event: "PreToolUse", matcher: "Write|Edit" }]);

          // Entrypoint
          const entrypointPath = path.join(hookDir(tempDir, "tool-audit"), "src", "hook.sh");
          expect(fs.existsSync(entrypointPath)).toBe(true);

          // Settings registration (authored)
          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.hooks?.["tool-audit"]).toEqual({
            source: "@acme/hooks/tool-audit",
            authored: true,
          });

          expect(logs.success.some((m) => m.includes("@acme/hooks/tool-audit"))).toBe(true);
          expect(rendererState.suggestions).toEqual([
            {
              description:
                "Edit `.axm/extensions/@acme/hooks/tool-audit/src/hook.sh` to implement the hook",
            },
            { description: "Apply changes to your workspace", cmd: "axm sync" },
          ]);
        }),
      );
    });

    it.effect("drops the matcher default for non-tool events", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleHooksNew(defaultArgs("on-start", { event: "SessionStart" }));

          const manifestPath = path.join(hookDir(tempDir, "on-start"), "hook.json");
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.bindings).toEqual([{ event: "SessionStart" }]);
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
