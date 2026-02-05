/**
 * Unit tests for the workspace context service.
 *
 * Tests the make function:
 * - Global mode reads only global settings (fallback to {})
 * - Local mode merges settings (local overrides global)
 * - Local mode fails with WorkspaceNotInitializedError when no local settings
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Normalize path by resolving symlinks to handle macOS /var -> /private/var.
 */
const normalizePath = (p: string): string => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};
import type { Settings } from "@agentxm/core/experimental/skills";
import type { FileSystem } from "@effect/platform";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import { WorkspaceNotInitializedError } from "./errors.js";
import { make, WorkspaceContext } from "./service.js";

describe("WorkspaceContext", () => {
  let tempDir: string;
  let originalCwd: string;
  let globalAxmDir: string;
  let localAxmDir: string;

  const withFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    effect.pipe(Effect.provide(NodeFileSystem.layer));

  beforeEach(() => {
    // Save original values
    originalCwd = process.cwd();

    // Create temp directories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-context-test-"));
    const homeDir = path.join(tempDir, "home");
    const projectDir = path.join(tempDir, "project");
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });

    globalAxmDir = path.join(homeDir, ".axm");
    localAxmDir = path.join(projectDir, ".axm");

    // Change cwd and mock homedir
    process.chdir(projectDir);
    // Note: We can't mock os.homedir(), so global tests use real home directory
    // For isolation, we use the real ~/.axm for global tests (with backup/restore)
    globalAxmDir = path.join(os.homedir(), ".axm");
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("make({ global: true })", () => {
    let existedBefore: boolean;
    let backupSettings: string | undefined;

    beforeEach(() => {
      // Backup global settings if they exist
      const settingsPath = path.join(globalAxmDir, "settings.json");
      existedBefore = fs.existsSync(settingsPath);
      if (existedBefore) {
        backupSettings = fs.readFileSync(settingsPath, "utf-8");
      }
    });

    afterEach(() => {
      // Restore global settings
      const settingsPath = path.join(globalAxmDir, "settings.json");
      if (existedBefore && backupSettings) {
        fs.mkdirSync(globalAxmDir, { recursive: true });
        fs.writeFileSync(settingsPath, backupSettings);
      } else if (!existedBefore && fs.existsSync(settingsPath)) {
        fs.rmSync(settingsPath);
      }
    });

    it.effect("returns empty settings when global settings file does not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Ensure no global settings
          const settingsPath = path.join(globalAxmDir, "settings.json");
          if (fs.existsSync(settingsPath)) {
            fs.rmSync(settingsPath);
          }

          const ctx = yield* make({ global: true });

          expect(ctx.global).toBe(true);
          expect(ctx.settings).toEqual({});
          expect(ctx.path).toBe(globalAxmDir);
        }),
      ),
    );

    it.effect("returns global settings when they exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create global settings
          fs.mkdirSync(globalAxmDir, { recursive: true });
          const globalSettings: Settings = {
            scope: "@global-org",
            agents: ["claude-code"],
          };
          fs.writeFileSync(
            path.join(globalAxmDir, "settings.json"),
            JSON.stringify(globalSettings),
          );

          const ctx = yield* make({ global: true });

          expect(ctx.global).toBe(true);
          expect(ctx.settings.scope).toBe("@global-org");
          expect(ctx.settings.agents).toEqual(["claude-code"]);
          expect(ctx.path).toBe(globalAxmDir);
        }),
      ),
    );

    it.effect("does not read local settings in global mode", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Ensure no global settings
          const globalSettingsPath = path.join(globalAxmDir, "settings.json");
          if (fs.existsSync(globalSettingsPath)) {
            fs.rmSync(globalSettingsPath);
          }

          // Create local settings (should be ignored)
          fs.mkdirSync(localAxmDir, { recursive: true });
          const localSettings: Settings = {
            scope: "@local-org",
          };
          fs.writeFileSync(path.join(localAxmDir, "settings.json"), JSON.stringify(localSettings));

          const ctx = yield* make({ global: true });

          // Should not have local settings
          expect(ctx.settings).toEqual({});
          expect(ctx.settings.scope).toBeUndefined();
        }),
      ),
    );
  });

  describe("make({ global: false })", () => {
    let existedBefore: boolean;
    let backupSettings: string | undefined;

    beforeEach(() => {
      // Backup global settings if they exist
      const settingsPath = path.join(globalAxmDir, "settings.json");
      existedBefore = fs.existsSync(settingsPath);
      if (existedBefore) {
        backupSettings = fs.readFileSync(settingsPath, "utf-8");
      }
    });

    afterEach(() => {
      // Restore global settings
      const settingsPath = path.join(globalAxmDir, "settings.json");
      if (existedBefore && backupSettings) {
        fs.mkdirSync(globalAxmDir, { recursive: true });
        fs.writeFileSync(settingsPath, backupSettings);
      } else if (!existedBefore && fs.existsSync(settingsPath)) {
        fs.rmSync(settingsPath);
      }
    });

    it.effect("fails with WorkspaceNotInitializedError when local settings do not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Ensure no local settings
          if (fs.existsSync(localAxmDir)) {
            fs.rmSync(localAxmDir, { recursive: true });
          }

          const error = yield* make({ global: false }).pipe(Effect.flip);

          expect(error._tag).toBe("WorkspaceNotInitializedError");
          // Path should end with .axm in the project dir (ignore /private prefix on macOS)
          expect((error as WorkspaceNotInitializedError).path).toContain(".axm");
          expect((error as WorkspaceNotInitializedError).message).toContain("axm init");
        }),
      ),
    );

    it.effect("returns local settings when they exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Ensure no global settings
          const globalSettingsPath = path.join(globalAxmDir, "settings.json");
          if (fs.existsSync(globalSettingsPath)) {
            fs.rmSync(globalSettingsPath);
          }

          // Create local settings
          fs.mkdirSync(localAxmDir, { recursive: true });
          const localSettings: Settings = {
            scope: "@local-org",
            agents: ["cursor"],
          };
          fs.writeFileSync(path.join(localAxmDir, "settings.json"), JSON.stringify(localSettings));

          const ctx = yield* make({ global: false });

          expect(ctx.global).toBe(false);
          expect(ctx.settings.scope).toBe("@local-org");
          expect(ctx.settings.agents).toEqual(["cursor"]);
          expect(normalizePath(ctx.path)).toBe(normalizePath(localAxmDir));
        }),
      ),
    );

    it.effect("merges global and local settings (local overrides global)", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Create global settings
          fs.mkdirSync(globalAxmDir, { recursive: true });
          const globalSettings: Settings = {
            scope: "@global-org",
            agents: ["claude-code"],
          };
          fs.writeFileSync(
            path.join(globalAxmDir, "settings.json"),
            JSON.stringify(globalSettings),
          );

          // Create local settings that override some fields
          fs.mkdirSync(localAxmDir, { recursive: true });
          const localSettings: Settings = {
            scope: "@local-org",
          };
          fs.writeFileSync(path.join(localAxmDir, "settings.json"), JSON.stringify(localSettings));

          const ctx = yield* make({ global: false });

          // Local scope should override global
          expect(ctx.settings.scope).toBe("@local-org");
          // Global agents should be preserved (not overridden since not in local)
          expect(ctx.settings.agents).toEqual(["claude-code"]);
        }),
      ),
    );

    it.effect("uses empty global settings when global does not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Ensure no global settings
          const globalSettingsPath = path.join(globalAxmDir, "settings.json");
          if (fs.existsSync(globalSettingsPath)) {
            fs.rmSync(globalSettingsPath);
          }

          // Create local settings
          fs.mkdirSync(localAxmDir, { recursive: true });
          const localSettings: Settings = {
            scope: "@local-only",
          };
          fs.writeFileSync(path.join(localAxmDir, "settings.json"), JSON.stringify(localSettings));

          const ctx = yield* make({ global: false });

          expect(ctx.settings.scope).toBe("@local-only");
          expect(normalizePath(ctx.path)).toBe(normalizePath(localAxmDir));
        }),
      ),
    );
  });

  describe("WorkspaceContext.layer", () => {
    it.effect("creates layer from custom service", () => {
      const mockService = {
        global: false,
        settings: { scope: "@mock" },
        lockfile: { lockfileVersion: 1, skills: {} },
        path: "/mock/path",
      };

      return Effect.gen(function* () {
        const ctx = yield* WorkspaceContext;
        expect(ctx.global).toBe(false);
        expect(ctx.settings.scope).toBe("@mock");
        expect(ctx.path).toBe("/mock/path");
      }).pipe(Effect.provide(WorkspaceContext.layer(mockService)));
    });
  });
});
