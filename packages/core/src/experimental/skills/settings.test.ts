import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addSkill,
  createDefaultSettings,
  ensureInitialized,
  readSettings,
  updateSettings,
  writeSettings,
} from "./settings.js";
import type { Settings, SkillSettings } from "./types.js";

describe("settings", () => {
  let tempDir: string;
  let axmDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-test-"));
    axmDir = path.join(tempDir, ".axm");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const runWithFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    Effect.runPromise(effect.pipe(Effect.provide(NodeFileSystem.layer)));

  describe("createDefaultSettings", () => {
    it("returns settings with version 1", () => {
      const settings = createDefaultSettings();
      expect(settings.version).toBe(1);
    });

    it("returns settings with empty agents array", () => {
      const settings = createDefaultSettings();
      expect(settings.agents).toEqual([]);
    });

    it("returns settings with empty skills object", () => {
      const settings = createDefaultSettings();
      expect(settings.skills).toEqual({});
    });
  });

  describe("readSettings", () => {
    it("returns SettingsNotFoundError when file does not exist", async () => {
      const result = await Effect.runPromise(
        readSettings(axmDir).pipe(Effect.either, Effect.provide(NodeFileSystem.layer)),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("SettingsNotFoundError");
      }
    });

    it("reads and parses valid settings file", async () => {
      fs.mkdirSync(axmDir, { recursive: true });
      const settings: Settings = {
        version: 1,
        agents: ["claude-code"],
        skills: {
          commit: {
            source: "github:example/skills",
            agents: ["claude-code"],
          },
        },
      };
      fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));

      const result = await runWithFileSystem(readSettings(axmDir));

      expect(result.version).toBe(1);
      expect(result.agents).toEqual(["claude-code"]);
      expect(result.skills["commit"]?.source).toBe("github:example/skills");
    });

    it("returns SettingsParseError for invalid JSON", async () => {
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(path.join(axmDir, "settings.json"), "not valid json");

      const result = await Effect.runPromise(
        readSettings(axmDir).pipe(Effect.either, Effect.provide(NodeFileSystem.layer)),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("SettingsParseError");
      }
    });
  });

  describe("writeSettings", () => {
    it("creates directory if it does not exist", async () => {
      const settings = createDefaultSettings();

      await runWithFileSystem(writeSettings(axmDir, settings));

      expect(fs.existsSync(axmDir)).toBe(true);
    });

    it("writes settings with 2-space indentation", async () => {
      const settings = createDefaultSettings();

      await runWithFileSystem(writeSettings(axmDir, settings));

      const content = fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8");
      const expected = JSON.stringify(settings, null, 2);
      expect(content).toBe(expected);
    });

    it("overwrites existing settings file", async () => {
      fs.mkdirSync(axmDir, { recursive: true });
      const oldSettings: Settings = {
        version: 1,
        agents: ["old-agent"],
        skills: {},
      };
      fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(oldSettings));

      const newSettings: Settings = {
        version: 1,
        agents: ["new-agent"],
        skills: {},
      };
      await runWithFileSystem(writeSettings(axmDir, newSettings));

      const result = await runWithFileSystem(readSettings(axmDir));
      expect(result.agents).toEqual(["new-agent"]);
    });
  });

  describe("updateSettings", () => {
    it("merges partial updates with existing settings", async () => {
      const initial: Settings = {
        version: 1,
        agents: ["claude-code"],
        skills: {
          commit: {
            source: "github:example/commit",
            agents: ["claude-code"],
          },
        },
      };
      await runWithFileSystem(writeSettings(axmDir, initial));

      const updated = await runWithFileSystem(updateSettings(axmDir, { agents: ["cursor"] }));

      expect(updated.agents).toEqual(["cursor"]);
      expect(updated.skills["commit"]).toBeDefined();
    });

    it("merges skills from update with existing skills", async () => {
      const initial: Settings = {
        version: 1,
        agents: [],
        skills: {
          commit: {
            source: "github:example/commit",
            agents: [],
          },
        },
      };
      await runWithFileSystem(writeSettings(axmDir, initial));

      const updated = await runWithFileSystem(
        updateSettings(axmDir, {
          skills: {
            "review-pr": {
              source: "github:example/review-pr",
              agents: [],
            },
          },
        }),
      );

      expect(updated.skills["commit"]).toBeDefined();
      expect(updated.skills["review-pr"]).toBeDefined();
    });

    it("preserves version unless explicitly updated", async () => {
      const initial: Settings = {
        version: 1,
        agents: [],
        skills: {},
      };
      await runWithFileSystem(writeSettings(axmDir, initial));

      const updated = await runWithFileSystem(updateSettings(axmDir, { agents: ["claude-code"] }));

      expect(updated.version).toBe(1);
    });
  });

  describe("addSkill", () => {
    it("adds a new skill to existing settings", async () => {
      const initial: Settings = {
        version: 1,
        agents: [],
        skills: {},
      };
      await runWithFileSystem(writeSettings(axmDir, initial));

      const skillSettings: SkillSettings = {
        source: "github:example/skills",
        agents: ["claude-code"],
      };
      const updated = await runWithFileSystem(addSkill(axmDir, "commit", skillSettings));

      expect(updated.skills["commit"]).toEqual(skillSettings);
    });

    it("preserves existing skills when adding new one", async () => {
      const initial: Settings = {
        version: 1,
        agents: [],
        skills: {
          "existing-skill": {
            source: "github:example/existing",
            agents: [],
          },
        },
      };
      await runWithFileSystem(writeSettings(axmDir, initial));

      const skillSettings: SkillSettings = {
        source: "github:example/new",
        agents: [],
      };
      const updated = await runWithFileSystem(addSkill(axmDir, "new-skill", skillSettings));

      expect(updated.skills["existing-skill"]).toBeDefined();
      expect(updated.skills["new-skill"]).toEqual(skillSettings);
    });

    it("updates existing skill if name matches", async () => {
      const initial: Settings = {
        version: 1,
        agents: [],
        skills: {
          commit: {
            source: "github:example/old",
            agents: [],
          },
        },
      };
      await runWithFileSystem(writeSettings(axmDir, initial));

      const newSettings: SkillSettings = {
        source: "github:example/new",
        agents: ["claude-code"],
      };
      const updated = await runWithFileSystem(addSkill(axmDir, "commit", newSettings));

      expect(updated.skills["commit"]).toEqual(newSettings);
    });
  });

  describe("ensureInitialized", () => {
    it("returns existing settings if they exist", async () => {
      const existing: Settings = {
        version: 1,
        agents: ["claude-code"],
        skills: {},
      };
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(existing));

      const result = await runWithFileSystem(ensureInitialized({ axmDir }));

      expect(result.agents).toEqual(["claude-code"]);
    });

    it("creates default settings if they do not exist", async () => {
      const result = await runWithFileSystem(ensureInitialized({ axmDir }));

      expect(result.version).toBe(1);
      expect(result.agents).toEqual([]);
      expect(result.skills).toEqual({});
    });

    it("writes default settings to disk when creating", async () => {
      await runWithFileSystem(ensureInitialized({ axmDir }));

      const exists = fs.existsSync(path.join(axmDir, "settings.json"));
      expect(exists).toBe(true);
    });

    it("returns parse error for invalid existing settings", async () => {
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(path.join(axmDir, "settings.json"), "invalid json");

      const result = await Effect.runPromise(
        ensureInitialized({ axmDir }).pipe(Effect.either, Effect.provide(NodeFileSystem.layer)),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("SettingsParseError");
      }
    });
  });
});
