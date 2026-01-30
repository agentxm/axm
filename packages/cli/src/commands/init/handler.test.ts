/**
 * Unit tests for the init command handler.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Settings } from "@agentxm/core/experimental/skills";
import type { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  const runHandler = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    Effect.runPromise(effect.pipe(Effect.provide(NodeFileSystem.layer)));

  const runHandlerEither = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    Effect.runPromise(effect.pipe(Effect.either, Effect.provide(NodeFileSystem.layer)));

  const defaultArgs: InitArgs = {
    global: false,
    agent: [],
    yes: false,
  };

  describe("first-time initialization with --yes flag", () => {
    it("creates settings.json when no existing settings", async () => {
      const args: InitArgs = { ...defaultArgs, yes: true };

      await runHandler(handleInit(args));

      const settingsPath = path.join(tempDir, ".axm", "settings.json");
      expect(fs.existsSync(settingsPath)).toBe(true);
    });

    it("creates settings with version 1", async () => {
      const args: InitArgs = { ...defaultArgs, yes: true };

      await runHandler(handleInit(args));

      const settingsPath = path.join(tempDir, ".axm", "settings.json");
      const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.version).toBe(1);
    });

    it("creates .axm directory", async () => {
      const args: InitArgs = { ...defaultArgs, yes: true };

      await runHandler(handleInit(args));

      const axmDir = path.join(tempDir, ".axm");
      expect(fs.existsSync(axmDir)).toBe(true);
      expect(fs.statSync(axmDir).isDirectory()).toBe(true);
    });

    it("includes detected agents in settings when --yes is used", async () => {
      const args: InitArgs = { ...defaultArgs, yes: true };

      await runHandler(handleInit(args));

      const settingsPath = path.join(tempDir, ".axm", "settings.json");
      const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      // Should have at least an array (may have agents if they're installed on the system)
      expect(Array.isArray(settings.agents)).toBe(true);
    });
  });

  describe("already-initialized case", () => {
    it("does not error when settings already exist", async () => {
      // Pre-create settings
      const axmDir = path.join(tempDir, ".axm");
      fs.mkdirSync(axmDir, { recursive: true });
      const existingSettings: Settings = {
        version: 1,
        agents: ["claude-code"],
        skills: {},
      };
      fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(existingSettings));

      const args: InitArgs = { ...defaultArgs, yes: true };
      const result = await runHandlerEither(handleInit(args));

      // Should succeed without error
      expect(result._tag).toBe("Right");
    });

    it("preserves existing settings when already initialized", async () => {
      // Pre-create settings with specific data
      const axmDir = path.join(tempDir, ".axm");
      fs.mkdirSync(axmDir, { recursive: true });
      const existingSettings: Settings = {
        version: 1,
        agents: ["claude-code", "cursor"],
        skills: {
          commit: {
            source: "github:example/skills",
            agents: ["claude-code"],
          },
        },
      };
      fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(existingSettings));

      const args: InitArgs = { ...defaultArgs, yes: true };
      await runHandler(handleInit(args));

      // Settings should remain unchanged
      const settingsPath = path.join(axmDir, "settings.json");
      const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.agents).toEqual(["claude-code", "cursor"]);
      expect(settings.skills["commit"]?.source).toBe("github:example/skills");
    });

    it("does not modify settings file timestamp when already initialized", async () => {
      // Pre-create settings
      const axmDir = path.join(tempDir, ".axm");
      fs.mkdirSync(axmDir, { recursive: true });
      const settingsPath = path.join(axmDir, "settings.json");
      const existingSettings: Settings = {
        version: 1,
        agents: ["claude-code"],
        skills: {},
      };
      fs.writeFileSync(settingsPath, JSON.stringify(existingSettings));

      // Get the initial modification time
      const statBefore = fs.statSync(settingsPath);

      // Wait a bit to ensure any write would have a different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const args: InitArgs = { ...defaultArgs, yes: true };
      await runHandler(handleInit(args));

      // File should not have been modified
      const statAfter = fs.statSync(settingsPath);
      expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);
    });
  });

  describe("explicit --agent flag with valid agent IDs", () => {
    it("creates settings with specified agents", async () => {
      const args: InitArgs = {
        ...defaultArgs,
        agent: ["claude-code", "cursor"],
      };

      await runHandler(handleInit(args));

      const settingsPath = path.join(tempDir, ".axm", "settings.json");
      const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.agents).toEqual(["claude-code", "cursor"]);
    });

    it("creates settings with a single agent", async () => {
      const args: InitArgs = {
        ...defaultArgs,
        agent: ["claude-code"],
      };

      await runHandler(handleInit(args));

      const settingsPath = path.join(tempDir, ".axm", "settings.json");
      const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.agents).toEqual(["claude-code"]);
    });

    it("uses specified agents without requiring --yes flag", async () => {
      // --agent should work without --yes (no prompts needed)
      const args: InitArgs = {
        ...defaultArgs,
        agent: ["windsurf"],
      };

      const result = await runHandlerEither(handleInit(args));

      expect(result._tag).toBe("Right");
      const settingsPath = path.join(tempDir, ".axm", "settings.json");
      const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.agents).toEqual(["windsurf"]);
    });

    it("accepts multiple agents via --agent flag", async () => {
      const args: InitArgs = {
        ...defaultArgs,
        agent: ["claude-code", "cursor", "codex"],
      };

      await runHandler(handleInit(args));

      const settingsPath = path.join(tempDir, ".axm", "settings.json");
      const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.agents).toEqual(["claude-code", "cursor", "codex"]);
    });
  });

  describe("explicit --agent flag with invalid agent ID", () => {
    it("returns InitError for unknown agent ID", async () => {
      const args: InitArgs = {
        ...defaultArgs,
        agent: ["nonexistent-agent"],
      };

      const result = await runHandlerEither(handleInit(args));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("InitError");
        expect((result.left as InitError).message).toContain("Unknown agent(s)");
        expect((result.left as InitError).message).toContain("nonexistent-agent");
      }
    });

    it("returns InitError listing all invalid agents", async () => {
      const args: InitArgs = {
        ...defaultArgs,
        agent: ["valid-nope", "also-invalid"],
      };

      const result = await runHandlerEither(handleInit(args));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        const errorMessage = (result.left as InitError).message;
        expect(errorMessage).toContain("valid-nope");
        expect(errorMessage).toContain("also-invalid");
      }
    });

    it("returns InitError when mixing valid and invalid agents", async () => {
      const args: InitArgs = {
        ...defaultArgs,
        agent: ["claude-code", "invalid-agent"],
      };

      const result = await runHandlerEither(handleInit(args));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("InitError");
        expect((result.left as InitError).message).toContain("invalid-agent");
        // The error message lists invalid agents, not valid ones (though valid ones may appear in help text)
        expect((result.left as InitError).message).toMatch(/Unknown agent\(s\): invalid-agent/);
      }
    });

    it("does not create settings file when validation fails", async () => {
      const args: InitArgs = {
        ...defaultArgs,
        agent: ["nonexistent-agent"],
      };

      await runHandlerEither(handleInit(args));

      const settingsPath = path.join(tempDir, ".axm", "settings.json");
      expect(fs.existsSync(settingsPath)).toBe(false);
    });
  });

  describe("global flag", () => {
    // Note: Cannot mock os.homedir() directly as it's non-configurable.
    // These tests verify the global flag works with the real home directory.
    // We use --agent to skip detection, ensuring predictable behavior.

    it("creates settings in home directory when --global is set", async () => {
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
        await runHandler(handleInit(args));

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
    });

    it("does not create settings in project directory when --global is set", async () => {
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
        await runHandler(handleInit(args));

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
    });
  });

  describe("settings structure", () => {
    it("creates settings with empty skills object", async () => {
      const args: InitArgs = {
        ...defaultArgs,
        agent: ["claude-code"],
      };

      await runHandler(handleInit(args));

      const settingsPath = path.join(tempDir, ".axm", "settings.json");
      const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.skills).toEqual({});
    });

    it("writes settings as formatted JSON", async () => {
      const args: InitArgs = {
        ...defaultArgs,
        agent: ["claude-code"],
      };

      await runHandler(handleInit(args));

      const settingsPath = path.join(tempDir, ".axm", "settings.json");
      const content = fs.readFileSync(settingsPath, "utf-8");
      // Check that it's formatted (has newlines and indentation)
      expect(content).toContain("\n");
      expect(content).toMatch(/^\{\n/);
    });

    it("creates valid JSON that matches Settings schema", async () => {
      const args: InitArgs = {
        ...defaultArgs,
        agent: ["claude-code", "cursor"],
      };

      await runHandler(handleInit(args));

      const settingsPath = path.join(tempDir, ".axm", "settings.json");
      const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

      // Verify all required fields exist
      expect(typeof settings.version).toBe("number");
      expect(Array.isArray(settings.agents)).toBe(true);
      expect(typeof settings.skills).toBe("object");
      expect(settings.skills).not.toBeNull();
    });
  });

  describe("error handling", () => {
    it("returns InitError with descriptive message for unknown agents", async () => {
      const args: InitArgs = {
        ...defaultArgs,
        agent: ["xyz-unknown"],
      };

      const result = await runHandlerEither(handleInit(args));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        const error = result.left as InitError;
        expect(error._tag).toBe("InitError");
        // Error should suggest valid alternatives
        expect(error.message).toContain("Valid agents include:");
        // Error should include recovery guidance
        expect(error.message).toContain("axm init --help");
      }
    });

    it("gracefully handles already-initialized state without error", async () => {
      // Initialize first
      const args1: InitArgs = {
        ...defaultArgs,
        agent: ["claude-code"],
      };
      await runHandler(handleInit(args1));

      // Try to initialize again
      const args2: InitArgs = {
        ...defaultArgs,
        agent: ["cursor"],
      };
      const result = await runHandlerEither(handleInit(args2));

      // Should succeed (early return for already initialized)
      expect(result._tag).toBe("Right");
    });
  });

  describe("non-TTY scenarios", () => {
    describe("when stdin is not a TTY (non-interactive)", () => {
      beforeEach(() => {
        vi.spyOn(tty, "isInteractive").mockReturnValue(false);
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it("returns InitError when prompting is needed without --yes", async () => {
        const args: InitArgs = {
          ...defaultArgs,
          // No --yes, no --agent, so prompting would be needed
        };

        const result = await runHandlerEither(handleInit(args));

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          const error = result.left as InitError;
          expect(error._tag).toBe("InitError");
          expect(error.message).toContain("stdin is not a TTY");
          expect(error.message).toContain("--yes");
          expect(error.message).toContain("--non-interactive");
        }
      });

      it("succeeds when --yes is provided", async () => {
        const args: InitArgs = {
          ...defaultArgs,
          yes: true,
        };

        const result = await runHandlerEither(handleInit(args));

        expect(result._tag).toBe("Right");
        const settingsPath = path.join(tempDir, ".axm", "settings.json");
        expect(fs.existsSync(settingsPath)).toBe(true);
      });

      it("succeeds when --non-interactive is provided", async () => {
        const args: InitArgs = {
          ...defaultArgs,
          nonInteractive: true,
        };

        const result = await runHandlerEither(handleInit(args));

        expect(result._tag).toBe("Right");
        const settingsPath = path.join(tempDir, ".axm", "settings.json");
        expect(fs.existsSync(settingsPath)).toBe(true);
      });

      it("succeeds when --agent is provided (no prompting needed)", async () => {
        const args: InitArgs = {
          ...defaultArgs,
          agent: ["claude-code"],
        };

        const result = await runHandlerEither(handleInit(args));

        expect(result._tag).toBe("Right");
        const settingsPath = path.join(tempDir, ".axm", "settings.json");
        expect(fs.existsSync(settingsPath)).toBe(true);
        const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.agents).toEqual(["claude-code"]);
      });
    });

    describe("when stdout is not a TTY (non-fancy output)", () => {
      beforeEach(() => {
        vi.spyOn(tty, "isFancyOutput").mockReturnValue(false);
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it("succeeds without errors when spinner would normally be used", async () => {
        const args: InitArgs = {
          ...defaultArgs,
          yes: true,
        };

        const result = await runHandlerEither(handleInit(args));

        // Should succeed - plain text logging used instead of spinner
        expect(result._tag).toBe("Right");
        const settingsPath = path.join(tempDir, ".axm", "settings.json");
        expect(fs.existsSync(settingsPath)).toBe(true);
      });

      it("creates settings file correctly without fancy output", async () => {
        const args: InitArgs = {
          ...defaultArgs,
          agent: ["claude-code", "cursor"],
        };

        await runHandler(handleInit(args));

        const settingsPath = path.join(tempDir, ".axm", "settings.json");
        const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.agents).toEqual(["claude-code", "cursor"]);
        expect(settings.version).toBe(1);
      });
    });
  });
});
