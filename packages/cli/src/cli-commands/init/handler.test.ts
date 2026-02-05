/**
 * Unit tests for the init command handler.
 *
 * Tests the thin wrapper behavior:
 * - Yields WorkspaceContext (triggering initialization)
 * - Displays success message
 * - Handles already-initialized workspace
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Settings } from "../../settings/index.js";
import type { FileSystem } from "@effect/platform";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { Clack, makeClackTestLayer } from "../../clack-effect/index.js";
import { handleInit, type InitArgs } from "./handler.js";

describe("init.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "init-handler-test-"));
    // Change to temp dir so .axm is created there
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Create mock Clack service for tests
  const [TestClackLayer] = makeClackTestLayer();

  const withLayers = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Clack>) =>
    effect.pipe(Effect.provide(Layer.merge(NodeFileSystem.layer, TestClackLayer)));

  const defaultArgs: InitArgs = {
    global: false,
    agent: [],
    yes: false,
    nonInteractive: false,
  };

  // ---------------------------------------------------------------------------
  // Basic Initialization
  // ---------------------------------------------------------------------------

  describe("workspace initialization", () => {
    it.effect("creates settings.json when no existing settings", () =>
      withLayers(
        Effect.gen(function* () {
          const args: InitArgs = { ...defaultArgs, yes: true };

          yield* handleInit(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          expect(fs.existsSync(settingsPath)).toBe(true);
        }),
      ),
    );

    it.effect("creates .axm directory", () =>
      withLayers(
        Effect.gen(function* () {
          const args: InitArgs = { ...defaultArgs, yes: true };

          yield* handleInit(args);

          const axmDir = path.join(tempDir, ".axm");
          expect(fs.existsSync(axmDir)).toBe(true);
          expect(fs.statSync(axmDir).isDirectory()).toBe(true);
        }),
      ),
    );

    it.effect("creates lockfile when initializing", () =>
      withLayers(
        Effect.gen(function* () {
          const args: InitArgs = { ...defaultArgs, yes: true };

          yield* handleInit(args);

          const lockfilePath = path.join(tempDir, ".axm", "axm-lock.yaml");
          expect(fs.existsSync(lockfilePath)).toBe(true);
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Already Initialized Workspace
  // ---------------------------------------------------------------------------

  describe("already-initialized workspace", () => {
    it.effect("succeeds when workspace already initialized", () =>
      withLayers(
        Effect.gen(function* () {
          // Pre-create settings
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          const existingSettings: Settings = {
            agents: ["claude-code"],
            scope: "@community",
          };
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(existingSettings));
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

          const args: InitArgs = { ...defaultArgs, yes: true };
          yield* handleInit(args);

          // Should succeed without error
          expect(true).toBe(true);
        }),
      ),
    );

    it.effect("preserves existing settings", () =>
      withLayers(
        Effect.gen(function* () {
          // Pre-create settings with specific data
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          const existingSettings: Settings = {
            agents: ["claude-code", "cursor"],
            skills: {
              commit: "^1.0.0",
            },
            scope: "@myorg",
          };
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(existingSettings));
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

          const args: InitArgs = { ...defaultArgs, yes: true };
          yield* handleInit(args);

          // Settings should remain unchanged
          const settingsPath = path.join(axmDir, "settings.json");
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.agents).toEqual(["claude-code", "cursor"]);
          expect(settings.skills?.["commit"]).toBe("^1.0.0");
          expect(settings.scope).toBe("@myorg");
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Global Flag
  // ---------------------------------------------------------------------------

  describe("global flag", () => {
    it.effect("creates settings in home directory when --global is set", () =>
      withLayers(
        Effect.gen(function* () {
          const args: InitArgs = { ...defaultArgs, global: true, yes: true };

          // Clean up any existing global settings first
          const globalAxmDir = path.join(os.homedir(), ".axm");
          const settingsPath = path.join(globalAxmDir, "settings.json");
          const lockfilePath = path.join(globalAxmDir, "axm-lock.yaml");
          const existedBefore = fs.existsSync(settingsPath);
          let backupSettings: string | undefined;
          let backupLockfile: string | undefined;
          if (existedBefore) {
            backupSettings = fs.readFileSync(settingsPath, "utf-8");
            if (fs.existsSync(lockfilePath)) {
              backupLockfile = fs.readFileSync(lockfilePath, "utf-8");
            }
            fs.rmSync(settingsPath);
            if (fs.existsSync(lockfilePath)) {
              fs.rmSync(lockfilePath);
            }
          }

          try {
            yield* handleInit(args);

            expect(fs.existsSync(settingsPath)).toBe(true);
          } finally {
            // Restore original state
            if (existedBefore && backupSettings) {
              fs.writeFileSync(settingsPath, backupSettings);
              if (backupLockfile) {
                fs.writeFileSync(lockfilePath, backupLockfile);
              }
            } else if (!existedBefore) {
              if (fs.existsSync(settingsPath)) {
                fs.rmSync(settingsPath);
              }
              if (fs.existsSync(lockfilePath)) {
                fs.rmSync(lockfilePath);
              }
            }
          }
        }),
      ),
    );

    it.effect("does not create settings in project directory when --global is set", () =>
      withLayers(
        Effect.gen(function* () {
          const args: InitArgs = { ...defaultArgs, global: true, yes: true };

          // Backup and cleanup global settings
          const globalAxmDir = path.join(os.homedir(), ".axm");
          const globalSettingsPath = path.join(globalAxmDir, "settings.json");
          const globalLockfilePath = path.join(globalAxmDir, "axm-lock.yaml");
          const existedBefore = fs.existsSync(globalSettingsPath);
          let backupSettings: string | undefined;
          let backupLockfile: string | undefined;
          if (existedBefore) {
            backupSettings = fs.readFileSync(globalSettingsPath, "utf-8");
            if (fs.existsSync(globalLockfilePath)) {
              backupLockfile = fs.readFileSync(globalLockfilePath, "utf-8");
            }
            fs.rmSync(globalSettingsPath);
            if (fs.existsSync(globalLockfilePath)) {
              fs.rmSync(globalLockfilePath);
            }
          }

          try {
            yield* handleInit(args);

            const projectSettingsPath = path.join(tempDir, ".axm", "settings.json");
            expect(fs.existsSync(projectSettingsPath)).toBe(false);
          } finally {
            // Restore original state
            if (existedBefore && backupSettings) {
              fs.writeFileSync(globalSettingsPath, backupSettings);
              if (backupLockfile) {
                fs.writeFileSync(globalLockfilePath, backupLockfile);
              }
            } else if (!existedBefore) {
              if (fs.existsSync(globalSettingsPath)) {
                fs.rmSync(globalSettingsPath);
              }
              if (fs.existsSync(globalLockfilePath)) {
                fs.rmSync(globalLockfilePath);
              }
            }
          }
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Non-Interactive Mode
  // ---------------------------------------------------------------------------

  describe("non-interactive mode", () => {
    it.effect("fails when prompting is needed without --yes", () =>
      withLayers(
        Effect.gen(function* () {
          const args: InitArgs = {
            ...defaultArgs,
            nonInteractive: true,
            // No --yes, so prompting would be needed
          };

          const error = yield* handleInit(args).pipe(Effect.flip);

          expect(error._tag).toBe("WorkspaceInitializationError");
        }),
      ),
    );

    it.effect("succeeds when --yes is provided with --non-interactive", () =>
      withLayers(
        Effect.gen(function* () {
          const args: InitArgs = {
            ...defaultArgs,
            yes: true,
            nonInteractive: true,
          };

          yield* handleInit(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          expect(fs.existsSync(settingsPath)).toBe(true);
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  describe("error handling", () => {
    it.effect("returns error when settings file is invalid JSON", () =>
      withLayers(
        Effect.gen(function* () {
          // Pre-create invalid settings file
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "settings.json"), "not valid json {{{");
          fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

          const args: InitArgs = { ...defaultArgs, yes: true };
          const error = yield* handleInit(args).pipe(Effect.flip);

          expect(error._tag).toBe("SettingsParseError");
        }),
      ),
    );
  });
});
