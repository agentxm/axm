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
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import type { ClackService } from "../clack-effect/service.js";
import { InteractionContext } from "../interaction-context/service.js";
import { WorkspaceInitializationError } from "./errors.js";
import { make, WorkspaceContext } from "./service.js";

/**
 * Mock ClackService for testing.
 */
const mockClackService: ClackService = {
  intro: () => Effect.void,
  outro: () => Effect.void,
  log: {
    info: () => Effect.void,
    warn: () => Effect.void,
    error: () => Effect.void,
    success: () => Effect.void,
    message: () => Effect.void,
  },
  confirm: () => Effect.succeed(true),
  select: <T>(_msg: string, items: readonly T[]) => Effect.succeed(items[0] as T),
  multiselect: <T>(_msg: string, items: readonly T[]) => Effect.succeed(items),
  spinner: () => Effect.succeed({ start: () => {}, stop: () => {} }),
};

/**
 * Mock InteractionContext layer for testing.
 */
const MockInteractionContext = InteractionContext.layer({ p: mockClackService });

describe("WorkspaceContext", () => {
  let tempDir: string;
  let originalCwd: string;
  let globalAxmDir: string;
  let localAxmDir: string;

  const TestLayer = Layer.merge(NodeFileSystem.layer, MockInteractionContext);

  const withTestLayer = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem | InteractionContext>,
  ) => effect.pipe(Effect.provide(TestLayer));

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

  describe("make({ global: true, yes: false, nonInteractive: false })", () => {
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
      withTestLayer(
        Effect.gen(function* () {
          // Ensure no global settings
          const settingsPath = path.join(globalAxmDir, "settings.json");
          if (fs.existsSync(settingsPath)) {
            fs.rmSync(settingsPath);
          }

          const ctx = yield* make({ global: true, yes: false, nonInteractive: false });

          expect(ctx.global).toBe(true);
          expect(ctx.settings).toEqual({});
          expect(ctx.path).toBe(globalAxmDir);
        }),
      ),
    );

    it.effect("returns global settings when they exist", () =>
      withTestLayer(
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

          const ctx = yield* make({ global: true, yes: false, nonInteractive: false });

          expect(ctx.global).toBe(true);
          expect(ctx.settings.scope).toBe("@global-org");
          expect(ctx.settings.agents).toEqual(["claude-code"]);
          expect(ctx.path).toBe(globalAxmDir);
        }),
      ),
    );

    it.effect("does not read local settings in global mode", () =>
      withTestLayer(
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

          const ctx = yield* make({ global: true, yes: false, nonInteractive: false });

          // Should not have local settings
          expect(ctx.settings).toEqual({});
          expect(ctx.settings.scope).toBeUndefined();
        }),
      ),
    );
  });

  describe("global workspace auto-initialization", () => {
    let existedBefore: boolean;
    let backupSettings: string | undefined;
    let existedLockfileBefore: boolean;
    let backupLockfile: string | undefined;

    beforeEach(() => {
      // Backup global settings if they exist
      const settingsPath = path.join(globalAxmDir, "settings.json");
      existedBefore = fs.existsSync(settingsPath);
      if (existedBefore) {
        backupSettings = fs.readFileSync(settingsPath, "utf-8");
      }

      // Backup global lockfile if it exists
      const lockfilePath = path.join(globalAxmDir, "axm-lock.yaml");
      existedLockfileBefore = fs.existsSync(lockfilePath);
      if (existedLockfileBefore) {
        backupLockfile = fs.readFileSync(lockfilePath, "utf-8");
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

      // Restore global lockfile
      const lockfilePath = path.join(globalAxmDir, "axm-lock.yaml");
      if (existedLockfileBefore && backupLockfile) {
        fs.mkdirSync(globalAxmDir, { recursive: true });
        fs.writeFileSync(lockfilePath, backupLockfile);
      } else if (!existedLockfileBefore && fs.existsSync(lockfilePath)) {
        fs.rmSync(lockfilePath);
      }
    });

    it.effect("creates settings.json with {} when global=true and file is missing", () =>
      withTestLayer(
        Effect.gen(function* () {
          // Ensure no global settings
          const settingsPath = path.join(globalAxmDir, "settings.json");
          if (fs.existsSync(settingsPath)) {
            fs.rmSync(settingsPath);
          }

          // Ensure lockfile exists so we isolate the settings test
          const lockfilePath = path.join(globalAxmDir, "axm-lock.yaml");
          fs.mkdirSync(globalAxmDir, { recursive: true });
          fs.writeFileSync(lockfilePath, "lockfileVersion: 1\nskills: {}\n");

          yield* make({ global: true, yes: false, nonInteractive: false });

          // Verify settings.json was created
          expect(fs.existsSync(settingsPath)).toBe(true);
          const content = fs.readFileSync(settingsPath, "utf-8");
          expect(JSON.parse(content)).toEqual({});
        }),
      ),
    );

    it.effect("creates axm-lock.yaml with version 1 when global=true and file is missing", () =>
      withTestLayer(
        Effect.gen(function* () {
          // Ensure no global lockfile
          const lockfilePath = path.join(globalAxmDir, "axm-lock.yaml");
          if (fs.existsSync(lockfilePath)) {
            fs.rmSync(lockfilePath);
          }

          // Ensure settings exists so we isolate the lockfile test
          const settingsPath = path.join(globalAxmDir, "settings.json");
          fs.mkdirSync(globalAxmDir, { recursive: true });
          fs.writeFileSync(settingsPath, "{}");

          yield* make({ global: true, yes: false, nonInteractive: false });

          // Verify axm-lock.yaml was created
          expect(fs.existsSync(lockfilePath)).toBe(true);
          const content = fs.readFileSync(lockfilePath, "utf-8");
          expect(content).toContain("lockfileVersion: 1");
          expect(content).toContain("skills:");
        }),
      ),
    );

    it.effect("creates both files when global=true and neither exists", () =>
      withTestLayer(
        Effect.gen(function* () {
          // Remove entire .axm directory
          if (fs.existsSync(globalAxmDir)) {
            fs.rmSync(globalAxmDir, { recursive: true });
          }

          yield* make({ global: true, yes: false, nonInteractive: false });

          // Verify both files were created
          const settingsPath = path.join(globalAxmDir, "settings.json");
          const lockfilePath = path.join(globalAxmDir, "axm-lock.yaml");

          expect(fs.existsSync(settingsPath)).toBe(true);
          expect(fs.existsSync(lockfilePath)).toBe(true);

          const settingsContent = fs.readFileSync(settingsPath, "utf-8");
          expect(JSON.parse(settingsContent)).toEqual({});

          const lockfileContent = fs.readFileSync(lockfilePath, "utf-8");
          expect(lockfileContent).toContain("lockfileVersion: 1");
        }),
      ),
    );

    it.effect("does not modify existing files when both exist", () =>
      withTestLayer(
        Effect.gen(function* () {
          // Create existing files with custom content
          fs.mkdirSync(globalAxmDir, { recursive: true });

          const settingsPath = path.join(globalAxmDir, "settings.json");
          const existingSettings: Settings = { scope: "@existing-scope" };
          fs.writeFileSync(settingsPath, JSON.stringify(existingSettings));

          const lockfilePath = path.join(globalAxmDir, "axm-lock.yaml");
          const existingLockfileContent = `lockfileVersion: 1
skills:
  existing-skill:
    source: local
    path: /test/path
    agents:
      - claude-code
    installedAt: "2024-01-01T00:00:00.000Z"
    updatedAt: "2024-01-01T00:00:00.000Z"
`;
          fs.writeFileSync(lockfilePath, existingLockfileContent);

          const ctx = yield* make({ global: true, yes: false, nonInteractive: false });

          // Verify files were not modified
          const settingsContent = fs.readFileSync(settingsPath, "utf-8");
          expect(JSON.parse(settingsContent)).toEqual(existingSettings);
          expect(ctx.settings.scope).toBe("@existing-scope");

          const lockfileContent = fs.readFileSync(lockfilePath, "utf-8");
          expect(lockfileContent).toContain("existing-skill");
          expect(ctx.lockfile.skills["existing-skill"]).toBeDefined();
        }),
      ),
    );

    it.effect("creates ~/.axm directory if it does not exist", () =>
      withTestLayer(
        Effect.gen(function* () {
          // Remove entire .axm directory
          if (fs.existsSync(globalAxmDir)) {
            fs.rmSync(globalAxmDir, { recursive: true });
          }

          yield* make({ global: true, yes: false, nonInteractive: false });

          // Verify directory was created
          expect(fs.existsSync(globalAxmDir)).toBe(true);
          expect(fs.statSync(globalAxmDir).isDirectory()).toBe(true);
        }),
      ),
    );
  });

  describe("make({ global: false, yes: false, nonInteractive: false })", () => {
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

    it.effect("auto-initializes workspace when local settings do not exist (interactive)", () =>
      withTestLayer(
        Effect.gen(function* () {
          // Ensure no local settings
          if (fs.existsSync(localAxmDir)) {
            fs.rmSync(localAxmDir, { recursive: true });
          }

          // Ensure global settings/lockfile exist so global read works
          fs.mkdirSync(globalAxmDir, { recursive: true });
          fs.writeFileSync(path.join(globalAxmDir, "settings.json"), "{}");
          fs.writeFileSync(
            path.join(globalAxmDir, "axm-lock.yaml"),
            "lockfileVersion: 1\nskills: {}\n",
          );

          // With mock InteractionContext, make() should auto-initialize
          const ctx = yield* make({ global: false, yes: false, nonInteractive: false });

          expect(ctx.global).toBe(false);
          expect(normalizePath(ctx.path)).toBe(normalizePath(localAxmDir));

          // Verify settings.json was created
          const settingsPath = path.join(localAxmDir, "settings.json");
          expect(fs.existsSync(settingsPath)).toBe(true);
        }),
      ),
    );

    it.effect("returns local settings when they exist", () =>
      withTestLayer(
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

          const ctx = yield* make({ global: false, yes: false, nonInteractive: false });

          expect(ctx.global).toBe(false);
          expect(ctx.settings.scope).toBe("@local-org");
          expect(ctx.settings.agents).toEqual(["cursor"]);
          expect(normalizePath(ctx.path)).toBe(normalizePath(localAxmDir));
        }),
      ),
    );

    it.effect("merges global and local settings (local overrides global)", () =>
      withTestLayer(
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

          const ctx = yield* make({ global: false, yes: false, nonInteractive: false });

          // Local scope should override global
          expect(ctx.settings.scope).toBe("@local-org");
          // Global agents should be preserved (not overridden since not in local)
          expect(ctx.settings.agents).toEqual(["claude-code"]);
        }),
      ),
    );

    it.effect("uses empty global settings when global does not exist", () =>
      withTestLayer(
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

          const ctx = yield* make({ global: false, yes: false, nonInteractive: false });

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

  describe("project workspace initialization", () => {
    let existedBefore: boolean;
    let backupSettings: string | undefined;
    let existedLockfileBefore: boolean;
    let backupLockfile: string | undefined;

    beforeEach(() => {
      // Backup global settings if they exist
      const settingsPath = path.join(globalAxmDir, "settings.json");
      existedBefore = fs.existsSync(settingsPath);
      if (existedBefore) {
        backupSettings = fs.readFileSync(settingsPath, "utf-8");
      }

      // Backup global lockfile if it exists
      const lockfilePath = path.join(globalAxmDir, "axm-lock.yaml");
      existedLockfileBefore = fs.existsSync(lockfilePath);
      if (existedLockfileBefore) {
        backupLockfile = fs.readFileSync(lockfilePath, "utf-8");
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

      // Restore global lockfile
      const lockfilePath = path.join(globalAxmDir, "axm-lock.yaml");
      if (existedLockfileBefore && backupLockfile) {
        fs.mkdirSync(globalAxmDir, { recursive: true });
        fs.writeFileSync(lockfilePath, backupLockfile);
      } else if (!existedLockfileBefore && fs.existsSync(lockfilePath)) {
        fs.rmSync(lockfilePath);
      }
    });

    it.effect(
      "initializes project workspace with yes=true (auto-selects all detected agents)",
      () =>
        withTestLayer(
          Effect.gen(function* () {
            // Ensure no local settings exist
            if (fs.existsSync(localAxmDir)) {
              fs.rmSync(localAxmDir, { recursive: true });
            }

            // Create global settings/lockfile so global read works
            fs.mkdirSync(globalAxmDir, { recursive: true });
            fs.writeFileSync(path.join(globalAxmDir, "settings.json"), "{}");
            fs.writeFileSync(
              path.join(globalAxmDir, "axm-lock.yaml"),
              "lockfileVersion: 1\nskills: {}\n",
            );

            const ctx = yield* make({ global: false, yes: true, nonInteractive: false });

            // Should have initialized the workspace
            expect(ctx.global).toBe(false);
            expect(normalizePath(ctx.path)).toBe(normalizePath(localAxmDir));

            // Verify settings.json was created
            const settingsPath = path.join(localAxmDir, "settings.json");
            expect(fs.existsSync(settingsPath)).toBe(true);

            // Verify axm-lock.yaml was created
            const lockfilePath = path.join(localAxmDir, "axm-lock.yaml");
            expect(fs.existsSync(lockfilePath)).toBe(true);
          }),
        ),
    );

    it.effect(
      "fails with WorkspaceInitializationError when nonInteractive=true and agents detected",
      () =>
        withTestLayer(
          Effect.gen(function* () {
            // Ensure no local settings exist
            if (fs.existsSync(localAxmDir)) {
              fs.rmSync(localAxmDir, { recursive: true });
            }

            // Create global settings/lockfile so global read works
            fs.mkdirSync(globalAxmDir, { recursive: true });
            fs.writeFileSync(path.join(globalAxmDir, "settings.json"), "{}");
            fs.writeFileSync(
              path.join(globalAxmDir, "axm-lock.yaml"),
              "lockfileVersion: 1\nskills: {}\n",
            );

            const error = yield* make({ global: false, yes: false, nonInteractive: true }).pipe(
              Effect.flip,
            );

            expect(error._tag).toBe("WorkspaceInitializationError");
            expect((error as WorkspaceInitializationError).message).toContain("non-interactive");
          }),
        ),
    );

    it.effect("creates settings.json with detected agents when yes=true", () =>
      withTestLayer(
        Effect.gen(function* () {
          // Ensure no local settings exist
          if (fs.existsSync(localAxmDir)) {
            fs.rmSync(localAxmDir, { recursive: true });
          }

          // Create global settings/lockfile so global read works
          fs.mkdirSync(globalAxmDir, { recursive: true });
          fs.writeFileSync(path.join(globalAxmDir, "settings.json"), "{}");
          fs.writeFileSync(
            path.join(globalAxmDir, "axm-lock.yaml"),
            "lockfileVersion: 1\nskills: {}\n",
          );

          yield* make({ global: false, yes: true, nonInteractive: false });

          // Verify settings.json was created with agents array
          const settingsPath = path.join(localAxmDir, "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          // agents should be an array (may be empty if no agents detected)
          expect(Array.isArray(settings.agents)).toBe(true);
        }),
      ),
    );

    it.effect("creates axm-lock.yaml after project initialization", () =>
      withTestLayer(
        Effect.gen(function* () {
          // Ensure no local settings exist
          if (fs.existsSync(localAxmDir)) {
            fs.rmSync(localAxmDir, { recursive: true });
          }

          // Create global settings/lockfile so global read works
          fs.mkdirSync(globalAxmDir, { recursive: true });
          fs.writeFileSync(path.join(globalAxmDir, "settings.json"), "{}");
          fs.writeFileSync(
            path.join(globalAxmDir, "axm-lock.yaml"),
            "lockfileVersion: 1\nskills: {}\n",
          );

          yield* make({ global: false, yes: true, nonInteractive: false });

          // Verify axm-lock.yaml was created
          const lockfilePath = path.join(localAxmDir, "axm-lock.yaml");
          expect(fs.existsSync(lockfilePath)).toBe(true);
          const content = fs.readFileSync(lockfilePath, "utf-8");
          expect(content).toContain("lockfileVersion: 1");
        }),
      ),
    );
  });
});
