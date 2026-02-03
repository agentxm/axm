/**
 * Unit tests for the init command handler.
 *
 * Tests the state-based initialization flow:
 * - New workspace (Add)
 * - Already initialized (Unchanged)
 * - Force re-initialization (Update)
 * - Dry-run mode
 * - Invalid workspace state
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Settings } from "@agentxm/core/experimental/skills";
import type { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, beforeEach, vi } from "vitest";
import * as tty from "../../utils/tty.js";
import { handleInit, type InitArgs, type InitError } from "./handler.js";

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

  const withFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    effect.pipe(Effect.provide(NodeFileSystem.layer));

  const defaultArgs: InitArgs = {
    global: false,
    agent: [],
    yes: false,
    force: false,
    dryRun: false,
  };

  // ---------------------------------------------------------------------------
  // New Workspace (Add) - First-time initialization
  // ---------------------------------------------------------------------------

  describe("new workspace initialization (Add)", () => {
    it.effect("creates settings.json when no existing settings", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = { ...defaultArgs, yes: true };

          yield* handleInit(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          expect(fs.existsSync(settingsPath)).toBe(true);
        }),
      ),
    );

    it.effect("creates .axm directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = { ...defaultArgs, yes: true };

          yield* handleInit(args);

          const axmDir = path.join(tempDir, ".axm");
          expect(fs.existsSync(axmDir)).toBe(true);
          expect(fs.statSync(axmDir).isDirectory()).toBe(true);
        }),
      ),
    );

    it.effect("includes @community scope in settings", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = { ...defaultArgs, yes: true };

          yield* handleInit(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.scope).toBe("@community");
        }),
      ),
    );

    it.effect("includes detected agents in settings when --yes is used", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = { ...defaultArgs, yes: true };

          yield* handleInit(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          // Should have at least an array (may have agents if they're installed on the system)
          expect(Array.isArray(settings.agents)).toBe(true);
        }),
      ),
    );

    it.effect("writes settings as formatted JSON", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = {
            ...defaultArgs,
            agent: ["claude-code"],
          };

          yield* handleInit(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const content = fs.readFileSync(settingsPath, "utf-8");
          // Check that it's formatted (has newlines and indentation)
          expect(content).toContain("\n");
          expect(content).toMatch(/^\{\n/);
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Already Initialized (Unchanged) - Settings exist, no --force
  // ---------------------------------------------------------------------------

  describe("already-initialized case (Unchanged)", () => {
    it.effect("does not error when settings already exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Pre-create settings
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          const existingSettings: Settings = {
            agents: ["claude-code"],
            skills: {},
            scope: "@community",
          };
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(existingSettings));

          const args: InitArgs = { ...defaultArgs, yes: true };
          yield* handleInit(args);

          // Should succeed without error (reaching here means success)
          expect(true).toBe(true);
        }),
      ),
    );

    it.effect("preserves existing settings when already initialized", () =>
      withFileSystem(
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
          } as Settings;
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(existingSettings));

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

    it.live("does not modify settings file timestamp when already initialized", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Pre-create settings
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          const settingsPath = path.join(axmDir, "settings.json");
          const existingSettings: Settings = {
            agents: ["claude-code"],
            skills: {},
            scope: "@community",
          };
          fs.writeFileSync(settingsPath, JSON.stringify(existingSettings));

          // Get the initial modification time
          const statBefore = fs.statSync(settingsPath);

          // Wait a bit to ensure any write would have a different timestamp
          yield* Effect.sleep(10);

          const args: InitArgs = { ...defaultArgs, yes: true };
          yield* handleInit(args);

          // File should not have been modified
          const statAfter = fs.statSync(settingsPath);
          expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Force Re-initialization (Update) - Settings exist with --force
  // ---------------------------------------------------------------------------

  describe("force re-initialization (Update)", () => {
    it.effect("overwrites settings when --force is used", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Pre-create settings with specific agents
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          const existingSettings: Settings = {
            agents: ["claude-code"],
            skills: {},
            scope: "@myorg",
          };
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(existingSettings));

          // Re-init with different agents and force
          const args: InitArgs = {
            ...defaultArgs,
            agent: ["cursor", "windsurf"],
            force: true,
          };
          yield* handleInit(args);

          // Settings should be updated
          const settingsPath = path.join(axmDir, "settings.json");
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.agents).toEqual(["cursor", "windsurf"]);
          // Scope should be reset to @community when not preserving
          expect(settings.scope).toBe("@community");
        }),
      ),
    );

    it.effect("preserves existing skills when --force is used", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Pre-create settings with skills
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          const existingSettings: Settings = {
            agents: ["claude-code"],
            skills: {
              commit: "^1.0.0",
              "review-pr": "*",
            },
            scope: "@community",
          };
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(existingSettings));

          // Re-init with force
          const args: InitArgs = {
            ...defaultArgs,
            agent: ["cursor"],
            force: true,
          };
          yield* handleInit(args);

          // Skills should be preserved
          const settingsPath = path.join(axmDir, "settings.json");
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.skills?.["commit"]).toBe("^1.0.0");
          expect(settings.skills?.["review-pr"]).toBe("*");
        }),
      ),
    );

    it.live("modifies settings file timestamp when --force is used", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Pre-create settings
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          const settingsPath = path.join(axmDir, "settings.json");
          const existingSettings: Settings = {
            agents: ["claude-code"],
            skills: {},
            scope: "@community",
          };
          fs.writeFileSync(settingsPath, JSON.stringify(existingSettings));

          // Get the initial modification time
          const statBefore = fs.statSync(settingsPath);

          // Wait a bit to ensure timestamp will be different
          yield* Effect.sleep(10);

          const args: InitArgs = { ...defaultArgs, agent: ["cursor"], force: true };
          yield* handleInit(args);

          // File should have been modified
          const statAfter = fs.statSync(settingsPath);
          expect(statAfter.mtimeMs).toBeGreaterThan(statBefore.mtimeMs);
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Dry-Run Mode
  // ---------------------------------------------------------------------------

  describe("dry-run mode", () => {
    it.effect("does not create settings.json with --dry-run", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = { ...defaultArgs, yes: true, dryRun: true };

          yield* handleInit(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          expect(fs.existsSync(settingsPath)).toBe(false);
        }),
      ),
    );

    it.effect("does not modify existing settings with --dry-run --force", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Pre-create settings
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          const existingSettings: Settings = {
            agents: ["claude-code"],
            skills: {},
            scope: "@myorg",
          };
          const settingsPath = path.join(axmDir, "settings.json");
          fs.writeFileSync(settingsPath, JSON.stringify(existingSettings));

          const args: InitArgs = { ...defaultArgs, agent: ["cursor"], force: true, dryRun: true };
          yield* handleInit(args);

          // Settings should remain unchanged
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.agents).toEqual(["claude-code"]);
          expect(settings.scope).toBe("@myorg");
        }),
      ),
    );

    it.effect("succeeds with --dry-run for already initialized workspace", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Pre-create settings
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          const existingSettings: Settings = {
            agents: ["claude-code"],
            skills: {},
            scope: "@community",
          };
          fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(existingSettings));

          const args: InitArgs = { ...defaultArgs, yes: true, dryRun: true };
          yield* handleInit(args);

          // Should succeed without error
          expect(true).toBe(true);
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Invalid Workspace State
  // ---------------------------------------------------------------------------

  describe("invalid workspace state", () => {
    it.effect("returns InitError when settings file is invalid JSON", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Pre-create invalid settings file
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(path.join(axmDir, "settings.json"), "not valid json {{{");

          const args: InitArgs = { ...defaultArgs, yes: true };
          const error = yield* handleInit(args).pipe(Effect.flip);

          expect(error._tag).toBe("InitError");
          expect((error as InitError).message).toContain("invalid");
        }),
      ),
    );

    it.effect("returns InitError when settings file fails schema validation", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Pre-create settings with invalid schema
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          // agents should be an array, not a string
          fs.writeFileSync(
            path.join(axmDir, "settings.json"),
            JSON.stringify({ agents: "invalid", scope: 123 }),
          );

          const args: InitArgs = { ...defaultArgs, yes: true };
          const error = yield* handleInit(args).pipe(Effect.flip);

          expect(error._tag).toBe("InitError");
          expect((error as InitError).message).toContain("invalid");
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Explicit --agent flag
  // ---------------------------------------------------------------------------

  describe("explicit --agent flag with valid agent IDs", () => {
    it.effect("creates settings with specified agents", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = {
            ...defaultArgs,
            agent: ["claude-code", "cursor"],
          };

          yield* handleInit(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.agents).toEqual(["claude-code", "cursor"]);
        }),
      ),
    );

    it.effect("creates settings with a single agent", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = {
            ...defaultArgs,
            agent: ["claude-code"],
          };

          yield* handleInit(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.agents).toEqual(["claude-code"]);
        }),
      ),
    );

    it.effect("uses specified agents without requiring --yes flag", () =>
      withFileSystem(
        Effect.gen(function* () {
          // --agent should work without --yes (no prompts needed)
          const args: InitArgs = {
            ...defaultArgs,
            agent: ["windsurf"],
          };

          yield* handleInit(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.agents).toEqual(["windsurf"]);
        }),
      ),
    );

    it.effect("accepts multiple agents via --agent flag", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = {
            ...defaultArgs,
            agent: ["claude-code", "cursor", "codex"],
          };

          yield* handleInit(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.agents).toEqual(["claude-code", "cursor", "codex"]);
        }),
      ),
    );
  });

  describe("explicit --agent flag with invalid agent ID", () => {
    it.effect("returns InitError for unknown agent ID", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = {
            ...defaultArgs,
            agent: ["nonexistent-agent"],
          };

          const error = yield* handleInit(args).pipe(Effect.flip);

          expect(error._tag).toBe("InitError");
          expect((error as InitError).message).toContain("Unknown agent(s)");
          expect((error as InitError).message).toContain("nonexistent-agent");
        }),
      ),
    );

    it.effect("returns InitError listing all invalid agents", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = {
            ...defaultArgs,
            agent: ["valid-nope", "also-invalid"],
          };

          const error = yield* handleInit(args).pipe(Effect.flip);

          const errorMessage = (error as InitError).message;
          expect(errorMessage).toContain("valid-nope");
          expect(errorMessage).toContain("also-invalid");
        }),
      ),
    );

    it.effect("returns InitError when mixing valid and invalid agents", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = {
            ...defaultArgs,
            agent: ["claude-code", "invalid-agent"],
          };

          const error = yield* handleInit(args).pipe(Effect.flip);

          expect(error._tag).toBe("InitError");
          expect((error as InitError).message).toContain("invalid-agent");
          // The error message lists invalid agents, not valid ones (though valid ones may appear in help text)
          expect((error as InitError).message).toMatch(/Unknown agent\(s\): invalid-agent/);
        }),
      ),
    );

    it.effect("does not create settings file when validation fails", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = {
            ...defaultArgs,
            agent: ["nonexistent-agent"],
          };

          yield* handleInit(args).pipe(Effect.flip);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          expect(fs.existsSync(settingsPath)).toBe(false);
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Global flag
  // ---------------------------------------------------------------------------

  describe("global flag", () => {
    // Note: Cannot mock os.homedir() directly as it's non-configurable.
    // These tests verify the global flag works with the real home directory.
    // We use --agent to skip detection, ensuring predictable behavior.

    it.effect("creates settings in home directory when --global is set", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = {
            ...defaultArgs,
            global: true,
            agent: ["claude-code"],
          };

          // Clean up any existing global settings first
          const globalAxmDir = path.join(os.homedir(), ".axm");
          const settingsPath = path.join(globalAxmDir, "settings.json");
          const existedBefore = fs.existsSync(settingsPath);
          let backupSettings: string | undefined;
          if (existedBefore) {
            backupSettings = fs.readFileSync(settingsPath, "utf-8");
            fs.rmSync(settingsPath);
          }

          try {
            yield* handleInit(args);

            expect(fs.existsSync(settingsPath)).toBe(true);
            const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
            expect(settings.agents).toEqual(["claude-code"]);
          } finally {
            // Restore original state
            if (existedBefore && backupSettings) {
              fs.writeFileSync(settingsPath, backupSettings);
            } else if (!existedBefore && fs.existsSync(settingsPath)) {
              fs.rmSync(settingsPath);
            }
          }
        }),
      ),
    );

    it.effect("does not create settings in project directory when --global is set", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = {
            ...defaultArgs,
            global: true,
            agent: ["cursor"],
          };

          // Backup and cleanup global settings
          const globalAxmDir = path.join(os.homedir(), ".axm");
          const globalSettingsPath = path.join(globalAxmDir, "settings.json");
          const existedBefore = fs.existsSync(globalSettingsPath);
          let backupSettings: string | undefined;
          if (existedBefore) {
            backupSettings = fs.readFileSync(globalSettingsPath, "utf-8");
            fs.rmSync(globalSettingsPath);
          }

          try {
            yield* handleInit(args);

            const projectSettingsPath = path.join(tempDir, ".axm", "settings.json");
            expect(fs.existsSync(projectSettingsPath)).toBe(false);
          } finally {
            // Restore original state
            if (existedBefore && backupSettings) {
              fs.writeFileSync(globalSettingsPath, backupSettings);
            } else if (!existedBefore && fs.existsSync(globalSettingsPath)) {
              fs.rmSync(globalSettingsPath);
            }
          }
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Settings structure
  // ---------------------------------------------------------------------------

  describe("settings structure", () => {
    it.effect("creates settings without skills field (undefined)", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = {
            ...defaultArgs,
            agent: ["claude-code"],
          };

          yield* handleInit(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.skills).toBeUndefined();
        }),
      ),
    );

    it.effect("creates valid JSON that matches Settings schema", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = {
            ...defaultArgs,
            agent: ["claude-code", "cursor"],
          };

          yield* handleInit(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

          // Verify agents field exists (skills is optional)
          expect(Array.isArray(settings.agents)).toBe(true);
          expect(settings.skills === undefined || typeof settings.skills === "object").toBe(true);
          expect(settings.scope).toBe("@community");
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe("error handling", () => {
    it.effect("returns InitError with descriptive message for unknown agents", () =>
      withFileSystem(
        Effect.gen(function* () {
          const args: InitArgs = {
            ...defaultArgs,
            agent: ["xyz-unknown"],
          };

          const error = yield* handleInit(args).pipe(Effect.flip);

          expect(error._tag).toBe("InitError");
          // Error should suggest valid alternatives
          expect((error as InitError).message).toContain("Valid agents include:");
          // Error should include recovery guidance
          expect((error as InitError).message).toContain("axm init --help");
        }),
      ),
    );

    it.effect("gracefully handles already-initialized state without error", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Initialize first
          const args1: InitArgs = {
            ...defaultArgs,
            agent: ["claude-code"],
          };
          yield* handleInit(args1);

          // Try to initialize again
          const args2: InitArgs = {
            ...defaultArgs,
            agent: ["cursor"],
          };
          yield* handleInit(args2);

          // Should succeed (early return for already initialized)
          expect(true).toBe(true);
        }),
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Non-TTY scenarios
  // ---------------------------------------------------------------------------

  describe("non-TTY scenarios", () => {
    describe("when stdin is not a TTY (non-interactive)", () => {
      beforeEach(() => {
        vi.spyOn(tty, "isInteractive").mockReturnValue(false);
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it.effect("returns InitError when prompting is needed without --yes", () =>
        withFileSystem(
          Effect.gen(function* () {
            const args: InitArgs = {
              ...defaultArgs,
              // No --yes, no --agent, so prompting would be needed
            };

            const error = yield* handleInit(args).pipe(Effect.flip);

            expect(error._tag).toBe("InitError");
            expect((error as InitError).message).toContain("stdin is not a TTY");
            expect((error as InitError).message).toContain("--yes");
            expect((error as InitError).message).toContain("--non-interactive");
          }),
        ),
      );

      it.effect("succeeds when --yes is provided", () =>
        withFileSystem(
          Effect.gen(function* () {
            const args: InitArgs = {
              ...defaultArgs,
              yes: true,
            };

            yield* handleInit(args);

            const settingsPath = path.join(tempDir, ".axm", "settings.json");
            expect(fs.existsSync(settingsPath)).toBe(true);
          }),
        ),
      );

      it.effect("succeeds when --non-interactive is provided", () =>
        withFileSystem(
          Effect.gen(function* () {
            const args: InitArgs = {
              ...defaultArgs,
              nonInteractive: true,
            };

            yield* handleInit(args);

            const settingsPath = path.join(tempDir, ".axm", "settings.json");
            expect(fs.existsSync(settingsPath)).toBe(true);
          }),
        ),
      );

      it.effect("succeeds when --agent is provided (no prompting needed)", () =>
        withFileSystem(
          Effect.gen(function* () {
            const args: InitArgs = {
              ...defaultArgs,
              agent: ["claude-code"],
            };

            yield* handleInit(args);

            const settingsPath = path.join(tempDir, ".axm", "settings.json");
            expect(fs.existsSync(settingsPath)).toBe(true);
            const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
            expect(settings.agents).toEqual(["claude-code"]);
          }),
        ),
      );
    });

    describe("when stdout is not a TTY (non-fancy output)", () => {
      beforeEach(() => {
        vi.spyOn(tty, "isFancyOutput").mockReturnValue(false);
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it.effect("succeeds without errors when spinner would normally be used", () =>
        withFileSystem(
          Effect.gen(function* () {
            const args: InitArgs = {
              ...defaultArgs,
              yes: true,
            };

            yield* handleInit(args);

            // Should succeed - plain text logging used instead of spinner
            const settingsPath = path.join(tempDir, ".axm", "settings.json");
            expect(fs.existsSync(settingsPath)).toBe(true);
          }),
        ),
      );

      it.effect("creates settings file correctly without fancy output", () =>
        withFileSystem(
          Effect.gen(function* () {
            const args: InitArgs = {
              ...defaultArgs,
              agent: ["claude-code", "cursor"],
            };

            yield* handleInit(args);

            const settingsPath = path.join(tempDir, ".axm", "settings.json");
            const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
            expect(settings.agents).toEqual(["claude-code", "cursor"]);
            expect(settings.skills).toBeUndefined();
          }),
        ),
      );
    });
  });
});
